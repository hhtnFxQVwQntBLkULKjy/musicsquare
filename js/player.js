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
        this.loadingTimer = null; // 为加载提示增加定时器

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

            const currentTrack = this.playlist[this.currentIndex];
            if (currentTrack) {
                currentTrack.unplayable = true;
                if (UI.renderSongList) {
                    UI.renderSongList(this.playlist, 1, 1, null, true, UI._currentViewType, UI._currentPlaylistId);
                }
            }
            UI.showToast('该歌曲暂无法提供播放，欢迎您到正版音乐平台收听或下载。', 'error');

            // Auto-retry logic for expired URLs
            if (this.currentTrack && !this.currentTrack._retried) {
                this.currentTrack._retried = true;
                try {
                    const detail = await MusicAPI.getSongDetails(this.currentTrack);
                    if (detail && detail.url) {
                        this.currentTrack.url = detail.url;
                        this.audio.src = detail.url;
                        this.audio.play();
                        return;
                    }
                } catch (err) { console.error("Retry failed", err); }
            }

            if (this.playlist.length > 1) {
                setTimeout(() => this.playNext(true), 1500);
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
    }

    async play(track, isFromHistory = false, playlist = null) {
        if (!track) {
            if (this.loadingTimer) clearTimeout(this.loadingTimer);
            return;
        }

        // 0.9秒后仍未播放则显示加载提示
        if (this.loadingTimer) clearTimeout(this.loadingTimer);
        this.loadingTimer = setTimeout(() => {
            UI.showToast('正在加载歌曲资源...', 'info');
        }, 900);

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

        // On-demand search for imported tracks
        if (track.isImported && !track.url) {
            UI.showToast(`正在搜索音源: ${track.title}...`, 'success');
            try {
                // Extract original title (remove platform suffix)
                const originalTitle = track.title.split(' (')[0];
                const searchResults = await MusicAPI.search(`${originalTitle} ${track.artist}`, track.source);

                // Find exact match (title and artist)
                const match = searchResults.find(s =>
                    s.title.toLowerCase().trim() === originalTitle.toLowerCase().trim() &&
                    s.artist.toLowerCase().trim() === track.artist.toLowerCase().trim()
                );

                if (match) {
                    const detail = await MusicAPI.getSongDetails(match);
                    if (detail && detail.url) {
                        // Update track with resolved data (but keep it as imported for future)
                        track.url = detail.url;
                        track.lrc = detail.lrc;
                        track.cover = detail.cover;
                        track.album = detail.album || track.album;
                        track.songId = detail.songId || detail.id;
                    } else {
                        throw new Error("Match found but no URL available");
                    }
                } else {
                    throw new Error("No exact match found in search results");
                }
            } catch (err) {
                console.error("On-demand search failed", err);
                track.unplayable = true;
                UI.showToast(`歌曲无法播放: ${track.title}`, 'error');
                // Force UI Update to show gray out
                const idx = this.playlist.findIndex(t => t.id === track.id || t.uid === track.uid);
                if (idx !== -1) UI.renderSongList(this.playlist, 1, 1, null, true, UI._currentViewType, UI._currentPlaylistId);

                // Auto skip to next
                setTimeout(() => this.playNext(true), 1500);
                return;
            }
        }

        // Ensure details (url & lrc) are loaded content-wise
        const lrcIsUrl = typeof track.lrc === 'string' && track.lrc.startsWith('http');
        if (!track.url || !track.lrc || lrcIsUrl) {
            // Force fetch details if missing URL OR if lrc is still a URL
            try {
                const detail = await MusicAPI.getSongDetails(track);
                // Merge detail back to track object to preserve original props if needed
                if (detail) {
                    track.url = detail.url || track.url;
                    track.lrc = detail.lrc || track.lrc;
                    track.cover = detail.cover || track.cover;
                }
            } catch (e) {
                console.warn("Detail fetch failed in player.play", e);
            }
        }

        if (!track.url) {
            console.error("No URL for track", track);
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
            // Ensure z-index is high enough if hidden by something
            bar.style.zIndex = '100';
        } else {
            console.error('Player bar element not found!');
        }

        try {
            await this.audio.play();
            this.currentTrack = track;

            // Sync playlist index if track is in current playlist
            const idx = this.playlist.findIndex(t => t.id === track.id);
            if (idx !== -1) {
                this.currentIndex = idx;
                UI.highlightPlaying(idx);
            }
        } catch (e) {
            console.error("Play failed", e);
            // If play fails (e.g. not allowed without interaction), UI should still update
            this.currentTrack = track;
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

    setPlaylist(list, startIndex = 0) {
        this.playlist = list;
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
}

const player = new MusicPlayer();
// 导出到 window 使其在其他脚本中可用
window.player = player;
