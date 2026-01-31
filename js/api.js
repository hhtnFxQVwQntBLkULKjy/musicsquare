const MusicAPI = {
    // Configuration
    sources: ['netease', 'qq', 'kuwo'], // migu removed from active sources

    // ========== 核心修改1：替换新 API 配置 ==========
    // 新的 TuneHub V3 API 基础配置
    endpoints: {
        base: 'https://tunehub.sayqz.com/api', // 新的 Base URL
        apiKey: 'th_9a7e8ecbe2028f7a7ba22e469694d6c10184ecf7797eae15' // 替换成你自己的 API Key（从 Linux DO 后台获取）
    },

    searchCache: new Map(),

    // Quality preference - 保持不变
    get preferredQuality() {
        return localStorage.getItem('preferredQuality') || 'flac24bit';
    },
    set preferredQuality(val) {
        localStorage.setItem('preferredQuality', val);
    },

    // 保持不变
    getQualityChain(preferred) {
        const allQualities = ['flac24bit', 'flac', '320k', '128k'];
        const idx = allQualities.indexOf(preferred);
        if (idx === -1) return allQualities;
        return allQualities.slice(idx);
    },

    // ========== 核心修改2：更新代理逻辑（适配新 API） ==========
    getProxyUrl(url, source = null) {
        if (!url) return url;
        // 新的代理 Base URL（如果你的 API_BASE 没定义，需要确认下项目里的定义，这里先兼容）
        const API_BASE = this.endpoints.base;
        const PROXY_BASE = `${API_BASE}/proxy?url=`;

        // 原有逻辑保持不变
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

    // ========== 核心修改3：通用请求头（所有新 API 都需要） ==========
    getCommonHeaders() {
        return {
            'Content-Type': 'application/json',
            'X-API-Key': this.endpoints.apiKey
        };
    },

    // ========== 核心修改4：适配新 API 的“方法下发” - 获取请求配置 ==========
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

    // ========== 核心修改5：替换旧的 search 方法（适配方法下发） ==========
    async search(keyword, source, page = 1, limit = 20, signal = null) {
        if (!keyword) return [];

        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        try {
            // Step 1: 获取搜索方法配置
            const config = await this.getMethodConfig(source, 'search');
            if (!config) return [];

            // Step 2: 替换模板变量（page 从 0 开始，旧代码是从 1 开始，需要转换）
            const pageNum = page - 1; // 新 API 的 page 是 0 起始
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                replacedParams[key] = value
                    .replace('{{keyword}}', encodeURIComponent(keyword))
                    .replace('{{page}}', pageNum.toString())
                    .replace('{{pageSize}}', limit.toString());
            }

            // Step 3: 构造请求 URL 并发起请求
            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const fetchOptions = {
                method: config.method,
                headers: config.headers || {},
                signal
            };
            const res = await fetch(url.toString(), fetchOptions);

            // Step 4: 处理返回数据
            if (!res.ok) {
                const srcMap = { 'netease': '网易', 'qq': 'QQ', 'kuwo': '酷我' };
                const srcName = srcMap[source] || source;
                UI?.showToast(`${srcName}音乐搜索失败，请稍后重试`, 'error');
                return [];
            }

            const rawData = await res.json();
            // 执行 transform 函数处理数据格式
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('数据转换失败:', e);
                }
            }

            // Step 5: 格式化数据（和旧代码返回格式保持一致）
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

    // ========== 核心修改6：替换 aggregateSearch（聚合搜索） ==========
    async aggregateSearch(keyword, signal = null) {
        if (!keyword) return [];
        try {
            // 聚合搜索：依次调用各平台搜索，合并结果
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

    // ========== 核心修改7：替换 getSongDetails（适配新的 /v1/parse 接口） ==========
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
                // 原有逻辑保持不变
                track.url = this.getProxyUrl(existingUrl, track.source);
                const sid = track.songId || (track.id && String(track.id).split('-')[1] || track.id);
                if (track.source === 'kuwo' && sid && !track.cover) {
                    track.cover = this.getProxyUrl(`${this.endpoints.base}/v1/methods/kuwo/pic?id=${sid}`, track.source);
                } else {
                    track.cover = this.getProxyUrl(track.cover || track.originalData?.pic || '', track.source);
                }
                track.lrc = track.lrc || track.originalData?.lrc || '';
            } else {
                // 新逻辑：调用 /v1/parse 接口获取播放链接
                const qualities = this.getQualityChain(this.preferredQuality);
                let detailData = null;
                const sid = track.songId || (track.id && String(track.id).split('-')[1] || track.id);

                if (sid) {
                    for (const br of qualities) {
                        try {
                            // 过滤网易云不支持的 flac24bit
                            const realBr = track.source === 'netease' && br === 'flac24bit' ? 'flac' : br;
                            
                            // 调用新的解析接口
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
                            
                            // 成功获取播放链接
                            if (result.code === 0 && result.data && result.data[sid]) {
                                detailData = result.data[sid];
                                break;
                            }
                        } catch (e) {
                            if (e.name === 'AbortError') console.log('请求超时:', br);
                            continue;
                        }
                    }

                    // 处理封面和歌词
                    if (detailData && sid) {
                        track.url = this.getProxyUrl(detailData.url || '', track.source);
                        track.cover = this.getProxyUrl(detailData.pic || track.cover || '', track.source);
                        track.lrc = detailData.lrc || track.lrc || '';

                        // 单独获取歌词（如果需要）
                        if (!track.lrc) {
                            const lrcConfig = await this.getMethodConfig(track.source, 'lrc');
                            if (lrcConfig) {
                                const replacedParams = {};
                                for (const [key, value] of Object.entries(lrcConfig.params || {})) {
                                    replacedParams[key] = value.replace('{{id}}', sid);
                                }
                                const url = new URL(lrcConfig.url);
                                url.search = new URLSearchParams(replacedParams);
                                const lrcRes = await fetch(url.toString(), {
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

    // 保持不变
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

    // ========== 核心修改8：替换 getPlaylistSongs（适配方法下发） ==========
    async getPlaylistSongs(source, playlistId) {
        try {
            // Step 1: 获取歌单方法配置
            const config = await this.getMethodConfig(source, 'playlist');
            if (!config) return { name: '未知歌单', tracks: [] };

            // Step 2: 替换 {{id}} 变量
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                replacedParams[key] = value.replace('{{id}}', playlistId);
            }

            // Step 3: 发起请求
            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const res = await fetch(url.toString(), {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return { name: '未知歌单', tracks: [] };
            const rawData = await res.json();
            
            // 执行数据转换
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('歌单数据转换失败:', e);
                }
            }

            // 格式化数据
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

    // ========== 核心修改9：替换 getBillboardList（适配方法下发） ==========
    async getBillboardList(source) {
        try {
            // 获取排行榜列表配置
            const config = await this.getMethodConfig(source, 'toplists');
            if (!config) return [];

            // 发起请求
            const url = new URL(config.url);
            url.search = new URLSearchParams(config.params || {});
            const res = await fetch(url.toString(), {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return [];
            const rawData = await res.json();
            
            // 数据转换
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('榜单列表转换失败:', e);
                }
            }

            // 格式化数据
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

    // ========== 核心修改10：替换 getBillboardDetail（适配方法下发） ==========
    async getBillboardDetail(source, id) {
        try {
            // 获取排行榜详情配置
            const config = await this.getMethodConfig(source, 'toplist');
            if (!config) return [];

            // 替换 {{id}} 变量
            const replacedParams = {};
            for (const [key, value] of Object.entries(config.params || {})) {
                replacedParams[key] = value.replace('{{id}}', id);
            }

            // 发起请求
            const url = new URL(config.url);
            url.search = new URLSearchParams(replacedParams);
            const res = await fetch(url.toString(), {
                method: config.method,
                headers: config.headers || {}
            });

            if (!res.ok) return [];
            const rawData = await res.json();
            
            // 数据转换
            let finalData = rawData;
            if (config.transform) {
                try {
                    const transformFn = eval(`(${config.transform})`);
                    finalData = transformFn(rawData);
                } catch (e) {
                    console.error('榜单详情转换失败:', e);
                }
            }

            // 格式化数据
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

    // 保持不变
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

    // 兼容方法保持不变
    async searchNetease(keyword, page, limit) { return this.search(keyword, 'netease', page, limit); },
    async searchCommon(keyword, source, page, limit) { return this.search(keyword, source, page, limit); }
};
