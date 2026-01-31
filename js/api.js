const MusicAPI = {
    sources: ['netease', 'qq', 'kuwo'],
    endpoints: {
        base: 'https://tunehub.sayqz.com/api',
    },
    apiKey: 'th_9a7e8ecbe2028f7a7ba22e469694d6c10184ecf7797eae15',
    searchCache: new Map(),
    urlCache: new Map(),

    get preferredQuality() {
        let q = localStorage.getItem('preferredQuality') || '320k';
        return q.includes('k') ? q : q + 'k';
    },

    async fetchTuneHub(path, options = {}) {
        const headers = {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
        };
        const res = await fetch(`${this.endpoints.base}${path}`, { ...options, headers });
        return res.json();
    },

    // 核心搜索
    async search(keyword, source, page = 1, limit = 20, signal = null) {
        if (!keyword) return [];
        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);

        try {
            const methodRes = await this.fetchTuneHub(`/v1/methods/${source}/search`);
            if (methodRes.code !== 0) return [];
            const config = methodRes.data;

            const queryParams = new URLSearchParams();
            for (let [key, value] of Object.entries(config.params || {})) {
                let val = String(value);
                if (val.includes('{{')) {
                    val = val.replace(/{{keyword}}/g, keyword)
                             .replace(/{{page}}/g, page)
                             .replace(/{{pageSize}}/g, limit)
                             .replace(/{{limit}}/g, limit);
                    
                    if (val.includes('{{')) {
                        val = val.replace(/{{(.+?)}}/g, (match, exp) => {
                            try {
                                return Function('page', 'limit', `return ${exp.replace(/\|\|/g, '||')}`)(page, limit);
                            } catch(e) { return 0; }
                        });
                    }
                }
                queryParams.append(key, val);
            }

            const targetUrl = `${config.url}${config.url.includes('?') ? '&' : '?'}${queryParams.toString()}`;
            const finalUrl = `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetUrl)}`;

            const res = await fetch(finalUrl, { method: config.method, headers: config.headers, signal });
            const json = await res.json();

            const results = this._transformList(json, source);
            this.searchCache.set(cacheKey, results);
            return results;
        } catch (e) {
            console.error(`${source} 搜索失败:`, e);
            return [];
        }
    },

    async aggregateSearch(keyword, signal = null) {
        const tasks = this.sources.map(src => this.search(keyword, src, 1, 20, signal));
        const all = await Promise.all(tasks);
        return all.flat();
    },

    // 重点修复：热门歌曲（排行榜）
    async getBillboardList(source) {
        try {
            const res = await this.fetchTuneHub(`/v1/methods/${source}/toplists`);
            // 确保返回的是数组，适配 ui.js 的 forEach 调用
            if (res.code === 0 && Array.isArray(res.data)) {
                return res.data.map(item => ({
                    id: item.id || item.topId,
                    name: item.name || item.title,
                    pic: item.pic || item.cover,
                    description: item.intro || ''
                }));
            }
            return []; 
        } catch (e) {
            console.error("加载排行榜失败:", e);
            return [];
        }
    },

    // 解析播放地址
    async getSongDetails(track) {
        const sid = track.songId || track.id.split('-')[1];
        try {
            const res = await this.fetchTuneHub('/v1/parse', {
                method: 'POST',
                body: JSON.stringify({
                    platform: track.source,
                    ids: sid,
                    quality: this.preferredQuality
                })
            });

            if (res.code === 0 && res.data?.[0]) {
                const item = res.data[0];
                track.url = item.url;
                track.cover = item.pic || track.cover;
                track.lrc = item.lrc || '';
                if (track.lrc && track.lrc.startsWith('http')) {
                    track.lrc = await this.fetchLrcText(track.lrc);
                }
            }
        } catch (e) { console.error("解析失败", e); }
        return track;
    },

    async fetchLrcText(url) {
        try {
            const res = await fetch(`https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`);
            return await res.text();
        } catch (e) { return ''; }
    },

    _transformList(json, source) {
        const data = json.data || json;
        const list = data.list || data.results || data.songs || (Array.isArray(data) ? data : []);
        
        return list.map(item => {
            const sid = String(item.id || item.songid || item.mid);
            return {
                id: `${source}-${sid}`,
                songId: sid,
                title: item.name || item.title || item.songname || '未知',
                artist: item.artist || item.author || (item.singer?.[0]?.name) || '未知歌手',
                album: item.album || item.albumname || '-',
                cover: item.pic || item.cover || '',
                source: source,
                duration: item.interval || item.duration || 0
            };
        }).filter(s => s.songId !== 'undefined');
    },

    // 占位兼容
    getProxyUrl(url) { return url; },
    async getPlaylistSongs(source, id) { return { name: '歌单', tracks: [] }; },
    async searchNetease(k, p, l) { return this.search(k, 'netease', p, l); },
    async searchCommon(k, s, p, l) { return this.search(k, s, p, l); }
};
