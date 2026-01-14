const MusicAPI = {
    // Configuration
    sources: ['netease', 'qq', 'kuwo', 'migu'],
    
    // API Endpoints
    endpoints: {
        migu: 'https://api.xcvts.cn/api/music/migu',
        netease: 'https://api.vkeys.cn/v2/music/netease',
        qqkuwo: 'https://music-dl.sayqz.com/api',
        meting: 'https://api.qijieya.cn/meting/',
    },

    async search(keyword, source, page = 1, limit = 20) {
        if (!keyword) return [];
        try {
            switch(source) {
                case 'migu':
                    return await this.searchMigu(keyword, page, limit);
                case 'netease':
                    return await this.searchNetease(keyword, page, limit);
                case 'qq':
                case 'kuwo':
                    return await this.searchCommon(keyword, source, page, limit);
                default:
                    return [];
            }
        } catch (e) {
            console.error(`Search error [${source}]:`, e);
            return [];
        }
    },

    async searchMigu(keyword, page, limit) {
        // Follow yuanshi.html: n parameter should be empty for search
        const url = `${this.endpoints.migu}?gm=${encodeURIComponent(keyword)}&n=&num=${limit}&type=json`;
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.code !== 200 || !Array.isArray(json.data)) return [];

        return json.data.map(item => ({
            id: `migu-${item.title}-${item.singer}`,
            miguId: item.n, // Critical for details
            keyword: keyword, // Store keyword for detail fetch
            title: item.title,
            artist: item.singer,
            album: '',
            cover: item.cover,
            source: 'migu',
            duration: 0,
            url: item.music_url || null, // Some results might have it
            lrc: item.lrc_url || null, // Store URL first
            originalData: item
        }));
    },

    async searchNetease(keyword, page, limit) {
        const url = `${this.endpoints.netease}?word=${encodeURIComponent(keyword)}&page=${page}&num=${limit}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.code !== 200 || !Array.isArray(json.data)) return [];

        return json.data.map(item => ({
            id: `netease-${item.id}`,
            songId: item.id,
            title: item.song,
            artist: item.singer,
            album: item.album,
            cover: item.cover,
            source: 'netease',
            duration: item.interval || 0,
            quality: item.quality,
            originalData: item
        }));
    },

    async searchCommon(keyword, source, page, limit) {
        const url = `${this.endpoints.qqkuwo}?type=search&keyword=${encodeURIComponent(keyword)}&source=${source}&limit=${limit}&page=${page}`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.code !== 200 || !json.data || !Array.isArray(json.data.results)) return [];

        return json.data.results.map(item => ({
            id: `${source}-${item.id}`,
            songId: item.id,
            title: item.name,
            artist: item.artist,
            album: item.album,
            cover: item.pic,
            source: source,
            url: item.url,
            lrc: item.lrc,
            originalData: item
        }));
    },

    async getSongDetails(track) {
        try {
            // Migu Detail Fetch (replicate yuanshi.html logic)
            if (track.source === 'migu') {
                const n = track.miguId || 1;
                const kw = track.keyword || track.title; // Fallback
                const url = `${this.endpoints.migu}?gm=${encodeURIComponent(kw)}&n=${n}&num=20&type=json`;
                
                const res = await fetch(url);
                const json = await res.json();
                
                if (json.code === 200) {
                    track.title = json.title || track.title;
                    track.artist = json.singer || track.artist;
                    track.cover = json.cover || track.cover;
                    track.url = json.music_url || track.url;
                    track.lrc = json.lrc_url || track.lrc; // Update lrc url
                }
            }

            // General Meting ID Fetch (for imported songs that lack URL)
            // If ID starts with 'netease-', 'tencent-', etc., we need to resolve it
            if (!track.url && track.id && (track.id.includes('-') || track.source)) {
                 const parts = track.id.split('-');
                 const realId = parts.length > 1 ? parts[1] : track.id;
                 const source = parts.length > 1 ? parts[0] : track.source;
                 
                 // Map source to Meting
                 const serverMap = { 'netease': 'netease', 'qq': 'tencent', 'tencent': 'tencent', 'migu': 'migu', 'kuwo': 'kuwo' };
                 const server = serverMap[source] || source;

                 if (server) {
                     const tryFetch = async (baseUrl) => {
                         try {
                             const res = await fetch(`${baseUrl}?type=song&id=${realId}&server=${server}`);
                             const data = await res.json();
                             return data && data[0] ? data[0] : null;
                         } catch (e) { return null; }
                     };
                     
                     let metingData = await tryFetch('https://api.injahow.cn/meting/');
                     if (!metingData) metingData = await tryFetch('https://api.wuenci.com/meting/api/');
                     
                     if (metingData) {
                         track.url = metingData.url;
                         track.cover = metingData.pic || track.cover;
                         track.lrc = metingData.lrc;
                     }
                 }
            }

            // Netease via Meting (Legacy check)
            if (track.source === 'netease' && !track.url) {
                const metingRes = await fetch(`${this.endpoints.meting}?type=song&id=${track.songId}`);
                const metingData = await metingRes.json();
                if (metingData && metingData[0]) {
                    track.url = metingData[0].url;
                    track.cover = metingData[0].pic || track.cover;
                    track.lrc = metingData[0].lrc;
                }
            }
            
            // Check if LRC is a URL and fetch it
            if (track.lrc && track.lrc.startsWith('http')) {
                const lrcRes = await fetch(track.lrc);
                track.lrc = await lrcRes.text();
            }

            // If still no URL for others, maybe try Meting fallback?
            // (Not implemented to avoid cors/complexity, assuming searchCommon returns URL)

        } catch (e) {
            console.error("Detail fetch failed", e);
        }
        return track;
    },

    // Get User Playlists via Meting (Proxy by Frontend)
    async getUserPlaylists(source, uid) {
        // Map source to Meting server code
        const serverMap = {
            'netease': 'netease',
            'qq': 'tencent',
            'migu': 'migu',
            'kuwo': 'kuwo'
        };
        const server = serverMap[source];
        if (!server) return [];

        // Try primary API (injahow)
        const tryFetch = async (baseUrl) => {
            try {
                const url = `${baseUrl}?type=user&id=${uid}&server=${server}`;
                const res = await fetch(url);
                if (!res.ok) throw new Error('API Error');
                const data = await res.json();
                return Array.isArray(data) ? data : null;
            } catch (e) {
                return null;
            }
        };

        let data = await tryFetch('https://api.injahow.cn/meting/');
        if (!data) data = await tryFetch('https://api.wuenci.com/meting/api/');
        // Fallback to qijieya if others fail (though it often fails for user type)
        if (!data) data = await tryFetch('https://api.qijieya.cn/meting/');

        if (!data || data.length === 0) {
            throw new Error('无法获取歌单，请检查ID或稍后重试');
        }

        // Limit to first 20 playlists to avoid too much data
        const playlists = data.slice(0, 20);
        
        // Fetch songs for the first 3 playlists (Detail Sync)
        // We do this in parallel but limit concurrency
        for (let i = 0; i < Math.min(3, playlists.length); i++) {
            const pl = playlists[i];
            const songs = await this.getPlaylistSongs(server, pl.id);
            pl.tracks = songs || [];
        }

        return playlists;
    },

    async getPlaylistSongs(server, playlistId) {
        // Try same APIs
        const tryFetch = async (baseUrl) => {
            try {
                const url = `${baseUrl}?type=playlist&id=${playlistId}&server=${server}`;
                const res = await fetch(url);
                const data = await res.json();
                return Array.isArray(data) ? data : null;
            } catch (e) { return null; }
        };

        let data = await tryFetch('https://api.injahow.cn/meting/');
        if (!data) data = await tryFetch('https://api.wuenci.com/meting/api/');
        
        if (data) {
            // Map to our standard format
            return data.map(s => ({
                id: `${server}-${s.id}`, // Note: server here is 'netease'/'tencent' etc.
                title: s.name,
                artist: s.artist,
                album: s.album,
                cover: s.pic,
                source: server,
                url: s.url,
                lrc: s.lrc
            })).slice(0, 50); // Limit 50 songs per playlist
        }
        return [];
    }
};
