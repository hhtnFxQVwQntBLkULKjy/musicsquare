const MusicAPI = {
    // Configuration
    sources: ['netease', 'qq', 'kuwo'], // migu removed from active sources

    // 新的 TuneHub V3 API 配置（核心修改）
    endpoints: {
        base: 'https://tunehub.sayqz.com/api',
        apiKey: 'th_your_api_key_here' // 👉 替换成你的真实 API Key
    },

    searchCache: new Map(),

    // Quality preference - 保持原有逻辑
    get preferredQuality() {
        return localStorage.getItem('preferredQuality') || 'flac24bit';
    },
    set preferredQuality(val) {
        localStorage.setItem('preferredQuality', val);
    },

    // 保持原有逻辑
    getQualityChain(preferred) {
        const allQualities = ['flac24bit', 'flac', '320k', '128k'];
        const idx = allQualities.indexOf(preferred);
        if (idx === -1) return allQualities;
        return allQualities.slice(idx);
    },

    // 代理 URL 逻辑（适配新 API）
    getProxyUrl(url, source = null) {
        if (!url) return url;
        const API_BASE = this.endpoints.base;
        const PROXY_BASE = `${API_BASE}/proxy?url=`;

        if (url.startsWith('http://') && (url.includes('music.126.net') || url.includes('qq.com'))) {
            url = url.replace('http://', 'https://');
        }
        if (url.includes('kuwo.cn') && url.startsWith('https://')) {
            url = url.replace('https://', 'http://');
        }

        if (url.startsWith(PROXY_BASE) ||
            url.includes('localhost') ||
            url.includes('127.0.0.1')) return url;

        if (url.includes('music.126.net') && url.startsWith('https://')) {
            return url;
        }

        const needProxyByDomain = url.includes('126.net') ||
            url.includes('qq.com') ||
            url.includes('kuwo.cn') ||
            url.includes('sycdn.kuwo.cn');
        const isKuwoApiUrl = url.includes('source=kuwo') || source === 'kuwo';

        if (needProxyByDomain || isKuwoApiUrl) {
            return PROXY_BASE + encodeURIComponent(url);
        }
        return url;
    },

    // ========== 新增：通用鉴权头 ==========
    getCommonHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-API-Key': this.endpoints.apiKey
        };
    },

    // ========== 新增：跨域代理（解决 CORS 报错） ==========
    getCorsProxyUrl(targetUrl) {
        // 稳定的免费跨域代理，优先用这个
        return `https://corsproxy.io/?${new URLSearchParams({ url: targetUrl })}`;
    },

    // ========== 方法下发：获取配置（修复模板变量） ==========
    async getMethodConfig(platform, func) {
        try {
            const url = `${this.endpoints.base}/v1/methods/${platform}/${func}`;
            const res = await fetch(url, {
                headers: this.getCommonHeaders()
            });
            const result = await res.json();
            if (result.code !== 0) {
                throw new Error(`获取${func}配置失败: ${result.message || '未知错误'}`);
            }
            return result.data;
        } catch (e) {
            console.error(`获取${platform}-${func}配置出错:`, e);
            UI?.showToast(`获取${platform}音乐配置失败`, 'error');
            return null;
        }
    },

    // ========== 搜索功能（修复跨域+模板变量） ==========
    async search(keyword, source, page = 1, limit = 20, signal = null) {
        if (!keyword) return [];

        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        try {
            // Step 1: 获取搜索配置
            const config = await this.getMethodConfig(source, 'search');
            if (!config) return [];

            // Step 2: 修复模板变量替换（兼容所有 {{}} 写法）
            const pageNum = page - 1;
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                let replacedValue = value;
                // 兼容 {{keyword}} / {keyword} / keyword 等写法
                replacedValue = replacedValue.replace(/\{\{keyword\}\}|\{keyword\}|keyword/g, encodeURIComponent(keyword));
                replacedValue = replacedValue.replace(/\{\{page\}\}|\{page\}|page/g, pageNum.toString());
                replacedValue = replacedValue.replace(/\{\{pageSize\}\}|\{pageSize\}|pageSize/g, limit.toString());
                replacedParams[key] = replacedValue;
            }

            // Step 3: 构造请求 URL
            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const fetchOptions = {
                method: config.method,
                headers: config.headers || {},
                signal
            };

            // Step 4: 加跨域代理（核心解决 CORS 报错）
            const proxyUrl = this.getCorsProxyUrl(url.toString());
            const res = await fetch(proxyUrl, fetchOptions);

            // Step 5: 处理响应
            if (!res.ok) {
                const srcMap = { 'netease': '网易', 'qq': 'QQ', 'kuwo': '酷我' };
                const srcName = srcMap[source] || source;
                UI?.showToast(`${srcName}音乐搜索失败，请稍后重试`, 'error');
                return [];
            }

            const rawData = await res.json();
            // 执行数据转换
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('数据转换失败:', e);
                }
            }

            // Step 6: 格式化数据（保持原有结构）
            const list = finalData.results || finalData.list || (Array.isArray(finalData) ? finalData : []);
            if (!Array.isArray(list)) return [];

            const results = list.map(item => {
                const sid = String(item.id || item.songid || item.mid || '');
                const src = item.platform || item.source || source;
                let coverUrl = item.pic || item.cover || item.image || '';
                if (coverUrl) {
                    coverUrl = this.getProxyUrl(coverUrl, src);
                } else if (src === 'kuwo' && sid) {
                    coverUrl = this.getProxyUrl(`${this.endpoints.base}/v1/methods/kuwo/pic?id=${sid}`, src);
                }
                return {
                    id: `${src}-${sid}`,
                    songId: sid,
                    title: item.name || item.title || '未知歌曲',
                    artist: item.artist || item.author || '未知歌手',
                    album: item.album || item.albumname || '-',
                    cover: coverUrl,
                    source: src,
                    duration: item.interval || item.duration || 0,
                    quality: item.quality,
                    types: item.types || [],
                    url: item.url || '',
                    lrc: item.lrc || '',
                    originalData: item
                };
            }).filter(s => s.songId);

            // 缓存结果
            if (this.searchCache.size > 100) {
                const firstKey = this.searchCache.keys().next().value;
                this.searchCache.delete(firstKey);
            }
            this.searchCache.set(cacheKey, results);

            return results;
        } catch (e) {
            if (e.name === 'AbortError') return [];
            const srcMap = { 'netease': '网易', 'qq': 'QQ', 'kuwo': '酷我' };
            const srcName = srcMap[source] || source;
            UI?.showToast(`${srcName}音乐搜索失败: ${e.message}`, 'error');
            return [];
        }
    },

    // ========== 聚合搜索（保持兼容） ==========
    async aggregateSearch(keyword, signal = null) {
        if (!keyword) return [];
        try {
            const allResults = [];
            for (const source of this.sources) {
                const results = await this.search(keyword, source, 1, 20, signal);
                allResults.push(...results);
            }
            return allResults;
        } catch (e) {
            if (e.name === 'AbortError') return [];
            console.error('聚合搜索出错:', e);
            return [];
        }
    },

    urlCache: new Map(),

    // ========== 歌曲详情/播放（适配新解析接口） ==========
    async getSongDetails(track) {
        try {
            const cacheKey = `${track.source}-${track.songId || track.id}`;
            if (this.urlCache.has(cacheKey)) {
                const cached = this.urlCache.get(cacheKey);
                track.url = cached.url;
                track.cover = cached.cover || track.cover;
                track.lrc = cached.lrc || track.lrc;
                return track;
            }

            let existingUrl = track.url || (track.originalData && track.originalData.url);
            if (existingUrl) {
                track.url = this.getProxyUrl(existingUrl, track.source);
                const sid = track.songId || (track.id && String(track.id).split('-')[1] || track.id);
                if (track.source === 'kuwo' && sid && !track.cover) {
                    track.cover = this.getProxyUrl(`${this.endpoints.base}/v1/methods/kuwo/pic?id=${sid}`, track.source);
                } else {
                    track.cover = this.getProxyUrl(track.cover || track.originalData?.pic || '', track.source);
                }
                track.lrc = track.lrc || track.originalData?.lrc || '';
            } else {
                // 适配新的 /v1/parse 解析接口
                const qualities = this.getQualityChain(this.preferredQuality);
                let detailData = null;
                const sid = track.songId || (track.id && String(track.id).split('-')[1] || track.id);

                if (sid) {
                    for (const br of qualities) {
                        try {
                            // 过滤网易云不支持的 flac24bit
                            const realBr = track.source === 'netease' && br === 'flac24bit' ? 'flac' : br;
                            
                            const res = await fetch(`${this.endpoints.base}/v1/parse`, {
                                method: 'POST',
                                headers: this.getCommonHeaders(),
                                body: JSON.stringify({
                                    platform: track.source,
                                    ids: sid,
                                    quality: realBr
                                })
                            });

                            if (!res.ok) continue;
                            const result = await res.json();
                            
                            if (result.code === 0 && result.data && result.data[sid]) {
                                detailData = result.data[sid];
                                break;
                            }
                        } catch (e) {
                            if (e.name === 'AbortError') console.log('请求超时:', br);
                            continue;
                        }
                    }

                    if (detailData && sid) {
                        track.url = this.getProxyUrl(detailData.url || '', track.source);
                        track.cover = this.getProxyUrl(detailData.pic || track.cover || '', track.source);
                        track.lrc = detailData.lrc || track.lrc || '';

                        // 单独获取歌词
                        if (!track.lrc) {
                            const lrcConfig = await this.getMethodConfig(track.source, 'lrc');
                            if (lrcConfig) {
                                const replacedParams = {};
                                for (const [key, value] of Object.entries(lrcConfig.params || {})) {
                                    replacedParams[key] = value.replace(/\{\{id\}\}|\{id\}|id/g, sid);
                                }
                                const url = new URL(lrcConfig.url);
                                url.search = new URLSearchParams(replacedParams);
                                const proxyUrl = this.getCorsProxyUrl(url.toString());
                                const lrcRes = await fetch(proxyUrl, {
                                    method: lrcConfig.method,
                                    headers: lrcConfig.headers || {}
                                });
                                if (lrcRes.ok) {
                                    track.lrc = await lrcRes.text();
                                }
                            }
                        }
                    }
                }
            }

            // 缓存结果
            if (track.url) {
                if (this.urlCache.size > 200) {
                    const firstKey = this.urlCache.keys().next().value;
                    this.urlCache.delete(firstKey);
                }
                this.urlCache.set(cacheKey, { url: track.url, cover: track.cover, lrc: track.lrc });
            }

            // 加载歌词文本
            if (typeof track.lrc === 'string' && track.lrc.startsWith('http')) {
                try {
                    track.lrc = await this.fetchLrcText(track.lrc);
                } catch (e) {
                    console.warn('加载歌词失败:', e);
                }
            }
        } catch (e) {
            console.error("获取歌曲详情失败:", e);
        }
        return track;
    },

    // ========== 解析歌单URL（保持原有逻辑） ==========
    parsePlaylistUrl(url) {
        if (!url) return null;
        url = url.trim();

        if (url.includes('163.com')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match) return { source: 'netease', id: match[1] };
        }

        if (url.includes('qq.com') || url.includes('tencent')) {
            const match = url.match(/[?&]id=([\d\w]+)/);
            if (match) return { source: 'qq', id: match[1] };
        }

        if (url.includes('kuwo.cn')) {
            const match = url.match(/playlist_detail\/(\d+)/);
            if (match) return { source: 'kuwo', id: match[1] };
        }

        if (/^\d+$/.test(url)) {
            return { source: null, id: url };
        }

        return null;
    },

    // ========== 歌单歌曲（修复跨域+模板变量） ==========
    async getPlaylistSongs(source, playlistId) {
        try {
            const config = await this.getMethodConfig(source, 'playlist');
            if (!config) return { name: '未知歌单', tracks: [] };

            // 修复模板变量替换
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                let replacedValue = value;
                replacedValue = replacedValue.replace(/\{\{id\}\}|\{id\}|id/g, playlistId);
                replacedParams[key] = replacedValue;
            }

            // 构造请求 + 跨域代理
            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const proxyUrl = this.getCorsProxyUrl(url.toString());
            const res = await fetch(proxyUrl, {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return { name: '未知歌单', tracks: [] };
            const rawData = await res.json();
            
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('歌单数据转换失败:', e);
                }
            }

            const list = finalData.list || finalData.results || (Array.isArray(finalData) ? finalData : []);
            if (!Array.isArray(list)) return { name: '未知歌单', tracks: [] };

            return {
                name: (finalData.info && finalData.info.name) || '未知歌单',
                tracks: list.map(s => {
                    const sid = String(s.id || s.songid || s.mid || '');
                    const src = s.platform || s.source || source;
                    let coverUrl = s.pic || s.cover || '';
                    if (coverUrl) {
                        coverUrl = this.getProxyUrl(coverUrl, src);
                    } else if (src === 'kuwo' && sid) {
                        coverUrl = this.getProxyUrl(`${this.endpoints.base}/v1/methods/kuwo/pic?id=${sid}`, src);
                    }
                    return {
                        id: `${src}-${sid}`,
                        songId: sid,
                        title: s.name || s.title || '未知歌曲',
                        artist: s.artist || s.author || '未知歌手',
                        album: s.album || '-',
                        cover: coverUrl,
                        source: src,
                        url: s.url || '',
                        lrc: s.lrc || '',
                        types: s.types || []
                    };
                }).filter(s => s.songId)
            };
        } catch (e) {
            console.error("获取歌单歌曲失败:", e);
        }
        return { name: '未知歌单', tracks: [] };
    },

    // ========== 榜单列表（修复跨域） ==========
    async getBillboardList(source) {
        try {
            const config = await this.getMethodConfig(source, 'toplists');
            if (!config) return [];

            const url = new URL(config.url);
            url.search = new URLSearchParams(config.params || {});
            const proxyUrl = this.getCorsProxyUrl(url.toString());
            const res = await fetch(proxyUrl, {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return [];
            const rawData = await res.json();
            
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('榜单列表转换失败:', e);
                }
            }

            const list = finalData.list || finalData.results || (Array.isArray(finalData) ? finalData : []);
            return list.map(item => {
                let picUrl = item.pic || item.cover || item.image || '';
                if (picUrl) {
                    picUrl = this.getProxyUrl(picUrl, source);
                }
                return {
                    id: item.id || item.uid,
                    name: item.name || item.title || '未知榜单',
                    pic: picUrl,
                    updateFrequency: item.updateFrequency || ''
                };
            });
        } catch (e) {
            console.error("获取榜单列表失败:", e);
        }
        return [];
    },

    // ========== 榜单详情（修复跨域+模板变量） ==========
    async getBillboardDetail(source, id) {
        try {
            const config = await this.getMethodConfig(source, 'toplist');
            if (!config) return [];

            // 修复模板变量
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                let replacedValue = value;
                replacedValue = replacedValue.replace(/\{\{id\}\}|\{id\}|id/g, id);
                replacedParams[key] = replacedValue;
            }

            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const proxyUrl = this.getCorsProxyUrl(url.toString());
            const res = await fetch(proxyUrl, {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return [];
            const rawData = await res.json();
            
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('榜单详情转换失败:', e);
                }
            }

            const list = finalData.list || finalData.results || finalData.songs || (Array.isArray(finalData) ? finalData : []);
            if (!Array.isArray(list)) return [];

            return list.map(s => {
                const sid = String(s.id || s.songid || s.mid || '');
                let coverUrl = s.pic || s.cover || '';
                if (source === 'kuwo') {
                    if (coverUrl) {
                        coverUrl = this.getProxyUrl(coverUrl, source);
                    } else if (sid) {
                        coverUrl = this.getProxyUrl(`${this.endpoints.base}/v1/methods/kuwo/pic?id=${sid}`, source);
                    }
                }
                return {
                    id: `${source}-${sid}`,
                    songId: sid,
                    title: s.name || s.title || '未知歌曲',
                    artist: s.artist || s.author || '未知歌手',
                    album: s.album || '-',
                    cover: coverUrl,
                    source: source,
                    url: s.url || '',
                    lrc: s.lrc || ''
                };
            }).filter(s => s.songId);
        } catch (e) {
            console.error("获取榜单详情失败:", e);
        }
        return [];
    },

    // ========== 歌词加载（保持原有逻辑） ==========
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
                console.warn(`歌词代理失败: ${proxyUrl}`, e);
            }
        }
        return lrcUrl;
    },

    // ========== 兼容方法（保持原有逻辑） ==========
    async searchNetease(keyword, page, limit) { return this.search(keyword, 'netease', page, limit); },
    async searchCommon(keyword, source, page, limit) { return this.search(keyword, source, page, limit); }
};
