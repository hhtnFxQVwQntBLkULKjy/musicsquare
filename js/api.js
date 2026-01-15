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

    searchCache: new Map(),

    async search(keyword, source, page = 1, limit = 20) {
        if (!keyword) return [];

        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        try {
            let results = [];
            switch (source) {
                case 'migu':
                    results = await this.searchMigu(keyword, page, limit);
                    break;
                case 'netease':
                    results = await this.searchNetease(keyword, page, limit);
                    break;
                case 'qq':
                case 'kuwo':
                    results = await this.searchCommon(keyword, source, page, limit);
                    break;
                default:
                    results = [];
            }

            // Cache management: max 100 entries
            if (this.searchCache.size > 100) {
                const firstKey = this.searchCache.keys().next().value;
                this.searchCache.delete(firstKey);
            }
            this.searchCache.set(cacheKey, results);

            return results;
        } catch (e) {
            console.error(`Search error [${source}]:`, e);
            return [];
        }
    },

    async searchMigu(keyword, page, limit) {
        const url = `${this.endpoints.migu}?gm=${encodeURIComponent(keyword)}&n=&num=${limit}&type=json`;
        const res = await fetch(url);
        const json = await res.json();

        if (json.code !== 200 || !Array.isArray(json.data)) return [];

        return json.data.map(item => ({
            id: `migu-${item.title}-${item.singer}`,
            miguId: item.n,
            keyword: keyword,
            title: item.title,
            artist: item.singer,
            album: '',
            cover: item.cover,
            source: 'migu',
            duration: 0,
            url: item.music_url || null,
            lrc: item.lrc_url || null,
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
            lrc: item.lrc_url || item.lrc,
            originalData: item
        }));
    },

    async getSongDetails(track) {
        try {
            // 1. Specific Platform Handling
            if (track.source === 'migu') {
                const n = track.miguId || 1;
                const kw = track.keyword || track.title;
                const url = `${this.endpoints.migu}?gm=${encodeURIComponent(kw)}&n=${n}&num=20&type=json`;
                const res = await fetch(url);
                const json = await res.json();
                if (json.code === 200) {
                    track.url = json.music_url || track.url;
                    track.lrc = json.lrc_url || track.lrc;
                    track.cover = json.cover || track.cover;
                }
            } else if (track.source === 'netease') {
                let songId = track.songId || (track.id.includes('-') ? track.id.split('-')[1] : track.id);
                try {
                    const lyricRes = await fetch(`https://api.vkeys.cn/v2/music/netease/lyric?id=${songId}`);
                    const lyricData = await lyricRes.json();
                    if (lyricData && lyricData.code === 200 && lyricData.data) {
                        track.lrc = lyricData.data.lrc;
                    }
                } catch (e) { console.warn("Netease lyric fetch failed", e); }
            } else if (track.source === 'kuwo') {
                let songId = track.songId || (track.id.includes('-') ? track.id.split('-')[1] : track.id);
                try {
                    const kuwoApi = `https://kw-api.cenguigui.cn/?id=${songId}&type=song&level=zp&format=json`;
                    const res = await fetch(kuwoApi);
                    const j = await res.json();
                    if (j && j.code === 200 && j.data) {
                        track.url = j.data.url || track.url;
                        track.lrc = j.data.lyric || track.lrc;
                        track.cover = j.data.pic || track.cover;
                        track.album = j.data.album || track.album;
                    }
                } catch (e) { console.warn("Kuwo detail fetch failed", e); }
            }

            // 2. Meting Fallback for URL or missing data
            if (!track.url || track.url.includes('meting')) {
                let songId = track.songId || (track.id.includes('-') ? track.id.split('-')[1] : track.id);
                let server = track.source === 'qq' ? 'tencent' : track.source;

                const tryMeting = async (baseUrl) => {
                    try {
                        const res = await fetch(`${baseUrl}?type=song&id=${songId}&server=${server}`);
                        const data = await res.json();
                        return data && data[0] ? data[0] : null;
                    } catch (e) { return null; }
                };

                // Prioritize qijieya for Netease as it proved better for full versions
                let providers = [
                    'https://api.qijieya.cn/meting/',
                    'https://api.injahow.cn/meting/',
                    'https://api.wuenci.com/meting/api/'
                ];

                // If it's not netease, maybe keep the original order or just try all
                if (track.source !== 'netease') {
                    providers = [
                        'https://api.injahow.cn/meting/',
                        'https://api.qijieya.cn/meting/',
                        'https://api.wuenci.com/meting/api/'
                    ];
                }

                let data = null;
                for (const baseUrl of providers) {
                    data = await tryMeting(baseUrl);
                    // Minimal check: if netease and url has 'mobi' or looks like a 30s preview (very rare to detect easily without more API info)
                    // But if we got a link, we check if it's usable.
                    if (data && data.url) break;
                }

                if (data) {
                    track.url = data.url || track.url;
                    track.cover = data.pic || track.cover;
                    if (!track.lrc || track.lrc.includes('meting') || track.lrc.startsWith('http')) {
                        track.lrc = data.lrc || track.lrc;
                    }
                }
            }

        } catch (e) {
            console.error("Detail fetch error:", e);
        }

        // 3. Final Content Guard: Resolve LRC URL to text
        if (typeof track.lrc === 'string' && track.lrc.startsWith('http')) {
            try {
                const lrcRes = await fetch(track.lrc);
                const lrcText = await lrcRes.text();
                if (lrcText && (lrcText.includes('[') || lrcText.length > 20)) {
                    track.lrc = lrcText;
                }
            } catch (e) {
                console.warn("Failed to resolve lyric URL", e);
            }
        }

        return track;
    },

    async getUserPlaylists(source, uid) {
        const serverMap = { 'netease': 'netease', 'qq': 'tencent', 'migu': 'migu', 'kuwo': 'kuwo' };
        const server = serverMap[source];
        if (!server) return [];

        const tryUser = async (baseUrl) => {
            try {
                const res = await fetch(`${baseUrl}?type=user&id=${uid}&server=${server}`);
                const data = await res.json();
                return Array.isArray(data) ? data : null;
            } catch (e) { return null; }
        };

        let data = await tryUser('https://api.injahow.cn/meting/');
        if (!data) data = await tryUser('https://api.wuenci.com/meting/api/');
        if (!data) data = await tryUser('https://api.qijieya.cn/meting/');

        if (!data) throw new Error('无法获取歌单');
        return data.slice(0, 20);
    },

    async getPlaylistSongs(server, playlistId) {
        const tryPl = async (baseUrl) => {
            try {
                const res = await fetch(`${baseUrl}?type=playlist&id=${playlistId}&server=${server}`);
                const data = await res.json();
                return Array.isArray(data) ? data : null;
            } catch (e) { return null; }
        };

        let data = await tryPl('https://api.injahow.cn/meting/');
        if (!data) data = await tryPl('https://api.wuenci.com/meting/api/');
        if (data) {
            return data.map(s => ({
                id: `${server}-${s.id}`,
                title: s.name,
                artist: s.artist,
                album: s.album,
                cover: s.pic,
                source: server,
                url: s.url,
                lrc: s.lrc
            })).slice(0, 50);
        }
        return [];
    },

    async getPlaylistInfo(server, playlistId) {
        return null;
    },

    async fetchLrcText(lrcUrl) {
        if (!lrcUrl || !lrcUrl.startsWith('http')) return lrcUrl;
        const proxies = [
            `https://corsproxy.io/?url=${encodeURIComponent(lrcUrl)}`,
            `https://api.allorigins.win/raw?url=${encodeURIComponent(lrcUrl)}`
        ];

        for (const proxyUrl of proxies) {
            try {
                const lrcRes = await fetch(proxyUrl);
                if (lrcRes.ok) {
                    const text = await lrcRes.text();
                    if (text && text.length > 20 && !text.trim().startsWith('<')) {
                        return text;
                    }
                }
            } catch (e) {
                console.warn(`Lyric proxy failed: ${proxyUrl}`, e);
            }
        }
        return lrcUrl; // Fallback to raw URL if all fail
    }
};
