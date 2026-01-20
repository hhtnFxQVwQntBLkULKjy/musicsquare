
export default {
    async fetch(request, env) {
        // 1. CORS Headers
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type, Authorization",
                },
            });
        }

        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": "application/json",
        };

        const json = (data, status = 200) =>
            new Response(JSON.stringify(data), { status, headers: corsHeaders });
        const error = (msg, status = 400) =>
            new Response(JSON.stringify({ error: msg }), { status, headers: corsHeaders });

        const url = new URL(request.url);
        const path = url.pathname;

        // --- Auth Helper ---
        const getUserId = () => {
            const auth = request.headers.get("Authorization");
            if (!auth) return null;
            return parseInt(auth.split(" ")[1]);
        };

        // --- Routes ---

        // 1. Auth: Register
        if (path === "/api/auth/register" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                if (!username || !password) return error("Missing username or password");

                const exists = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
                if (exists) return error("Username already exists");

                const avatar = `https://ui-avatars.com/api/?name=${username}&background=random`;
                const res = await env.DB.prepare(
                    "INSERT INTO users (username, password, avatar, created_at) VALUES (?, ?, ?, ?)"
                ).bind(username, password, avatar, Date.now()).run();

                if (res.success) return json({ success: true, message: "User created" });
                return error("Failed to create user");
            } catch (e) {
                return error(e.message, 500);
            }
        }

        // 2. Auth: Login
        if (path === "/api/auth/login" && request.method === "POST") {
            try {
                const { username, password } = await request.json();
                const user = await env.DB.prepare(
                    "SELECT * FROM users WHERE username = ? AND password = ?"
                ).bind(username, password).first();

                if (!user) return error("Invalid credentials", 401);
                return json({ success: true, user: { id: user.id, username: user.username, avatar: user.avatar } });
            } catch (e) {
                return error(e.message, 500);
            }
        }

        // 3. User: Profile Update (Avatar)
        if (path === "/api/user/profile" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { avatar, username } = await request.json();

            if (username) {
                await env.DB.prepare("UPDATE users SET username = ? WHERE id = ?").bind(username, userId).run();
            }
            if (avatar) {
                await env.DB.prepare("UPDATE users SET avatar = ? WHERE id = ?").bind(avatar, userId).run();
            }

            return json({ success: true });
        }

        // 9. Netease & QQ QR Code Login

        // === QQ Music QR Code (Stateless) ===
        if (path === "/api/qq/qr/create" && request.method === "GET") {
            try {
                const qqProxyUrl = "https://corsproxy.io/?url=" + encodeURIComponent(
                    "https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=0.8"
                );

                const res = await fetch(qqProxyUrl, {
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                });

                const setCookie = res.headers.get("set-cookie");
                let qrsig = "";
                if (setCookie) {
                    const match = setCookie.match(/qrsig=([^;]+)/);
                    if (match) qrsig = match[1];
                }

                const arrayBuffer = await res.arrayBuffer();
                let binary = '';
                const bytes = new Uint8Array(arrayBuffer);
                const len = bytes.byteLength;
                for (let i = 0; i < len; i++) {
                    binary += String.fromCharCode(bytes[i]);
                }
                const base64 = btoa(binary);

                return json({
                    success: true,
                    qrsig,
                    image: `data:image/png;base64,${base64}`,
                    tip: "请使用QQ或微信扫描二维码"
                });
            } catch (e) {
                return json({
                    success: true,
                    qrsig: "fallback_" + Date.now(),
                    image: "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https%3A%2F%2Fy.qq.com%2F",
                    tip: "扫码后请在QQ音乐网页版登录"
                });
            }
        }

        if (path === "/api/qq/qr/check" && request.method === "POST") {
            try {
                const { qrsig } = await request.json();
                if (!qrsig) return error("Missing qrsig");

                let hash = 0;
                for (let i = 0; i < qrsig.length; ++i) {
                    hash += (hash << 5) + qrsig.charCodeAt(i);
                }
                const ptqrtoken = hash & 0x7fffffff;

                const checkUrl = `https://ssl.ptlogin2.qq.com/ptqrlogin?ptqrtoken=${ptqrtoken}&u1=https%3A%2F%2Fy.qq.com%2F&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052`;
                const proxyUrl = "https://corsproxy.io/?url=" + encodeURIComponent(checkUrl);

                const res = await fetch(proxyUrl, {
                    headers: {
                        "Cookie": `qrsig=${qrsig}`,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                    }
                });
                const text = await res.text();

                if (text.includes("登录成功")) {
                    const cookies = res.headers.get("set-cookie");

                    // Extract UIN from cookies or response text if possible
                    let uin = "";
                    const uinMatch = cookies ? cookies.match(/uin=o(\d+)/) : null;
                    if (uinMatch) uin = uinMatch[1];

                    return json({
                        success: true,
                        status: 2,
                        message: "登录成功",
                        cookies: cookies,
                        uin: uin
                    });
                } else if (text.includes("二维码未失效")) {
                    return json({ success: true, status: 0, message: "等待扫码" });
                } else if (text.includes("二维码认证中")) {
                    return json({ success: true, status: 1, message: "已扫码，请确认" });
                } else {
                    return json({ success: true, status: -1, message: "二维码已过期" });
                }
            } catch (e) {
                return error("Check failed: " + e.message, 500);
            }
        }

        // === QQ User Info (Stateless Proxy) ===
        if (path === "/api/qq/userinfo" && request.method === "POST") {
            try {
                const { uin, cookies } = await request.json();
                // Proxy to QQ Music Profile API
                const targetUrl = `https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg?cid=205360838&reqfrom=1&reqtype=0&userid=${uin}`;
                const proxyUrl = "https://corsproxy.io/?url=" + encodeURIComponent(targetUrl);

                const res = await fetch(proxyUrl, {
                    headers: {
                        "Cookie": cookies,
                        "Referer": "https://y.qq.com/"
                    }
                });
                const text = await res.text();

                // Extract JSON from JSONP: callback({...})
                const match = text.match(/callback\((.*)\)/);
                let nickname = "QQ用户";
                let avatar = "";

                if (match) {
                    const data = JSON.parse(match[1]);
                    if (data.data) {
                        nickname = data.data.nickname;
                        avatar = data.data.headpic;
                    }
                }

                return json({ success: true, nickname, avatar });
            } catch (e) {
                return json({ success: false, error: e.message });
            }
        }

        // === Netease Music QR Code ===
        if (path === "/api/netease/qr/create" && request.method === "GET") {
            try {
                // Official API
                const keyRes = await fetch("https://music.163.com/weapi/login/qrcode/unikey?csrf_token=", {
                    method: "POST",
                    headers: {
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Referer": "https://music.163.com/"
                    },
                    body: "type=1"
                });
                const keyJson = await keyRes.json();

                if (keyJson.code !== 200) {
                    // Backup API
                    const backupRes = await fetch(`https://netease-cloud-music-api-liard.vercel.app/login/qr/key?timestamp=${Date.now()}`);
                    const backupJson = await backupRes.json();
                    if (backupJson.data && backupJson.data.unikey) {
                        const unikey = backupJson.data.unikey;
                        const qrUrl = `https://music.163.com/login?codekey=${unikey}`;
                        return json({
                            success: true,
                            unikey,
                            image: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`,
                            url: qrUrl
                        });
                    }
                    return error("Failed to get unikey");
                }

                const unikey = keyJson.unikey;
                const qrUrl = `https://music.163.com/login?codekey=${unikey}`;
                return json({
                    success: true,
                    unikey,
                    image: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(qrUrl)}`,
                    url: qrUrl
                });
            } catch (e) {
                return error("Failed to create Netease QR: " + e.message, 500);
            }
        }

        if (path === "/api/netease/qr/check" && request.method === "POST") {
            try {
                const { unikey } = await request.json();
                const url = `https://music.163.com/api/login/qrcode/client/login?type=1&key=${unikey}&timestamp=${Date.now()}`;
                const res = await fetch(url, { headers: { "Cache-Control": "no-cache" } });
                const data = await res.json();

                // Map 800 (expired) to -1
                if (data.code === 803) {
                    const cookies = res.headers.get("set-cookie");
                    return json({
                        success: true,
                        status: 2,
                        message: "登录成功",
                        cookies: cookies
                    });
                } else if (data.code === 801) {
                    return json({ success: true, status: 0, message: "等待扫码" });
                } else if (data.code === 802) {
                    return json({ success: true, status: 1, message: "已扫码，等待确认", nickname: data.nickname });
                } else {
                    return json({ success: true, status: -1, message: "二维码已过期或错误" });
                }
            } catch (e) {
                return error("Check failed: " + e.message, 500);
            }
        }

        // 4. SYNC API: Import Data (New)
        if (path === "/api/sync/import" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);

            let { platform, id, playlists } = await request.json();

            if (!platform || !id || !Array.isArray(playlists)) {
                return error("Invalid data format");
            }

            try {
                // 1. Record Connection
                const existingConn = await env.DB.prepare("SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ?").bind(userId, platform).first();
                if (existingConn) {
                    await env.DB.prepare("UPDATE connected_accounts SET external_user_id = ?, last_synced_at = ? WHERE id = ?").bind(id, Date.now(), existingConn.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO connected_accounts (user_id, platform, external_user_id, last_synced_at) VALUES (?, ?, ?, ?)").bind(userId, platform, id, Date.now()).run();
                }

                // 2. Clear Old Synced Playlists Logic (Incremental Update)
                // Strategy: For each imported playlist, we clear only the "synced" songs (is_local_add=0), keeping manual adds.

                let importedCount = 0;

                for (const pl of playlists) {
                    // Check if playlist exists (by external_id + platform)
                    const existingPl = await env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND platform = ? AND external_id = ?").bind(userId, platform, pl.id).first();

                    let plId;
                    if (existingPl) {
                        plId = existingPl.id;
                        // Delete old SYNCED songs only
                        await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND is_local_add = 0").bind(plId).run();
                        // Update name if changed? Maybe keep user's custom name if they renamed it? 
                        // Let's update name to reflect latest sync if needed, but usually we just keep ID.
                    } else {
                        // Create New - add platform prefix
                        const platformPrefixes = { netease: '网易:', qq: 'QQ:', kuwo: '酷我:' };
                        const prefix = platformPrefixes[platform] || (platform + ':');
                        const prefixedName = prefix + pl.name;
                        const res = await env.DB.prepare(
                            "INSERT INTO playlists (user_id, name, is_sync, platform, external_id, can_delete, created_at) VALUES (?, ?, 1, ?, ?, 1, ?)" // can_delete=1 now
                        ).bind(userId, prefixedName, platform, pl.id, Date.now()).run();
                        plId = res.meta.last_row_id;
                    }

                    if (plId && Array.isArray(pl.tracks) && pl.tracks.length > 0) {
                        importedCount++;
                        const stmt = env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 0, ?)");

                        // Batch insert
                        const tracks = pl.tracks;
                        for (let i = 0; i < tracks.length; i += 10) {
                            const chunk = tracks.slice(i, i + 10);
                            const batch = chunk.map(s => {
                                // Strip temporary/unreliable URL/Lrc fields before saving
                                const cleanSong = { ...s };
                                delete cleanSong.url;
                                if (typeof cleanSong.lrc === 'string' && cleanSong.lrc.startsWith('http')) delete cleanSong.lrc;
                                return stmt.bind(plId, JSON.stringify(cleanSong), Date.now());
                            });
                            await env.DB.batch(batch);
                        }
                    }
                }

                return json({ success: true, count: importedCount, message: "同步成功" });

            } catch (e) {
                return error("同步保存失败: " + e.message, 500);
            }
        }

        // 4. SYNC API: Digital ID Support (Deprecated but kept for backward compatibility if needed)
        if (path === "/api/sync" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);

            let { platform, id, link } = await request.json();

            try {
                // A. Extract ID
                let externalId = id;
                if (!externalId && link) {
                    // Try to extract from link if id not provided
                    const match = link.match(/id=(\d+)/) || link.match(/(\d+)/);
                    if (match) externalId = match[1];
                }

                if (!externalId) return error("请输入有效的用户ID");

                // B. Map Platform to Meting Server Code
                const serverMap = {
                    'netease': 'netease',
                    'qq': 'tencent',
                    // 'migu': 'migu', // Migu disabled
                    'kuwo': 'kuwo'
                };
                const serverCode = serverMap[platform];
                if (!serverCode) return error("不支持的平台: " + platform);

                // C. Fetch Data from Meting (Public API)
                // Try api.wuenci.com first, as it often supports type=user
                let metingUrl = `https://api.wuenci.com/meting/api/?type=user&id=${externalId}&server=${serverCode}`;

                // Fallback/Alternative logic could be added here if needed
                // For now we switch to a more reliable instance

                let metingRes = await fetch(metingUrl);
                let metingData = await metingRes.json().catch(() => null);

                // If wuenci fails, try injahow
                if (!metingData || metingData.error) {
                    metingUrl = `https://api.injahow.cn/meting/?type=user&id=${externalId}&server=${serverCode}`;
                    metingRes = await fetch(metingUrl);
                    metingData = await metingRes.json().catch(() => null);
                }

                if (!metingData || !Array.isArray(metingData) || metingData.length === 0) {
                    return error("同步失败：未找到歌单或API暂时不可用。请检查ID是否正确，并确保歌单为公开状态。");
                }

                // D. Database Transaction

                // 1. Record Connection
                const existingConn = await env.DB.prepare("SELECT id FROM connected_accounts WHERE user_id = ? AND platform = ?").bind(userId, platform).first();
                if (existingConn) {
                    await env.DB.prepare("UPDATE connected_accounts SET external_user_id = ?, last_synced_at = ? WHERE id = ?").bind(externalId, Date.now(), existingConn.id).run();
                } else {
                    await env.DB.prepare("INSERT INTO connected_accounts (user_id, platform, external_user_id, last_synced_at) VALUES (?, ?, ?, ?)").bind(userId, platform, externalId, Date.now()).run();
                }

                // 2. Clear Old Synced Playlists for this user & platform
                const oldPls = await env.DB.prepare("SELECT id FROM playlists WHERE user_id = ? AND platform = ? AND is_sync = 1").bind(userId, platform).all();
                for (const pl of oldPls.results) {
                    await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").bind(pl.id).run();
                    await env.DB.prepare("DELETE FROM playlists WHERE id = ?").bind(pl.id).run();
                }

                // 3. Insert New Playlists
                let importedCount = 0;
                // Limit to first 20 playlists to avoid timeout
                const playlistsToImport = metingData.slice(0, 20);

                // Map platform code to display name
                const platformNames = {
                    'netease': '网易',
                    'qq': 'QQ',
                    // 'migu': '咪咕', // Migu disabled
                    'kuwo': '酷我'
                };
                const prefix = platformNames[platform] || platform;

                for (const pl of playlistsToImport) {
                    const newName = pl.name;

                    const plRes = await env.DB.prepare(
                        "INSERT INTO playlists (user_id, name, is_sync, platform, external_id, can_delete, created_at) VALUES (?, ?, 1, ?, ?, 0, ?)"
                    ).bind(userId, newName, platform, pl.id, Date.now()).run();

                    if (plRes.success) {
                        importedCount++;
                        // Import songs for "Favorites" (usually first one or has specific name)
                        // Or just import all songs? Importing all might be too heavy for Worker limits (CPU/Time).
                        // Strategy: Only import the first playlist's songs immediately. Others lazy load (not implemented yet, so we try best effort).
                        // Let's try to import songs for the first 3 playlists.
                        if (importedCount <= 3) {
                            try {
                                // Use wuenci as primary
                                const songsUrl = `https://api.wuenci.com/meting/api/?type=playlist&id=${pl.id}&server=${serverCode}`;
                                let songsRes = await fetch(songsUrl);
                                let songsData = await songsRes.json().catch(() => null);

                                // Fallback to injahow
                                if (!songsData || songsData.error) {
                                    const backupUrl = `https://api.injahow.cn/meting/?type=playlist&id=${pl.id}&server=${serverCode}`;
                                    songsRes = await fetch(backupUrl);
                                    songsData = await songsRes.json().catch(() => null);
                                }

                                if (Array.isArray(songsData)) {
                                    const stmt = env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, created_at) VALUES (?, ?, ?)");
                                    const batch = [];
                                    for (const s of songsData) {
                                        const songObj = {
                                            id: `${platform}-${s.id}`,
                                            title: s.name,
                                            artist: s.artist,
                                            album: s.album,
                                            cover: s.pic,
                                            source: platform,
                                            url: s.url,
                                            lrc: s.lrc
                                        };
                                        batch.push(stmt.bind(plRes.meta.last_row_id, JSON.stringify(songObj), Date.now()));
                                        if (batch.length >= 50) break; // Limit 50 songs per playlist to prevent timeout
                                    }
                                    if (batch.length > 0) await env.DB.batch(batch);
                                }
                            } catch (e) { console.error("Failed to sync songs for pl", pl.id); }
                        }
                    }
                }

                return json({ success: true, count: importedCount, message: "同步成功" });

            } catch (e) {
                return error("同步服务出错: " + e.message, 500);
            }
        }

        // 5. Playlists: List (Supports folder structure view)
        if (path === "/api/playlists" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);

            const { results } = await env.DB.prepare(
                "SELECT * FROM playlists WHERE user_id = ? ORDER BY is_sync ASC, created_at DESC"
            ).bind(userId).all();

            const playlists = [];
            for (const pl of results) {
                // Fetch songs count or preview?
                // Let's fetch songs for local playlists. For synced, we might rely on lazy load or stored.
                // For now, fetch all stored songs.
                const { results: songs } = await env.DB.prepare(
                    "SELECT id, song_json FROM playlist_songs WHERE playlist_id = ? ORDER BY created_at ASC"
                ).bind(pl.id).all();

                playlists.push({
                    id: pl.id,
                    name: pl.name,
                    is_sync: !!pl.is_sync,
                    platform: pl.platform,
                    external_id: pl.external_id,
                    can_delete: !!pl.can_delete,
                    tracks: songs.map(s => {
                        const song = JSON.parse(s.song_json);
                        song.uid = s.id; // Add uid from table ID
                        song.is_local_add = !!s.is_local_add;
                        return song;
                    })
                });
            }

            return json(playlists);
        }

        if (path === "/api/playlists/sync" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { platform, externalId, name, songs } = await request.json();
            if (!platform || !externalId || !Array.isArray(songs)) return error("Invalid data");

            // 1. Check if playlist exists
            let pl = await env.DB.prepare("SELECT * FROM playlists WHERE user_id = ? AND platform = ? AND external_id = ?").bind(userId, platform, externalId).first();
            let playlistId;

            // Helper to get platform prefix
            const getPlatformPrefix = (p) => {
                if (p === 'netease') return '网易:';
                if (p === 'qq') return 'QQ:';
                if (p === 'kuwo') return '酷我:';
                return p + ':';
            };

            if (!pl) {
                const res = await env.DB.prepare("INSERT INTO playlists (user_id, name, is_sync, platform, external_id, created_at) VALUES (?, ?, 1, ?, ?, ?)")
                    .bind(userId, getPlatformPrefix(platform) + name, platform, externalId, Date.now()).run();
                playlistId = res.meta.last_row_id;
            } else {
                playlistId = pl.id;
                // Update name if changed (keep prefix)
                const newPrefixedName = getPlatformPrefix(platform) + name;
                if (pl.name !== newPrefixedName) {
                    await env.DB.prepare("UPDATE playlists SET name = ? WHERE id = ?").bind(newPrefixedName, playlistId).run();
                }
            }

            // 2. Incremental Sync
            const { results: dbSongs } = await env.DB.prepare("SELECT id, song_json, is_local_add FROM playlist_songs WHERE playlist_id = ?").bind(playlistId).all();
            const dbMap = new Map();
            dbSongs.forEach(s => {
                const song = JSON.parse(s.song_json);
                dbMap.set(song.id, s);
            });

            const platformIds = new Set(songs.map(s => s.id));
            const batch = [];

            // Add new songs from platform
            for (const s of songs) {
                if (!dbMap.has(s.id)) {
                    delete s.url;
                    if (typeof s.lrc === 'string' && s.lrc.startsWith('http')) delete s.lrc;
                    batch.push(env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 0, ?)").bind(playlistId, JSON.stringify(s), Date.now()));
                }
            }

            // Delete removed platform songs (not manual ones)
            for (const [id, dbSong] of dbMap.entries()) {
                if (!platformIds.has(id) && dbSong.is_local_add === 0) {
                    batch.push(env.DB.prepare("DELETE FROM playlist_songs WHERE id = ?").bind(dbSong.id));
                }
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
            }

            return json({ success: true, count: batch.length });
        }

        // 6. Playlists: Create/Delete/Update/Add Songs (Standard CRUD)
        if (path === "/api/playlists" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { name } = await request.json();
            const res = await env.DB.prepare("INSERT INTO playlists (user_id, name, created_at) VALUES (?, ?, ?)")
                .bind(userId, name, Date.now()).run();
            return json({ id: res.meta.last_row_id, name, tracks: [] });
        }

        // Add Song to Playlist
        const addSongMatch = path.match(/^\/api\/playlists\/(\d+)\/songs$/);
        if (addSongMatch && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const plId = addSongMatch[1];
            const song = await request.json();

            // Verify playlist ownership
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("Forbidden", 403);

            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            // Check duplicate
            const exists = await env.DB.prepare("SELECT id FROM playlist_songs WHERE playlist_id = ? AND json_extract(song_json, '$.id') = ?").bind(plId, song.id).first();
            if (exists) return error("Song already exists in playlist");

            // INSERT with is_local_add = 1
            const res = await env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 1, ?)").bind(plId, JSON.stringify(song), Date.now()).run();
            return json({ success: true, uid: res.meta.last_row_id });
        }

        // Batch Add Songs to Playlist
        const batchAddSongsMatch = path.match(/^\/api\/playlists\/batch-songs$/);
        if (batchAddSongsMatch && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { playlistId, songs } = await request.json();
            if (!playlistId || !Array.isArray(songs)) return error("Invalid data");

            // Verify playlist ownership
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(playlistId).first();
            if (!pl || pl.user_id !== userId) return error("Forbidden", 403);

            // Fetch existing song IDs in this playlist
            const { results: existingSongs } = await env.DB.prepare("SELECT json_extract(song_json, '$.id') as songId FROM playlist_songs WHERE playlist_id = ?").bind(playlistId).all();
            const existingIds = new Set(existingSongs.map(r => r.songId));

            const stmt = env.DB.prepare("INSERT INTO playlist_songs (playlist_id, song_json, is_local_add, created_at) VALUES (?, ?, 1, ?)");
            const batch = [];
            for (const song of songs) {
                if (!existingIds.has(song.id)) {
                    // Strip sensitive/temporary fields
                    delete song.url;
                    if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

                    batch.push(stmt.bind(playlistId, JSON.stringify(song), Date.now()));
                }
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
            }
            return json({ success: true, count: batch.length });
        }

        // remove song from playlist
        const removeSongMatch = path.match(/^\/api\/playlists\/(\d+)\/songs$/);
        if (removeSongMatch && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const plId = removeSongMatch[1];
            const { uid } = await request.json(); // song uid (or id)

            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("Forbidden", 403);

            // Delete by row ID (id column)
            // Frontend sends the database row ID as 'uid'
            await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ? AND id = ?").bind(plId, uid).run();

            return json({ success: true });
        }

        // Delete Playlist
        const deletePlMatch = path.match(/^\/api\/playlists\/(\d+)$/);
        if (deletePlMatch && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const plId = deletePlMatch[1];
            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("Forbidden", 403);
            // if (pl.can_delete === 0) return error("Cannot delete synced playlist", 403); // REMOVED RESTRICTION

            await env.DB.prepare("DELETE FROM playlist_songs WHERE playlist_id = ?").bind(plId).run();
            await env.DB.prepare("DELETE FROM playlists WHERE id = ?").bind(plId).run();
            return json({ success: true });
        }

        // Rename Playlist
        const renamePlMatch = path.match(/^\/api\/playlists\/(\d+)$/);
        if (renamePlMatch && request.method === "PUT") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const plId = renamePlMatch[1];
            const { name } = await request.json();
            if (!name) return error("Name is required");

            // Check permission
            const pl = await env.DB.prepare("SELECT * FROM playlists WHERE id = ?").bind(plId).first();
            if (!pl || pl.user_id !== userId) return error("Forbidden", 403);

            await env.DB.prepare("UPDATE playlists SET name = ? WHERE id = ?").bind(name, plId).run();
            return json({ success: true });
        }


        // 7. Favorites: CRUD
        if (path === "/api/favorites" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { results } = await env.DB.prepare("SELECT song_json FROM favorites WHERE user_id = ? ORDER BY created_at DESC").bind(userId).all();
            return json(results.map(r => JSON.parse(r.song_json)));
        }
        if (path === "/api/favorites" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const song = await request.json();
            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            // Check dupe
            const exists = await env.DB.prepare("SELECT id FROM favorites WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, song.id).first();
            if (!exists) {
                await env.DB.prepare("INSERT INTO favorites (user_id, song_json, created_at) VALUES (?, ?, ?)").bind(userId, JSON.stringify(song), Date.now()).run();
            }
            return json({ success: true });
        }
        if (path === "/api/favorites" && request.method === "DELETE") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { id } = await request.json(); // song id
            await env.DB.prepare("DELETE FROM favorites WHERE user_id = ? AND json_extract(song_json, '$.id') = ?").bind(userId, id).run();
            return json({ success: true });
        }

        // Batch Add Favorites
        if (path === "/api/favorites/batch" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { songs } = await request.json();
            if (!Array.isArray(songs)) return error("Invalid data");

            const { results: existingFavs } = await env.DB.prepare("SELECT json_extract(song_json, '$.id') as songId FROM favorites WHERE user_id = ?").bind(userId).all();
            const existingIds = new Set(existingFavs.map(r => r.songId));

            const stmt = env.DB.prepare("INSERT INTO favorites (user_id, song_json, created_at) VALUES (?, ?, ?)");
            const batch = [];
            for (const song of songs) {
                if (!existingIds.has(song.id)) {
                    // Strip sensitive/temporary fields
                    delete song.url;
                    if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

                    batch.push(stmt.bind(userId, JSON.stringify(song), Date.now()));
                }
            }

            if (batch.length > 0) {
                await env.DB.batch(batch);
            }
            return json({ success: true, count: batch.length });
        }

        // 8. Play History
        if (path === "/api/history" && request.method === "GET") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const { results } = await env.DB.prepare("SELECT song_json FROM play_history WHERE user_id = ? ORDER BY played_at DESC LIMIT 100").bind(userId).all();
            return json(results.map(r => JSON.parse(r.song_json)));
        }
        if (path === "/api/history" && request.method === "POST") {
            const userId = getUserId();
            if (!userId) return error("Unauthorized", 401);
            const song = await request.json();
            // Strip sensitive/temporary fields
            delete song.url;
            if (typeof song.lrc === 'string' && song.lrc.startsWith('http')) delete song.lrc;

            await env.DB.prepare("INSERT INTO play_history (user_id, song_json, played_at) VALUES (?, ?, ?)").bind(userId, JSON.stringify(song), Date.now()).run();
            return json({ success: true });
        }

        // 9. Audio Proxy (CORS Bypass) with Caching
        if (path === "/api/proxy" && request.method === "GET") {
            try {
                const targetUrl = url.searchParams.get("url");
                if (!targetUrl) return error("Missing target url");

                // Use Cloudflare Cache API for better performance
                const cache = caches.default;
                const cacheKey = new Request(request.url, request);

                // Try to get cached response first
                let cachedResponse = await cache.match(cacheKey);
                if (cachedResponse) {
                    // Return cached response with CORS headers
                    const newHeaders = new Headers(cachedResponse.headers);
                    newHeaders.set("Access-Control-Allow-Origin", "*");
                    newHeaders.set("X-Cache", "HIT");
                    return new Response(cachedResponse.body, {
                        status: cachedResponse.status,
                        headers: newHeaders
                    });
                }

                // Fetch from origin
                const res = await fetch(targetUrl, {
                    headers: {
                        "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
                        "Referer": new URL(targetUrl).origin
                    }
                });

                // Only cache successful responses
                if (res.ok) {
                    // Clone response for caching
                    const responseToCache = res.clone();

                    // Get original headers and inject CORS + cache control
                    const newHeaders = new Headers(res.headers);
                    newHeaders.set("Access-Control-Allow-Origin", "*");
                    newHeaders.set("Access-Control-Allow-Methods", "GET, OPTIONS");
                    newHeaders.set("Cache-Control", "public, max-age=3600"); // 1 hour cache
                    newHeaders.set("X-Cache", "MISS");
                    newHeaders.delete("set-cookie");

                    const finalResponse = new Response(res.body, {
                        status: res.status,
                        statusText: res.statusText,
                        headers: newHeaders
                    });

                    // Store in cache (don't await, fire and forget)
                    const cacheHeaders = new Headers(responseToCache.headers);
                    cacheHeaders.set("Cache-Control", "public, max-age=3600");
                    cacheHeaders.delete("set-cookie");

                    const cacheableResponse = new Response(responseToCache.body, {
                        status: responseToCache.status,
                        headers: cacheHeaders
                    });

                    // Use waitUntil if available (in event context)
                    try {
                        cache.put(cacheKey, cacheableResponse);
                    } catch (e) {
                        // Ignore cache errors
                    }

                    return finalResponse;
                }

                // Non-OK response, return as-is with CORS
                const newHeaders = new Headers(res.headers);
                newHeaders.set("Access-Control-Allow-Origin", "*");
                newHeaders.delete("set-cookie");

                return new Response(res.body, {
                    status: res.status,
                    statusText: res.statusText,
                    headers: newHeaders
                });
            } catch (e) {
                return error("Proxy failed: " + e.message, 500);
            }
        }

        return error("Not Found", 404);
    },
};
