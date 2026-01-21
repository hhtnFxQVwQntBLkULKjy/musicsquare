const MusicAPI = {
    // Configuration
    sources: ['netease', 'qq', 'kuwo'], // migu removed from active sources

    // API Endpoints
    endpoints: {
        base: 'https://music-dl.sayqz.com/api/',
    },

    searchCache: new Map(),

    getProxyUrl(url, source = null) {
        if (!url) return url;
        const PROXY_BASE = 'https://api.yexin.de5.net/api/proxy?url=';

        if (url.startsWith(PROXY_BASE) ||
            url.includes('localhost') ||
            url.includes('127.0.0.1')) return url;

        // HTTPS netease CDN works without proxy
        if (url.includes('music.126.net') && url.startsWith('https://')) {
            return url;
        }

        // Check if URL needs proxy based on domain patterns
        const needProxyByDomain = url.includes('126.net') ||
            url.includes('qq.com') ||
            url.includes('kuwo.cn') ||
            url.includes('sycdn.kuwo.cn');

        // Check if it's an API URL for kuwo source (these redirect to CORS-blocked CDN)
        const isKuwoApiUrl = url.includes('source=kuwo') || source === 'kuwo';

        if (needProxyByDomain || isKuwoApiUrl) {
            return PROXY_BASE + encodeURIComponent(url);
        }
        return url;
    },

    async search(keyword, source, page = 1, limit = 20) {
        if (!keyword) return [];

        const cacheKey = `${source}:${keyword}:${page}:${limit}`;
        if (this.searchCache.has(cacheKey)) {
            return this.searchCache.get(cacheKey);
        }

        try {
            const url = `${this.endpoints.base}?source=${source}&type=search&keyword=${encodeURIComponent(keyword)}&page=${page}&limit=${limit}`;
            const res = await fetch(url);
            const json = await res.json();

            if (json.message && json.message.includes('重试次数过多')) {
                const srcMap = { 'netease': '网易', 'qq': 'QQ', 'kuwo': '酷我' };
                const srcName = srcMap[source] || source;
                UI.showToast(`${srcName}音乐: 搜索过于频繁，请稍后再试`, 'warning');
                return [];
            }

            if (json.code !== 200 || !json.data) return [];

            const list = json.data.results || json.data.list || (Array.isArray(json.data) ? json.data : []);
            if (!Array.isArray(list)) return [];

            const results = list.map(item => {
                const sid = String(item.id || item.songid || item.mid || '');
                const src = item.platform || item.source || source;
                return {
                    id: `${src}-${sid}`,
                    songId: sid,
                    title: item.name || item.title || '未知歌曲',
                    artist: item.artist || item.author || '未知歌手',
                    album: item.album || item.albumname || '-',
                    cover: item.pic || item.cover || item.image || '',
                    source: src,
                    duration: item.interval || item.duration || 0,
                    quality: item.quality,
                    types: item.types || [],
                    url: item.url || '',  // Preserve URL from API
                    lrc: item.lrc || '',  // Preserve lyrics from API
                    originalData: item
                };
            }).filter(s => s.songId);

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

    async aggregateSearch(keyword) {
        if (!keyword) return [];
        try {
            const url = `${this.endpoints.base}?type=aggregateSearch&keyword=${encodeURIComponent(keyword)}`;
            const res = await fetch(url);
            const json = await res.json();

            const list = json.data.results || json.data.list || (Array.isArray(json.data) ? json.data : []);
            if (!Array.isArray(list)) return [];

            return list.map(item => {
                const sid = String(item.id || item.songid || item.mid || '');
                const src = item.platform || item.source || 'netease';
                return {
                    id: `${src}-${sid}`,
                    songId: sid,
                    title: item.name || item.title || '未知歌曲',
                    artist: item.artist || item.author || '未知歌手',
                    album: item.album || '-',
                    cover: item.pic || item.cover || '',
                    source: src,
                    duration: item.interval || item.duration || 0,
                    quality: item.quality,
                    types: item.types || [],
                    url: item.url || '',
                    lrc: item.lrc || '',
                    originalData: item
                };
            }).filter(s => s.songId);
        } catch (e) {
            console.error(`Aggregate search error:`, e);
            return [];
        }
    },

    // URL cache to avoid repeated API requests
    urlCache: new Map(),

    async getSongDetails(track) {
        try {
            // Check cache first
            const cacheKey = `${track.source}-${track.songId || track.id}`;
            if (this.urlCache.has(cacheKey)) {
                const cached = this.urlCache.get(cacheKey);
                track.url = cached.url;
                track.cover = cached.cover || track.cover;
                track.lrc = cached.lrc || track.lrc;
                return track;
            }

            // Check if we already have a URL from the API response (originalData or direct)
            let existingUrl = track.url || (track.originalData && track.originalData.url);

            // If we have an existing URL, use it directly (no need to try higher qualities)
            if (existingUrl) {
                track.url = this.getProxyUrl(existingUrl, track.source);
                track.cover = track.cover || (track.originalData && track.originalData.pic) || '';
                track.lrc = track.lrc || (track.originalData && track.originalData.lrc) || '';
            } else {
                // Automatic quality degradation: try one by one (sequential, not parallel)
                // flac24bit → flac → 320k → 128k
                const qualities = ['flac24bit', 'flac', '320k', '128k'];
                let detailData = null;

                const sid = track.songId || (track.id && String(track.id).includes('-') ? String(track.id).split('-')[1] : track.id);

                if (sid) {
                    for (const br of qualities) {
                        try {
                            const apiUrl = `${this.endpoints.base}?source=${track.source}&id=${sid}&type=url&br=${br}`;
                            const controller = new AbortController();
                            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

                            // For kuwo, don't follow redirects to avoid CORS issues
                            const fetchOptions = {
                                signal: controller.signal,
                                redirect: track.source === 'kuwo' ? 'manual' : 'follow'
                            };

                            const res = await fetch(apiUrl, fetchOptions);
                            clearTimeout(timeoutId);

                            // Handle redirect for kuwo - the API redirects to CDN URL
                            if (track.source === 'kuwo' && (res.status === 301 || res.status === 302 || res.type === 'opaqueredirect')) {
                                // For kuwo, use the API URL directly as it acts as a proxy
                                detailData = { url: apiUrl };
                                break;
                            }

                            if (!res.ok) continue;

                            const text = await res.text();
                            if (!text || text.startsWith('fLaC') || text.startsWith('ID3')) {
                                // It's a raw audio stream, use the API URL as the audio source
                                detailData = { url: apiUrl };
                                break;
                            }

                            const json = JSON.parse(text);
                            if (json.code === 200 && json.data && json.data.url) {
                                detailData = json.data;
                                break;
                            }
                        } catch (e) {
                            if (e.name === 'AbortError') console.log('Request timeout for', br);
                            continue;
                        }
                    }

                    // If we got URL but missing cover/lrc, fetch them separately
                    if (detailData && sid) {
                        // Fetch cover if missing
                        if (!detailData.pic && !track.cover) {
                            const picUrl = `${this.endpoints.base}?source=${track.source}&id=${sid}&type=pic`;
                            track.cover = picUrl; // Use API as proxy for cover
                        }
                        // Fetch lyrics if missing
                        if (!detailData.lrc && !track.lrc) {
                            const lrcUrl = `${this.endpoints.base}?source=${track.source}&id=${sid}&type=lrc`;
                            track.lrc = lrcUrl; // Will be fetched below
                        }
                    }
                }

                if (detailData) {
                    track.url = this.getProxyUrl(detailData.url, track.source);
                    track.cover = detailData.pic || track.cover;
                    track.lrc = detailData.lrc || track.lrc;
                }
            }

            // Cache the result if we have a URL
            if (track.url) {
                if (this.urlCache.size > 200) {
                    const firstKey = this.urlCache.keys().next().value;
                    this.urlCache.delete(firstKey);
                }
                this.urlCache.set(cacheKey, { url: track.url, cover: track.cover, lrc: track.lrc });
            }

            // If we have a lyric URL, fetch it synchronously for better UX
            if (typeof track.lrc === 'string' && track.lrc.startsWith('http')) {
                try {
                    track.lrc = await this.fetchLrcText(track.lrc);
                } catch (e) {
                    console.warn('Failed to fetch lyrics:', e);
                }
            }
        } catch (e) {
            console.error("Detail fetch error:", e);
        }
        return track;
    },

    parsePlaylistUrl(url) {
        if (!url) return null;
        url = url.trim();

        // Netease: https://y.music.163.com/m/playlist?id=6586246706
        if (url.includes('163.com')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match) return { source: 'netease', id: match[1] };
        }

        // QQ: https://i2.y.qq.com/n3/other/pages/details/playlist.html?id=3817475436
        if (url.includes('qq.com') || url.includes('tencent')) {
            const match = url.match(/[?&]id=([\d\w]+)/);
            if (match) return { source: 'qq', id: match[1] };
        }

        // Kuwo: https://m.kuwo.cn/newh5app/playlist_detail/3026741014
        if (url.includes('kuwo.cn')) {
            const match = url.match(/playlist_detail\/(\d+)/);
            if (match) return { source: 'kuwo', id: match[1] };
        }

        // Raw numeric ID fallback
        if (/^\d+$/.test(url)) {
            return { source: null, id: url };
        }

        return null;
    },

    async getPlaylistSongs(source, playlistId) {
        try {
            const url = `${this.endpoints.base}?source=${source}&id=${playlistId}&type=playlist`;
            const res = await fetch(url);
            const json = await res.json();

            if (json.code === 200 && json.data) {
                const list = json.data.list || json.data.results || (Array.isArray(json.data) ? json.data : []);
                if (!Array.isArray(list)) return { name: '未知歌单', tracks: [] };

                return {
                    name: (json.data.info && json.data.info.name) ? json.data.info.name : '未知歌单',
                    tracks: list.map(s => {
                        const sid = String(s.id || s.songid || s.mid || '');
                        const src = s.platform || s.source || source;
                        return {
                            id: `${src}-${sid}`,
                            songId: sid,
                            title: s.name || s.title || '未知歌曲',
                            artist: s.artist || s.author || '未知歌手',
                            album: s.album || '-',
                            cover: s.pic || s.cover || '',
                            source: src,
                            url: s.url || '',
                            lrc: s.lrc || '',
                            types: s.types || []
                        };
                    }).filter(s => s.songId)
                };
            }
        } catch (e) {
            console.error("Playlist songs fetch error:", e);
        }
        return { name: '未知歌单', tracks: [] };
    },

    async getBillboardList(source) {
        try {
            const url = `${this.endpoints.base}?source=${source}&type=toplists`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.code === 200 && json.data) {
                const list = json.data.list || json.data.results || (Array.isArray(json.data) ? json.data : []);
                return list.map(item => ({
                    id: item.id || item.uid,
                    name: item.name || item.title || '未知榜单',
                    pic: item.pic || item.cover || item.image || '',
                    updateFrequency: item.updateFrequency || ''
                }));
            }
        } catch (e) {
            console.error("Billboard list fetch error:", e);
        }
        return [];
    },

    async getBillboardDetail(source, id) {
        try {
            // Use type=toplist for billboard detail (not toplists)
            const url = `${this.endpoints.base}?type=toplist&source=${source}&id=${id}`;
            const res = await fetch(url);
            const json = await res.json();
            if (json.code === 200 && json.data) {
                const list = json.data.list || json.data.results || json.data.songs || (Array.isArray(json.data) ? json.data : []);
                if (!Array.isArray(list)) return [];

                return list.map(s => {
                    const sid = String(s.id || s.songid || s.mid || '');
                    // For Kuwo, use API proxy for cover images to bypass CORS
                    let coverUrl = s.pic || '';
                    if (source === 'kuwo' && sid) {
                        coverUrl = `${this.endpoints.base}?source=kuwo&id=${sid}&type=pic`;
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
            }
        } catch (e) {
            console.error("Billboard detail fetch error:", e);
        }
        return [];
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
        return lrcUrl;
    },

    // Compatibility methods - all now go through common search
    async searchNetease(keyword, page, limit) { return this.search(keyword, 'netease', page, limit); },
    async searchCommon(keyword, source, page, limit) { return this.search(keyword, source, page, limit); }
};
