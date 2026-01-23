class MusicPlayer {
    constructor() {
        this.audio = new Audio();
        this.playlist = [];
        this.nextQueue = []; // Queue for "Play Next" songs - persists across setPlaylist calls
        this.historyStack = []; // Stack for previous tracks
        this.currentIndex = -1;
        this.isPlaying = false;
        this.mode = 'list'; // list, single, shuffle
        this.lyrics = [];
        this.lyricIndex = -1;
        this.loadingTimer = null;
        this._lastErrorTime = 0; // 报错截流

        // Shuffle state
        this.shuffledIndices = [];
        this.shuffledIndex = -1;

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

            // Reset skipping errors flag
            this._isSkippingErrors = false;
            this._errorSkipCount = 0;

            // Prefetch next song after 3 seconds delay to avoid slowing down current playback
            if (this.prefetchTimer) clearTimeout(this.prefetchTimer);
            this.prefetchTimer = setTimeout(() => {
                this.prefetchNextSong();
            }, 5000);
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            // 情况异常时也要清除提示
            if (this.loadingTimer) {
                clearTimeout(this.loadingTimer);
                this.loadingTimer = null;
            }
            // Clear prefetch timer when paused
            if (this.prefetchTimer) {
                clearTimeout(this.prefetchTimer);
                this.prefetchTimer = null;
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

            // Mark as unplayable
            if (this.currentTrack) {
                this.currentTrack.unplayable = true;
                if (UI.markSongUnplayable) UI.markSongUnplayable(this.currentTrack.id || this.currentTrack.uid);
            }

            // Consolidate error reporting
            const now = Date.now();
            if (!this._isSkippingErrors) {
                // First error in a sequence or isolated error
                if (now - this._lastErrorTime > 2500) {
                    // UI.hideLoadingLock(); // Keep lock if we are skipping? No, better hide it.
                    // Actually, if we are skipping rapidly, we might want to show a persistent "Skipping..." toast.
                    this._isSkippingErrors = true;
                    this._errorSkipCount = 1;
                    UI.showToast('歌曲无法播放，自动跳过...', 'warning');
                    this._lastErrorTime = now;
                }
            } else {
                this._errorSkipCount = (this._errorSkipCount || 0) + 1;
                // Optionally update toast text if possible, or just silent skip
            }

            UI.hideLoadingLock();

            // Auto-retry / Skip logic
            // Delay slightly to prevent infinite rapid loop freezing UI
            setTimeout(() => {
                this.playNext(true);
            }, 500);
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
            return false;
        }

        UI.showLoadingLock();
        UI.updatePlayerInfo(track);

        if (this.loadingTimer) clearTimeout(this.loadingTimer);
        if (playlist) this.playlist = playlist;

        if (!isFromHistory && this.currentTrack && this.currentTrack.id !== track.id) {
            this.historyStack.push(this.currentTrack);
            if (this.historyStack.length > 100) {
                this.historyStack.shift();
            }
            try {
                DataService.addToHistory(this.currentTrack);
            } catch (e) {
                console.error('Failed to save history:', e);
            }
        }

        if (!track.url || !track.lrc || (typeof track.lrc === 'string' && track.lrc.startsWith('http'))) {
            try {
                const detail = await MusicAPI.getSongDetails(track);
                if (detail && detail.url) {
                    track.url = detail.url;
                    track.lrc = detail.lrc;
                    track.cover = detail.cover || track.cover;
                } else if (!track.url) {
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
            UI.hideLoadingLock();
            UI.showToast('无法获取音频地址', 'error');
            return false;
        }

        this.audio.pause();
        this.audio.currentTime = 0;
        this.audio.src = track.url;
        this.lyrics = [];
        UI.setLyrics([]);

        if (track.lrc && !track.lrc.startsWith('http')) {
            this.parseLyrics(track.lrc);
            UI.setLyrics(this.lyrics);
        } else if (track.lrc && track.lrc.startsWith('http')) {
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
        const bar = document.getElementById('player-bar');
        if (bar) {
            bar.style.transform = 'translateY(0)';
            bar.style.zIndex = '100';
        }

        try {
            await this.audio.play();
            this.currentTrack = track;
            UI.hideLoadingLock();
            const idx = this.playlist.findIndex(t => t.id === track.id);
            if (idx !== -1) {
                this.currentIndex = idx;
            }
            // Always highlight by ID for reliable highlighting regardless of source (nextQueue, playlist, etc.)
            UI.highlightPlayingByID(track.id, track.uid);
            return true;
        } catch (e) {
            console.error("Play failed", e);
            this.currentTrack = track;
            UI.hideLoadingLock();
            return false;
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
        const analyser = this.audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.masterGain.connect(analyser);
        await new Promise(resolve => setTimeout(resolve, 500));
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
        }
        const average = sum / bufferLength;
        this.masterGain.disconnect(analyser);
        analyser.disconnect();
        if (average < 5) {
            console.warn("Detected potential audio silence with effects.");
            UI.showToast('音效模式下无声，可能因音源CORS限制。已自动切换回原声模式。', 'warning');
            this.setAudioEffect('original');
        }
    }

    async playNext(auto = false) {
        // First, check if there are songs in the nextQueue
        if (this.nextQueue.length > 0) {
            const nextTrack = this.nextQueue.shift();
            const success = await this.play(nextTrack);
            if (success) return;
            // If failed, try the next one in queue recursively
            return this.playNext(auto);
        }

        if (this.playlist.length === 0) return;
        let attempts = 0;
        const maxAttempts = this.playlist.length;
        let tryIndex = this.currentIndex;

        if (this.mode === 'single' && auto) {
            this.audio.currentTime = 0;
            try {
                await this.audio.play();
            } catch (e) { console.warn("Replay failed", e); }
            return;
        }

        while (attempts < maxAttempts) {
            if (this.mode === 'shuffle') {
                if (this.shuffledIndices.length !== this.playlist.length) {
                    this.generateShuffleIndices();
                }
                this.shuffledIndex++;
                if (this.shuffledIndex >= this.shuffledIndices.length) {
                    this.generateShuffleIndices();
                    this.shuffledIndex = 0;
                }
                tryIndex = this.shuffledIndices[this.shuffledIndex];
            } else {
                tryIndex++;
                if (tryIndex >= this.playlist.length) tryIndex = 0;
            }
            const track = this.playlist[tryIndex];
            if (track.unplayable) {
                attempts++;
                continue; // Skip unplayable songs
            }
            const success = await this.play(track);
            if (success) return;
            attempts++;
            if (this.mode !== 'shuffle' && tryIndex === this.currentIndex) break;
        }
        UI.showToast('没有可播放的歌曲', 'warning');
    }

    generateShuffleIndices() {
        const n = this.playlist.length;
        this.shuffledIndices = Array.from({ length: n }, (_, i) => i);
        // Fisher-Yates Shuffle
        for (let i = n - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shuffledIndices[i], this.shuffledIndices[j]] = [this.shuffledIndices[j], this.shuffledIndices[i]];
        }

        // If there's a current track, ensure it's not immediately repeated or sync its position
        if (this.currentIndex !== -1) {
            const pos = this.shuffledIndices.indexOf(this.currentIndex);
            if (pos !== -1) {
                // Move current track's index to the front of the shuffle so it continues from here
                this.shuffledIndices.splice(pos, 1);
                this.shuffledIndices.unshift(this.currentIndex);
            }
        }
        this.shuffledIndex = 0;
    }

    // Add song(s) to the "Play Next" queue
    addToNextQueue(songs) {
        if (!Array.isArray(songs)) songs = [songs];
        this.nextQueue.push(...songs);
    }

    playPrev() {
        if (this.historyStack.length > 0) {
            const prevTrack = this.historyStack.pop();

            // Sync shuffle state if we are in shuffle mode
            if (this.mode === 'shuffle' && this.shuffledIndices.length > 0) {
                const idxInPlaylist = this.playlist.findIndex(t => t.id === prevTrack.id || t.uid === prevTrack.uid);
                if (idxInPlaylist !== -1) {
                    const idxInShuffle = this.shuffledIndices.indexOf(idxInPlaylist);
                    if (idxInShuffle !== -1) {
                        this.shuffledIndex = idxInShuffle;
                    }
                }
            }

            this.play(prevTrack, true);
            return;
        }
        if (this.playlist.length === 0) return;
        let prevIndex = this.currentIndex - 1;
        if (prevIndex < 0) prevIndex = this.playlist.length - 1;
        this.play(this.playlist[prevIndex]);
    }

    async prefetchNextSong() {
        if (this.playlist.length === 0 || !this.isPlaying) return;
        let nextIndex;
        if (this.mode === 'single') return;
        else if (this.mode === 'shuffle') nextIndex = Math.floor(Math.random() * this.playlist.length);
        else {
            nextIndex = this.currentIndex + 1;
            if (nextIndex >= this.playlist.length) nextIndex = 0;
        }
        const nextTrack = this.playlist[nextIndex];
        if (!nextTrack || nextTrack.url) return;
        try {
            await MusicAPI.getSongDetails(nextTrack);
        } catch (e) { console.warn('Prefetch failed for:', nextTrack.title); }
    }

    setPlaylist(list, startIndex = 0, targetId = null) {
        this.playlist = list;
        if (targetId) {
            const idx = this.playlist.findIndex(s => s.id == targetId || s.uid == targetId);
            if (idx !== -1) startIndex = idx;
        }
        this.currentIndex = startIndex;

        // Reset or init shuffle order
        if (this.mode === 'shuffle') {
            this.generateShuffleIndices();
        } else {
            this.shuffledIndices = [];
            this.shuffledIndex = -1;
        }

        this.play(this.playlist[this.currentIndex]);
    }

    parseLyrics(lrcText) {
        this.lyrics = [];
        if (!lrcText) return;
        const lines = lrcText.split(/\r?\n/);
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
            if (!foundTag && text && this.lyrics.length === 0 && lines.length < 50) {
                this.lyrics.push({ time: 0, text });
            }
        }
        if (this.lyrics.length > 0) this.lyrics.sort((a, b) => a.time - b.time);
        else if (lrcText.trim()) {
            lines.forEach((l, i) => {
                const t = l.trim();
                if (t) this.lyrics.push({ time: i * 0.001, text: t });
            });
        }
    }

    updateLyrics(time) {
        if (this.lyrics.length === 0) return;
        let index = this.lyrics.findIndex(l => l.time > time) - 1;
        if (index < 0) {
            if (time < this.lyrics[0].time) index = -1;
            else index = this.lyrics.length - 1;
        }
        if (this.lyrics.every(l => l.time <= time)) index = this.lyrics.length - 1;
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
            this.masterGain = this.audioCtx.createGain();
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
            left[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
            right[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
        return impulse;
    }

    setAudioEffect(mode) {
        if (!this.audioCtx) this.initAudioContext();
        if (!this.isAudioContextConnected) return;
        this.effectMode = mode;
        try {
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
            console.error("Failed to set audio effect:", err);
            try {
                this.source.disconnect();
                this.source.connect(this.audioCtx.destination);
                UI.showToast("该歌曲不支持音效，已切换至原声播放", "warning");
            } catch (e) { }
        }
    }
}

const player = new MusicPlayer();
window.player = player;
