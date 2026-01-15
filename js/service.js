
const API_BASE = 'https://yunduanyingyue.tmichi1001.workers.dev/api';

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

    async syncPlatform(platform, link) {
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
                body: JSON.stringify(song)
            });
        } catch (e) {
            console.error('Add Favorite Error:', e);
            // Revert on error?
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

    async createPlaylist(name) {
        try {
            const res = await fetch(`${API_BASE}/playlists`, {
                method: 'POST',
                headers: { ...this.authHeader, 'Content-Type': 'application/json' },
                body: JSON.stringify({ name })
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
        // Ensure playlist exists in local cache, if not, fetch all
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
                body: JSON.stringify(song)
            });
            if (res.ok) {
                // If the response contains the new track info (with UID), update it
                const data = await res.json().catch(() => ({}));
                if (data.uid) {
                    tempTrack.uid = data.uid;
                }
                // Also trigger a full refresh to be safe, but asynchronously
                this.fetchPlaylists();
                return true;
            }

            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || 'Backend save failed');
        } catch (e) {
            console.error('Add Song to Playlist Error:', e);
            // Revert optimistic update
            pl.tracks = pl.tracks.filter(t => t !== tempTrack);
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
                body: JSON.stringify(song)
            });
        } catch (e) { console.error('Add History Error:', e); }
    }
};
