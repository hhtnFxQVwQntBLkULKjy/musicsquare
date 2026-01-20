class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.playlist = [];
        this.historyStack = []; // Stack for previous tracks
        this.currentIndex = -1;
        this.isPlaying = false;
        this.mode = 'list'; // list, single, shuffle
        this.lyrics = [];
        this.lyricIndex = -1;
        this.loadingTimer = null;
        this._lastErrorTime = 0; // 报错截流

        // Audio Effects State
        this.audioCtx = null;
        this.effectMode = 'original';
        this.isAudioContextConnected = false;

        // Ensure CORS for audio context processing
        this.audio.crossOrigin = "anonymous";

        this.initAudioContext();
        this.setupAudioEvents();
        this.bindControls();
    }

    setupAudioEvents() {
        this.audio.addEventListener('timeupdate', () => {
            if (UI.updateProgress) UI.updateProgress(this.audio.currentTime, this.audio.duration);
            this.updateLyrics(this.audio.currentTime);
        });

        this.audio.addEventListener('ended', () => {
            this.playNext(true); // Auto next
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            if (this.audioCtx && this.audioCtx.state === 'suspended') {
                this.audioCtx.resume();
            }
            if (UI.updatePlayState) UI.updatePlayState(true);
        });

        this.audio.addEventListener('playing', () => {
            // 当声音真正出来时，立即清除加载提示
            if (this.loadingTimer) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            UI.clearLoadingToasts();
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            // 情况异常时也要清除提示
            if (this.loadingTimer) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            UI.clearLoadingToasts();
            if (UI.updatePlayState) UI.updatePlayState(false);
        });

        // Combined error handler
        this.audio.addEventListener('error', async (e) => {
            console.error("Audio error", e);
            if (this.loadingTimer) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            UI.clearLoadingToasts();

            // 报错截流：2.5秒内不重复弹窗
            const now = Date.now();
            if (now - this._lastErrorTime > 2500) {
                UI.hideLoadingLock(); // 报错前先关闭遮罩，确保互斥
                UI.showToast('该歌曲暂无法提供播放，欢迎您到正版音乐平台收听或下载。', 'error');
                this._lastErrorTime = now;
            } else {
                UI.hideLoadingLock();
            }

            // Auto-retry logic for expired URLs
            if (this.currentTrack && !this.currentTrack._retried) {
                this.currentTrack._retried = true;
                console.log("Retrying playback with fresh URL...", this.currentTrack.title);
                try {
                    this.currentTrack.url = null;
                    const detail = await MusicAPI.getSongDetails(this.currentTrack);
                    if (detail && detail.url) {
                        this.currentTrack.url = detail.url;
                        this.audio.src = detail.url;
                        this.audio.play();
                        return;
                    }
                } catch (err) { console.error("Retry failed", err); }
            }
        });
    }

    bindControls() {
        document.getElementById('play-btn').addEventListener('click', () => this.togglePlay());
        document.getElementById('prev-btn').addEventListener('click', () => this.playPrev());
        document.getElementById('next-btn').addEventListener('click', () => this.playNext());

        const modeBtn = document.getElementById('mode-btn');
        modeBtn.addEventListener('click', () => {
            if (this.mode === 'list') {
                this.mode = 'shuffle';
                modeBtn.innerHTML = '<i class="fas fa-random"></i>';
                modeBtn.title = '随机播放';
            } else if (this.mode === 'shuffle') {
                this.mode = 'single';
                modeBtn.innerHTML = '<i class="fas fa-redo-alt"></i>';
                modeBtn.title = '单曲循环';
            } else {
                this.mode = 'list';
                modeBtn.innerHTML = '<i class="fas fa-retweet"></i>';
                modeBtn.title = '列表循环';
            }
        });

        const volSlider = document.getElementById('vol-slider');
        const volIcon = document.getElementById('vol-icon');
        let lastVol = 0.8;

        volSlider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            this.audio.volume = val;
            updateVolIcon(val);
        });

        volIcon.addEventListener('click', () => {
            if (this.audio.volume > 0) {
                lastVol = this.audio.volume;
                this.audio.volume = 0;
                volSlider.value = 0;
            } else {
                this.audio.volume = lastVol || 0.5;
                volSlider.value = this.audio.volume;
            }
            updateVolIcon(this.audio.volume);
        });

        function updateVolIcon(val) {
            if (val === 0) volIcon.className = 'fas fa-volume-mute';
            else if (val < 0.5) volIcon.className = 'fas fa-volume-down';
            else volIcon.className = 'fas fa-volume-up';
        }


        // Global Keyboard Controls
        document.addEventListener('keydown', (e) => {
            if (e.code === 'Space' && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
                e.preventDefault();
                this.togglePlay();
            }
        });
    }

    async play(track, isFromHistory = false, playlist = null) {
        if (!track) {
            if (this.loadingTimer) clearTimeout(this.loadingTimer);
            UI.hideLoadingLock();
            return;
        }

        // 锁定 UI，防止加载期间重复点击
        UI.showLoadingLock();

        if (this.loadingTimer) clearTimeout(this.loadingTimer);
        // 移除 0.9s 的 loading toast，因为已经有了全局锁定遮罩

        if (playlist) this.playlist = playlist;

        // Push current to history if not navigating back
        if (!isFromHistory && this.currentTrack && this.currentTrack.id !== track.id) {
            this.historyStack.push(this.currentTrack);
            // 限制历史记录最多100首
            if (this.historyStack.length > 100) {
                this.historyStack.shift();
            }
            // 持久化到服务端
            try {
                DataService.addToHistory(this.currentTrack);
            } catch (e) {
                console.error('Failed to save history:', e);
            }
        }

        // Ensure details (url & lrc) are loaded content-wise
        if (!track.url || !track.lrc || (typeof track.lrc === 'string' && track.lrc.startsWith('http'))) {
            try {
                const detail = await MusicAPI.getSongDetails(track);
                if (detail && detail.url) {
                    track.url = detail.url;
                    track.lrc = detail.lrc;
                    track.cover = detail.cover || track.cover;
                } else if (!track.url) {
                    // Fallback to search if no URL found and it's an imported/legacy track
                    console.log("Detail fetch found no URL, trying search fallback for:", track.title);
                    const originalTitle = track.title.split(' (')[0].trim();
                    const searchResults = await MusicAPI.search(originalTitle, track.source, 1, 5);
                    const targetArtist = (track.artist || "").toLowerCase().trim();
                    const match = searchResults.find(s => {
                        const sTitle = s.title.toLowerCase().trim();
                        const sArtist = (s.artist || "").toLowerCase().trim();
                        return (sTitle.includes(originalTitle.toLowerCase()) || originalTitle.toLowerCase().includes(sTitle)) &&
                            (sArtist === targetArtist || sArtist.includes(targetArtist) || targetArtist.includes(sArtist));
                    });
                    if (match) {
                        const mDetail = await MusicAPI.getSongDetails(match);
                        if (mDetail && mDetail.url) {
                            track.url = mDetail.url;
                            track.lrc = mDetail.lrc;
                            track.cover = mDetail.cover;
                        }
                    }
                }
            } catch (e) {
                console.warn("Detail fetch/fallback failed in player.play", e);
            }
        }

        if (!track.url) {
            console.error("No URL for track", track);
            UI.hideLoadingLock(); // 先关闭遮罩
            UI.showToast('无法获取音频地址', 'error'); // 再报错，确保互斥
            return;
        }

        this.audio.src = track.url;
        this.lyrics = []; // Clear old lyrics
        UI.setLyrics([]); // Clear UI

        // If lrc is already text, parse it
        if (track.lrc && !track.lrc.startsWith('http')) {
            this.parseLyrics(track.lrc);
            UI.setLyrics(this.lyrics);
        } else if (track.lrc && track.lrc.startsWith('http')) {
            // Resolve URL in background
            const lrcUrl = track.lrc;
            const currentId = track.id;
            MusicAPI.fetchLrcText(lrcUrl).then(text => {
                if (text && this.currentTrack && this.currentTrack.id === currentId) {
                    this.currentTrack.lrc = text;
                    this.parseLyrics(text);
                    UI.setLyrics(this.lyrics);
                }
            });
        }

        UI.updatePlayerInfo(track);

        // Show Player Bar
        const bar = document.getElementById('player-bar');
        if (bar) {
            bar.style.transform = 'translateY(0)';
            bar.style.zIndex = '100';
        }

        try {
            await this.audio.play();
            this.currentTrack = track;

            // 成功播放后解除锁定
            UI.hideLoadingLock();

            // Sync playlist index if track is in current playlist
            const idx = this.playlist.findIndex(t => t.id === track.id);
            if (idx !== -1) {
                this.currentIndex = idx;
                UI.highlightPlaying(idx);
            }
        } catch (e) {
            console.error("Play failed", e);
            this.currentTrack = track;
            UI.hideLoadingLock(); // 确保报错截流处也优先关闭锁
        }
    }

    togglePlay() {
        if (!this.currentTrack && this.playlist.length > 0) {
            this.setPlaylist(this.playlist, 0);
            return;
        }
        if (this.audio.paused) {
            this.audio.play();
        } else {
            this.audio.pause();
        }
    }

    pause() {
        if (this.audio) {
            this.audio.pause();
            this.isPlaying = false;
            if (this.loadingTimer) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            UI.clearLoadingToasts();
        }
    }

    async checkAudioSilence() {
        if (!this.audioCtx || this.effectMode === 'original' || !this.isPlaying) return;

        // Create an AnalyserNode to check for silence
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        // Connect the masterGain to the analyser
        this.masterGain.connect(analyser);

        // Wait a moment for audio to process through the graph
        await new Promise(resolve => setTimeout(resolve, 500));

        analyser.getByteFrequencyData(dataArray);

        // Calculate average volume
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;

        // Disconnect analyser
        this.masterGain.disconnect(analyser);
        analyser.disconnect();

        // If average volume is very low, it might indicate a CORS issue preventing Web Audio API from processing
        // A threshold of 5-10 is usually safe for silence detection.
        if (average < 5) {
            console.warn("Detected potential audio silence with effects. This might be due to CORS restrictions on the audio source when using Web Audio API effects.");
            UI.showToast('音效模式下无声，可能因音源CORS限制。已自动切换回原声模式。', 'warning');
            this.setAudioEffect('original'); // Fallback to original mode
        }
    }

    playNext(auto = false) {
        if (this.playlist.length === 0) return;

        let nextIndex;
        if (this.mode === 'single' && auto) {
            this.audio.currentTime = 0;
            this.audio.play();
            return;
        }

        if (this.mode === 'shuffle') {
            nextIndex = Math.floor(Math.random() * this.playlist.length);
        } else {
            nextIndex = this.currentIndex + 1;
            if (nextIndex >= this.playlist.length) nextIndex = 0;
        }

        this.play(this.playlist[nextIndex]);
    }

    playPrev() {
        // If history exists, pop from history
        if (this.historyStack.length > 0) {
            const prevTrack = this.historyStack.pop();
            this.play(prevTrack, true); // true = don't push to history again
            return;
        }

        // Fallback to playlist prev
        if (this.playlist.length === 0) return;
        let prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.play(this.playlist[prevIndex]);
    }

    setPlaylist(list, startIndex = 0, targetId = null) {
        this.playlist = list;
        if (targetId) {
            const idx = this.playlist.findIndex(s => s.id == targetId || s.uid == targetId);
            if (idx !== -1) startIndex = idx;
        }
        this.currentIndex = startIndex;
        this.play(this.playlist[this.currentIndex]);
    }

    parseLyrics(lrcText) {
        this.lyrics = [];
        if (!lrcText) return;

        const lines = lrcText.split(/\r?\n/);
        // More flexible regex: [m:ss], [mm:ss.xxx], etc.
        const tagReg = /\[(\d{1,3}):(\d{1,2})(?:\.(\d{1,4}))?\]/g;

        for (const line of lines) {
            let match;
            const text = line.replace(tagReg, '').trim();
            if (!text) continue;

            tagReg.lastIndex = 0;
            let foundTag = false;
            while ((match = tagReg.exec(line)) !== null) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const msPart = match[3] || '0';
                const ms = parseInt(msPart.padEnd(3, '0').substring(0, 3));
                const time = min * 60 + sec + ms / 1000;
                this.lyrics.push({ time, text });
                foundTag = true;
            }

            // Fallback for lines without tags (if it's a pure text lyric)
            if (!foundTag && text && this.lyrics.length === 0 && lines.length < 50) {
                // If it's a very short text or we haven't found any tags yet, 
                // maybe it's title/artist info or pure text lyrics.
                // We'll give it a mock time to show it.
                this.lyrics.push({ time: 0, text });
            }
        }

        if (this.lyrics.length > 0) {
            this.lyrics.sort((a, b) => a.time - b.time);
        } else if (lrcText.trim()) {
            // Full fallback: if no tags found at all, split by lines and show all
            lines.forEach((l, i) => {
                const t = l.trim();
                if (t) this.lyrics.push({ time: i * 0.001, text: t });
            });
        }
    }

    updateLyrics(time) {
        if (this.lyrics.length === 0) return;

        // Find current line
        let index = this.lyrics.findIndex(l => l.time > time) - 1;
        if (index < 0) {
            if (time < this.lyrics[0].time) index = -1;
            else index = this.lyrics.length - 1;
        }

        if (this.lyrics.every(l => l.time <= time)) {
            index = this.lyrics.length - 1;
        }

        if (index !== this.lyricIndex) {
            this.lyricIndex = index;
            UI.highlightLyric(index);
        }
    }

    seek(time) {
        if (isFinite(time)) this.audio.currentTime = time;
    }

    initAudioContext() {
        if (this.audioCtx) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioContext();
            this.source = this.audioCtx.createMediaElementSource(this.audio);

            // Create Nodes
            this.lowFilter = this.audioCtx.createBiquadFilter();
            this.lowFilter.type = 'lowshelf';
            this.lowFilter.frequency.value = 200;

            this.highFilter = this.audioCtx.createBiquadFilter();
            this.highFilter.type = 'highshelf';
            this.highFilter.frequency.value = 3000;

            this.convolver = this.audioCtx.createConvolver();
            this.convolver.buffer = this.createImpulseResponse(1.5, 1.5);

            this.reverbGain = this.audioCtx.createGain();
            this.reverbGain.gain.value = 0;

            // Master Gain
            this.masterGain = this.audioCtx.createGain();

            // Connect initial: Source -> Master -> Dest
            this.source.connect(this.masterGain);
            this.masterGain.connect(this.audioCtx.destination);
            this.isAudioContextConnected = true;

        } catch (e) {
            console.error("Web Audio API initialization failed", e);
            this.isAudioContextConnected = false;
        }
    }

    createImpulseResponse(duration, decay) {
        const rate = this.audioCtx.sampleRate;
        const length = rate * duration;
        const impulse = this.audioCtx.createBuffer(2, length, rate);
        const left = impulse.getChannelData(0);
        const right = impulse.getChannelData(1);

        for (let i = 0; i < length; i++) {
            const n = length - i;
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
        return impulse;
    }

    setAudioEffect(mode) {
        if (!this.audioCtx) this.initAudioContext();
        if (!this.isAudioContextConnected) {
            console.warn("AudioContext not connected, skipping effect application");
            return;
        }

        this.effectMode = mode;
        try {
            // Reset Connections
            this.source.disconnect();
            this.lowFilter.disconnect();
            this.highFilter.disconnect();
            this.convolver.disconnect();
            this.reverbGain.disconnect();
            this.masterGain.disconnect();

            if (mode === 'original') {
                this.source.connect(this.masterGain);
                this.masterGain.connect(this.audioCtx.destination);
                return;
            }

            this.source.connect(this.lowFilter);
            this.lowFilter.connect(this.highFilter);
            let lastNode = this.highFilter;

            if (mode === 'headphone') {
                this.lowFilter.gain.value = 3;
                this.highFilter.gain.value = 3;
                lastNode.connect(this.masterGain);
            } else if (mode === 'speaker') {
                this.lowFilter.gain.value = 6;
                this.highFilter.gain.value = 6;
                lastNode.connect(this.masterGain);
                lastNode.connect(this.convolver);
                this.convolver.connect(this.reverbGain);
                this.reverbGain.connect(this.masterGain);
                this.reverbGain.gain.value = 0.4;
            }
            this.masterGain.connect(this.audioCtx.destination);
        } catch (err) {
            console.error("Failed to set audio effect (likely CORS):", err);
            // Emergency reconnect directly skip all nodes
            try {
                this.source.disconnect();
                this.source.connect(this.audioCtx.destination);
                UI.showToast("该歌曲不支持音效，已切换至原声播放", "warning");
            } catch (e) { }
        }
    }
}

const player = new MusicPlayer();
// 导出到 window 使其在其他脚本中可用
window.player = player;
