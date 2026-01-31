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

    // 内部请求 TuneHub 获取配置
    async fetchTuneHub(path, options = {}) {
        const headers = {
            'X-API-Key': this.apiKey,
            'Content-Type': 'application/json'
        };
        try {
            const res = await fetch(`${this.endpoints.base}${path}`, { ...options, headers });
            if (!res.ok) return { code: res.status, data: null };
            return await res.json();
        } catch (e) {
            return { code: -1, data: null };
        }
    },

    // 通用代理请求执行器（核心修复点）
    async _executeMethod(config, paramsMap = {}) {
        if (!config || !config.url) return null;

        // 1. 处理参数替换
        const queryParams = new URLSearchParams();
        const configParams = config.params || {};
        
        for (let [key, value] of Object.entries(configParams)) {
            let val = String(value);
            // 替换 {{variable}}
            if (val.includes('{{')) {
                for (let [k, v] of Object.entries(paramsMap)) {
                    val = val.replace(new RegExp(`{{${k}}}`, 'g'), v);
                }
                // 处理残留的数学表达式
                if (val.includes('{{')) {
                    val = val.replace(/{{(.+?)}}/g, (match, exp) => {
                        try {
                            const cleanExp = exp.replace(/\|\|/g, '||');
                            // 简单的安全求值
                            return new Function(...Object.keys(paramsMap), `return ${cleanExp}`)(...Object.values(paramsMap));
                        } catch { return 0; }
                    });
                }
            }
            queryParams.append(key, val);
        }

        // 2. 拼接URL
        const separator = config.url.includes('?') ? '&' : '?';
        const targetUrl = `${config.url}${separator}${queryParams.toString()}`;

        // 3. 走代理请求
        // 轮询代理以防挂掉，优先用 corsproxy.io
        const proxyBase = 'https://corsproxy.io/?url='; 
        const finalUrl = proxyBase + encodeURIComponent(targetUrl);

        try {
            const res = await fetch(finalUrl, {
                method: config.method || 'GET',
                headers: config.headers
            });
            return await res.json();
        } catch (e) {
            console.error('代理请求失败:', e);
            return null;
        }
    },

    // 1. 搜索
    async search(keyword, source, page = 1, limit = 20, signal = null) {
        if (!keyword) return [];
        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) return this.searchCache.get(cacheKey);

        try {
            // 获取配置
            const methodRes = await this.fetchTuneHub(`/v1/methods/${source}/search`);
            if (methodRes.code !== 0 || !methodRes.data) return [];

            // 执行配置
            const json = await this._executeMethod(methodRes.data, {
                keyword: encodeURIComponent(keyword), // 部分源需要再次编码
                page: page,
                pageSize: limit,
                limit: limit
            });

            if (!json) return [];

            const results = this._transformList(json, source);
            this.searchCache.set(cacheKey, results);
            return results;
        } catch (e) {
            return [];
        }
    },

    async aggregateSearch(keyword, signal = null) {
        const tasks = this.sources.map(src => this.search(keyword, src, 1, 20, signal));
        const all = await Promise.all(tasks);
        return all.flat();
    },

    // 2. 热门榜单 (修复：先拿配置，再拿数据)
    async getBillboardList(source) {
        try {
            // 第一步：获取榜单的方法配置
            const methodRes = await this.fetchTuneHub(`/v1/methods/${source}/toplists`);
            
            // 如果拿不到配置，直接返回空数组
            if (methodRes.code !== 0 || !methodRes.data) return [];

            // 第二步：执行这个配置，去真正的音乐平台拉取榜单列表
            // toplists 通常不需要参数
            const json = await this._executeMethod(methodRes.data, {});
            
            if (!json) return [];

            // 第三步：提取数据
            // 兼容不同平台的返回结构 (data.list, data.results, or root array)
            const rawData = json.data?.list || json.data?.results || json.list || json || [];
            
            if (!Array.isArray(rawData)) return [];

            return rawData.map(item => ({
                id: item.id || item.topId || item.uid,
                name: item.name || item.title || '未知榜单',
                pic: item.pic || item.cover || item.image || '',
                description: item.intro || item.updateFrequency || ''
            }));

        } catch (e) {
            console.error("榜单加载异常:", e);
            return [];
        }
    },

    // 3. 歌单详情 (修复：先拿配置，再拿数据)
    async getPlaylistSongs(source, playlistId) {
        try {
            const methodRes = await this.fetchTuneHub(`/v1/methods/${source}/playlist`);
            if (methodRes.code !== 0 || !methodRes.data) return { name: '未知歌单', tracks: [] };

            const json = await this._executeMethod(methodRes.data, { id: playlistId });
            
            if (!json) return { name: '加载失败', tracks: [] };

            // 提取歌单信息和歌曲列表
            const info = json.data?.info || json.info || {};
            const tracks = this._transformList(json, source);

            return {
                name: info.name || info.title || '未知歌单',
                cover: info.pic || info.cover || '',
                tracks: tracks
            };
        } catch (e) {
            return { name: '加载出错', tracks: [] };
        }
    },

    // 4. 解析播放地址
    async getSongDetails(track) {
        const sid = track.songId || (track.id && track.id.includes('-') ? track.id.split('-')[1] : track.id);
        try {
            const res = await this.fetchTuneHub('/v1/parse', {
                method: 'POST',
                body: JSON.stringify({
                    platform: track.source,
                    ids: String(sid),
                    quality: this.preferredQuality
                })
            });

            if (res.code === 0 && res.data && res.data[0]) {
                const item = res.data[0];
                track.url = item.url;
                track.cover = item.pic || track.cover;
                track.lrc = item.lrc || '';
                // 如果是http歌词链接，自动下载内容
                if (track.lrc && track.lrc.startsWith('http')) {
                    track.lrc = await this.fetchLrcText(track.lrc);
                }
            }
        } catch (e) { console.error("解析失败", e); }
        return track;
    },

    async fetchLrcText(url) {
        try {
            const res = await fetch(`https://corsproxy.io/?url=${encodeURIComponent(url)}`);
            return await res.text();
        } catch (e) { return ''; }
    },

    // 数据清洗工具
    _transformList(json, source) {
        // 尝试从各种可能的字段中找到歌曲列表
        const data = json.data || json;
        const list = data.list || data.results || data.songs || (Array.isArray(data) ? data : []);
        
        if (!Array.isArray(list)) return [];

        return list.map(item => {
            const sid = String(item.id || item.songid || item.mid);
            return {
                id: `${source}-${sid}`,
                songId: sid,
                title: item.name || item.title || item.songname || '未知',
                artist: item.artist || item.author || (item.singer?.[0]?.name) || (Array.isArray(item.singer) ? item.singer.map(s=>s.name).join('/') : '未知'),
                album: item.album || item.albumname || '-',
                cover: item.pic || item.cover || '',
                source: source,
                duration: item.interval || item.duration || 0
            };
        }).filter(s => s.songId && s.songId !== 'undefined');
    },

    // 兼容旧接口
    getProxyUrl(url) { return url; },
    async getBillboardDetail(source, id) { return this.getPlaylistSongs(source, id).then(res => res.tracks); },
    async searchNetease(k, p, l) { return this.search(k, 'netease', p, l); },
    async searchCommon(k, s, p, l) { return this.search(k, s, p, l); }
};
