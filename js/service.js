
const API_BASE = 'https://api.yexin.de5.net/api';

const AuthService = {
    get currentUser() {
        const s = localStorage.getItem('currentUser');
        return s ? JSON.parse(s) : null;
    },

    async login(username, password) {
        try {
            const res = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Login failed');

            // Save user info (which acts as token for now)
            localStorage.setItem('currentUser', JSON.stringify(data.user));
            return data.user;
        } catch (e) {
            console.error('Login Error:', e);
            throw e;
        }
    },

    async register(username, password) {
        try {
            const res = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Register failed');
            return data;
        } catch (e) {
            console.error('Register Error:', e);
            throw e;
        }
    },

    logout() {
        localStorage.removeItem('currentUser');
        // Clear data cache
        DataService.clearCache();
    }
};

const DataService = {
    favorites: [],
    playlists: [],

    get authHeader() {
        const user = AuthService.currentUser;
        return user ? { 'Authorization': `Bearer ${user.id}` } : {};
    },

    async init() {
        if (!AuthService.currentUser) return;
        await Promise.all([this.fetchPlaylists(), this.fetchFavorites()]);
    },

    clearCache() {
        this.favorites = [];
        this.playlists = [];
    },

    async syncPlatform(platform, url) {
        try {
            const parsed = MusicAPI.parsePlaylistUrl(url);
            if (!parsed) throw new Error("无法解析链接，请检查格式是否正确");

            UI.showToast(`正在从${platform === 'qq' ? 'QQ' : '网易云'}获取歌单...`, 'info');

            const result = await MusicAPI.getPlaylistSongs(parsed.source, parsed.id);
            if (!result || !result.tracks || result.tracks.length === 0) throw new Error("无法获取歌曲列表或歌单为空");

            const res = await fetch(`${API_BASE}/playlists/sync`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: parsed.source,
                    externalId: parsed.id,
                    name: result.name || "我的同步歌单",
                    songs: result.tracks.map(s => this.cleanSong(s))
                })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || '同步失败');

            UI.showToast(`同步成功: ${data.count} 项更新`, 'success');
            await this.fetchPlaylists(); // Refresh
            return true;
        } catch (e) {
            console.error('Sync Error:', e);
            UI.showToast(`同步失败: ${e.message}`, 'error');
            return false;
        }
    },

    cleanSong(song) {
        const clean = { ...song };
        delete clean.url;
        if (typeof clean.lrc === 'string' && clean.lrc.startsWith('http')) delete clean.lrc;
        return clean;
    },

    /**
     * Import playlists from external platforms
     * @param {string} platform - Platform name (netease, qq, etc.)
     * @param {string} externalId - External playlist ID
     * @param {Array} playlists - Array of playlist objects with id, name, and tracks
     * @returns {Object} Response with success status
     */
    async importPlaylists(platform, externalId, playlists) {
        try {
            // Clean all track data before sending to backend
            const cleanPlaylists = playlists.map(pl => ({
                ...pl,
                tracks: pl.tracks ? pl.tracks.map(s => this.cleanSong(s)) : []
            }));

            const res = await fetch(`${API_BASE}/sync/import`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ platform, id: externalId, playlists: cleanPlaylists })
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || '导入失败');
            }
            return { success: true, count: data.count, message: data.message };
        } catch (e) {
            console.error('Import Playlists Error:', e);
            return { success: false, message: e.message };
        }
    },

    // --- Favorites ---
    async fetchFavorites() {
        try {
            const res = await fetch(`${API_BASE}/favorites`, {
                headers: this.authHeader
            });
            if (res.ok) {
                this.favorites = await res.json();
            }
        } catch (e) {
            console.error('Fetch Favorites Error:', e);
        }
        return this.favorites;
    },

    async addFavorite(song) {
        // Optimistic update
        this.favorites.push(song);
        try {
            await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
        } catch (e) {
            console.error('Add Favorite Error:', e);
            // Revert on error?
        }
    },

    async addBatchFavorites(songs) {
        // Optimistic update
        this.favorites.push(...songs);
        try {
            const res = await fetch(`${API_BASE}/favorites/batch`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ songs: songs.map(s => this.cleanSong(s)) })
            });
            if (!res.ok) throw new Error('Batch favorites failed');
            return true;
        } catch (e) {
            console.error('Batch Add Favorites Error:', e);
            this.fetchFavorites();
            throw e;
        }
    },

    async removeFavorite(uid) {
        // Optimistic update
        this.favorites = this.favorites.filter(s => s.id !== uid && s.uid !== uid); // Handle both id formats
        try {
            await fetch(`${API_BASE}/favorites`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: uid }) // Backend expects 'id'
            });
        } catch (e) {
            console.error('Remove Favorite Error:', e);
        }
    },

    isFavorite(song) {
        if (!song) return false;
        // Check both ID types (local 'netease-123' vs backend stored)
        return this.favorites.some(f => f.id === song.id || f.id === song.uid);
    },

    // --- Playlists ---
    async fetchPlaylists() {
        try {
            const res = await fetch(`${API_BASE}/playlists`, {
                headers: this.authHeader
            });
            if (res.ok) {
                this.playlists = await res.json();
            }
        } catch (e) {
            console.error('Fetch Playlists Error:', e);
        }
        return this.playlists;
    },

    async createPlaylist(name, tracks = []) {
        try {
            const res = await fetch(`${API_BASE}/playlists`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, songs: tracks.map(s => this.cleanSong(s)) })
            });
            if (res.ok) {
                const pl = await res.json();
                this.playlists.unshift(pl); // Add to top
                return pl;
            }
        } catch (e) {
            console.error('Create Playlist Error:', e);
        }
        return null;
    },

    async deletePlaylist(id) {
        // Optimistic
        this.playlists = this.playlists.filter(p => p.id !== id);
        try {
            await fetch(`${API_BASE}/playlists/${id}`, {
                method: 'DELETE',
                headers: this.authHeader
            });
        } catch (e) {
            console.error('Delete Playlist Error:', e);
        }
    },

    async renamePlaylist(id, name) {
        const pl = this.playlists.find(p => p.id === id);
        if (pl) pl.name = name;
        try {
            await fetch(`${API_BASE}/playlists/${id}`, {
                method: 'PUT',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
            });
        } catch (e) {
            console.error('Rename Playlist Error:', e);
        }
    },

    async addSongToPlaylist(playlistId, song) {
        let pl = this.playlists.find(p => p.id === playlistId);
        if (!pl) {
            await this.fetchPlaylists();
            pl = this.playlists.find(p => p.id === playlistId);
        }

        if (!pl) return false;

        // Check for duplicate using both id and uid
        if (pl.tracks.some(t => (song.id && t.id === song.id) || (song.uid && t.uid === song.uid))) return false;

        // Optimistic update
        const tempTrack = { ...song };
        pl.tracks.push(tempTrack);

        try {
            const res = await fetch(`${API_BASE}/playlists/${playlistId}/songs`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                if (data.uid) {
                    tempTrack.uid = data.uid;
                }
                this.fetchPlaylists();
                return true;
            }

            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Backend save failed');
        } catch (e) {
            console.error('Add Song to Playlist Error:', e);
            pl.tracks = pl.tracks.filter(t => t !== tempTrack);
            throw e;
        }
    },

    async addBatchSongsToPlaylist(playlistId, songs) {
        let pl = this.playlists.find(p => p.id === playlistId);
        if (!pl) {
            await this.fetchPlaylists();
            pl = this.playlists.find(p => p.id === playlistId);
        }
        if (!pl) throw new Error('Playlist not found');

        // Filter duplicates
        const newSongs = songs.filter(s => !pl.tracks.some(t => t.id === s.id));
        if (newSongs.length === 0) return true;

        // Optimistic
        pl.tracks.push(...newSongs);

        try {
            const res = await fetch(`${API_BASE}/playlists/batch-songs`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ playlistId, songs: newSongs.map(s => this.cleanSong(s)) })
            });
            if (!res.ok) throw new Error('Batch add songs failed');
            this.fetchPlaylists(); // Refresh to sync
            return true;
        } catch (e) {
            console.error('Batch Add Songs Error:', e);
            this.fetchPlaylists(); // Refresh to sync
            throw e;
        }
    },

    async removeSongFromPlaylist(playlistId, songUid) {
        const pl = this.playlists.find(p => p.id === playlistId);
        if (pl) {
            pl.tracks = pl.tracks.filter(t => t.uid !== songUid);
        }
        try {
            await fetch(`${API_BASE}/playlists/${playlistId}/songs`, {
                method: 'DELETE',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: songUid })
            });
        } catch (e) {
            console.error('Remove Song from Playlist Error:', e);
        }
    },

    async fetchHistory() {
        try {
            const res = await fetch(`${API_BASE}/history`, { headers: this.authHeader });
            if (res.ok) return await res.json();
        } catch (e) {
            console.error('Fetch History Error:', e);
        }
        return [];
    },

    async addToHistory(song) {
        try {
            await fetch(`${API_BASE}/history`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify(this.cleanSong(song))
            });
        } catch (e) { console.error('Add History Error:', e); }
    }
};
