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

        this.audio.addEventListener('error', (e) => {
            console.error("Audio error", e);
            // Only skip if playlist has items
            if (this.playlist.length > 1) {
                setTimeout(() => this.playNext(true), 1000);
            }
        });

        this.audio.addEventListener('play', () => {
            this.isPlaying = true;
            if (UI.updatePlayState) UI.updatePlayState(true);
        });

        this.audio.addEventListener('pause', () => {
            this.isPlaying = false;
            if (UI.updatePlayState) UI.updatePlayState(false);
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

    async play(track, isFromHistory = false) {
        if (!track) return;
        
        // Push current to history if not navigating back
        if (!isFromHistory && this.currentTrack && this.currentTrack.id !== track.id) {
            this.historyStack.push(this.currentTrack);
            if (this.historyStack.length > 50) this.historyStack.shift(); // Limit stack size
        }

        // Ensure details (url & lrc) are loaded
        if (!track.url || !track.lrc) {
            // Force fetch details if missing URL OR Lyrics
            // (Hot songs & favorites often miss lrc initially)
            const detail = await MusicAPI.getSongDetails(track);
            // Merge detail back to track object to preserve original props if needed
            if (detail) {
                track.url = detail.url || track.url;
                track.lrc = detail.lrc || track.lrc;
                track.cover = detail.cover || track.cover;
            }
        }

        if (!track.url) {
            console.error("No URL for track", track);
            return;
        }

        this.audio.src = track.url;
        this.lyrics = []; // Clear old lyrics
        UI.setLyrics([]); // Clear UI
        this.parseLyrics(track.lrc);
        UI.setLyrics(this.lyrics);
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

        const lines = lrcText.split('\n');
        const regex = /\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;

        for (const line of lines) {
            const match = line.match(regex);
            if (match) {
                const min = parseInt(match[1]);
                const sec = parseInt(match[2]);
                const ms = match[3] ? parseInt(match[3]) : 0;
                const time = min * 60 + sec + ms / 1000;
                const text = match[4].trim();
                if (text) {
                    this.lyrics.push({ time, text });
                }
            }
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
