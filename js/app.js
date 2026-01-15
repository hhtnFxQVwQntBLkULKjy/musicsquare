document.addEventListener('DOMContentLoaded', async () => {
    // Auth Check
    if (!AuthService.currentUser) {
        window.location.href = 'index.html';
        return;
    }
    const currentUser = AuthService.currentUser;

    // Init Data
    await DataService.init();

    // 加载持久化的播放历史（限制100首）
    try {
        const history = await DataService.fetchHistory();
        if (history && history.length > 0) {
            player.historyStack = history.slice(0, 100);
        }
    } catch (e) {
        console.error('Failed to load history:', e);
    }

    // Init UI
    UI.init();
    document.getElementById('user-name').textContent = currentUser.username || 'Guest';
    if (currentUser.avatar) {
        document.getElementById('user-avatar').src = currentUser.avatar;
    }

    // State
    const state = {
        currentView: 'search',
        activeSources: ['netease'],
        isMultiSource: false,
        globalKeyword: '',
        searchPage: 1,
        hotPage: 1,
        globalResults: [],
        currentListData: [],
        hotSongsCache: {}
    };

    // ... (rest of DOM elements)

    // DOM Elements
    const searchContainer = document.getElementById('search-container');
    const sourceControls = document.querySelector('.source-controls');
    const multiToggle = document.getElementById('multi-source-toggle');
    const sourceChips = document.querySelectorAll('.source-chip');
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const recContainer = document.getElementById('search-rec');

    // Hot Search Tags
    function initHotTags() {
        let tags = JSON.parse(sessionStorage.getItem('hotTags') || '[]');
        if (tags.length === 0) {
            const pool = [
                '林俊杰', '周杰伦', '薛之谦', '邓紫棋', '陈奕迅', 'Taylor Swift', 'Justin Bieber',
                '五月天', '李荣浩', '张杰', '王力宏', '蔡依林', '毛不易', '许嵩', '华晨宇',
                '告白气球', '起风了', '演员', '年少有为', '光年之外', '稻香', '青花瓷'
            ];
            tags = pool.sort(() => 0.5 - Math.random()).slice(0, 4);
            sessionStorage.setItem('hotTags', JSON.stringify(tags));
        }

        recContainer.innerHTML = '';
        tags.forEach(tag => {
            const span = document.createElement('span');
            span.className = 'rec-tag';
            span.textContent = tag;
            span.onclick = () => {
                if (state.currentView !== 'search') switchView('search');
                searchInput.value = tag;
                triggerSearch();
            };
            recContainer.appendChild(span);
        });
    }
    initHotTags();

    // --- Core Logic ---

    async function switchView(viewName, data = null) {
        state.currentView = viewName;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (navItem) navItem.classList.add('active');

        const contentView = document.getElementById('content-view');
        contentView.innerHTML = '';
        contentView.appendChild(UI.songListContainer);
        UI.songListContainer.style.display = 'block';

        if (viewName === 'hot') {
            searchContainer.style.display = 'flex';
            searchContainer.style.visibility = 'visible';
            sourceControls.style.display = 'flex';
            document.querySelector('.search-input-wrapper').style.visibility = 'hidden';
            searchBtn.style.visibility = 'hidden';
            multiToggle.style.display = 'none';
            recContainer.style.display = 'none';

            if (state.activeSources.length > 1) {
                state.activeSources = [state.activeSources[0]];
                updateSourceChips();
            }
        } else {
            document.querySelector('.search-input-wrapper').style.visibility = 'visible';
            searchBtn.style.visibility = 'visible';

            if (viewName === 'search') {
                searchContainer.style.display = 'flex';
                searchContainer.style.visibility = 'visible';
                sourceControls.style.display = 'flex';
                multiToggle.style.display = 'flex';
                recContainer.style.display = 'flex';
            } else {
                searchContainer.style.display = 'flex';
                searchContainer.style.visibility = 'visible';
                sourceControls.style.display = 'none';
                recContainer.style.display = 'none';
            }
        }

        if (viewName === 'search') {
            searchInput.value = state.globalKeyword;
            searchInput.placeholder = '搜索歌曲、歌手...';
            if (state.globalResults.length > 0) {
                UI.renderSongList(state.globalResults, state.searchPage, 50, (page) => {
                    state.searchPage = page;
                    doGlobalSearch();
                }, false, 'search');
            } else if (state.globalKeyword) {
                doGlobalSearch();
            } else {
                UI.renderEmptyState();
            }
        }
        else if (viewName === 'hot') {
            loadHotSongs(state.activeSources[0], state.hotPage);
        }
        else if (viewName === 'favorites') {
            searchInput.value = '';
            searchInput.placeholder = '搜索收藏...';
            // Use DataService
            const favs = DataService.favorites;
            state.currentListData = favs;
            UI.renderSongList(favs, 1, 1, null, true, 'favorites');
        }
        else if (viewName === 'history') {
            searchInput.value = '';
            searchInput.placeholder = '搜索历史...';
            const history = player.historyStack.slice().reverse();
            state.currentListData = history;
            if (history.length > 0) {
                UI.renderSongList(history, 1, 1, null, true, 'history');
            } else {
                UI.renderEmptyState('暂无播放历史');
            }
        }
        else if (viewName === 'playlist') {
            searchInput.value = '';
            searchInput.placeholder = '搜索歌单...';
            // data is the playlist object
            if (data && data.tracks) {
                state.currentListData = data.tracks;
                state.currentPlaylistId = data.id;
                UI.renderSongList(data.tracks, 1, 1, null, true, 'playlist', data.id);
            } else {
                UI.renderEmptyState('歌单为空');
            }
        }
    }

    async function loadHotSongs(source, page = 1) {
        state.hotPage = page;
        if (page === 1 && state.hotSongsCache[source] && state.hotSongsCache[source].length > 0) {
            UI.renderSongList(state.hotSongsCache[source], page, 50, (newPage) => {
                loadHotSongs(source, newPage);
            }, false, 'hot');
            return;
        }

        UI.showLoading();
        try {
            let keyword = '热歌榜';
            if (source === 'migu') keyword = '周杰伦';
            if (source === 'qq') keyword = '热歌';

            const res = await MusicAPI.search(keyword, source, page, 20);

            if (res.length > 0) {
                if (page === 1) {
                    state.hotSongsCache[source] = res;
                }
                UI.renderSongList(res, page, 50, (newPage) => {
                    loadHotSongs(source, newPage);
                }, false, 'hot');
            } else {
                UI.renderEmptyState('暂无热门歌曲');
            }
        } catch (e) {
            console.error(e);
            UI.renderEmptyState('加载失败');
        }
    }

    // --- Search & Filter ---

    function triggerSearch() {
        const val = searchInput.value.trim();
        if (state.currentView === 'search') {
            if (val) {
                state.globalKeyword = val;
                state.searchPage = 1;
                doGlobalSearch();
            }
        } else {
            doLocalFilter(val);
        }
    }

    async function doGlobalSearch() {
        UI.showLoading();
        try {
            const promises = state.activeSources.map(source =>
                MusicAPI.search(state.globalKeyword, source, state.searchPage)
                    .catch(e => [])
            );
            const results = await Promise.all(promises);
            let merged = [];
            if (state.isMultiSource) {
                const maxLength = Math.max(...results.map(r => r.length));
                // Interleave results from all active sources
                for (let i = 0; i < maxLength; i++) {
                    for (let j = 0; j < results.length; j++) {
                        if (results[j][i]) merged.push(results[j][i]);
                    }
                }
            } else {
                merged = results[0] || [];
            }
            state.currentListData = merged;
            state.globalResults = merged;
            if (merged.length === 0) {
                UI.renderEmptyState('没有找到相关歌曲');
                return;
            }
            UI.renderSongList(merged, state.searchPage, 50, (page) => {
                state.searchPage = page;
                doGlobalSearch();
            }, false, 'search');
        } catch (e) {
            UI.renderEmptyState('搜索出错，请重试');
        }
    }

    function doLocalFilter(keyword) {
        if (!state.currentListData) return;
        if (!keyword) {
            const viewType = state.currentView === 'favorites' ? 'favorites' :
                state.currentView === 'playlist' ? 'playlist' : 'search';
            const plId = state.currentView === 'playlist' ? state.currentPlaylistId : null;
            UI.renderSongList(state.currentListData, 1, 1, null, true, viewType, plId);
            return;
        }
        const lower = keyword.toLowerCase();
        const filtered = state.currentListData.filter(item =>
            (item.title && item.title.toLowerCase().includes(lower)) ||
            (item.artist && item.artist.toLowerCase().includes(lower))
        );
        const viewType = state.currentView === 'favorites' ? 'favorites' :
            state.currentView === 'playlist' ? 'playlist' : 'search';
        const plId = state.currentView === 'playlist' ? state.currentPlaylistId : null;
        UI.renderSongList(filtered, 1, 1, null, true, viewType, plId);
    }

    searchInput.addEventListener('input', (e) => {
        if (state.currentView !== 'search') doLocalFilter(e.target.value.trim());
    });
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') triggerSearch();
    });
    searchBtn.addEventListener('click', triggerSearch);

    // --- Source Logic ---
    function getSourceDisplayName(src) {
        switch (src) {
            case 'netease': return '网易云音乐';
            case 'qq': return 'QQ音乐';
            case 'migu': return '咪咕音乐';
            case 'kuwo': return '酷我音乐';
            default: return src;
        }
    }

    multiToggle.addEventListener('click', () => {
        state.isMultiSource = !state.isMultiSource;
        multiToggle.classList.toggle('active', state.isMultiSource);

        // Auto pause on mode toggle
        if (window.player && typeof window.player.pause === 'function') {
            window.player.pause();
        }

        if (!state.isMultiSource && state.activeSources.length > 1) {
            // Revert to first active source when turning off multi-source
            state.activeSources = [state.activeSources[0]];
        }

        const names = state.activeSources.map(s => getSourceDisplayName(s)).join(' 和 ');
        UI.showToast(`已为您切换至 ${names}，播放已暂停`, 'info');

        updateSourceChips();
        if (state.currentView === 'search' && state.globalKeyword) {
            state.searchPage = 1;
            doGlobalSearch();
        }
    });

    sourceChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const source = chip.dataset.source;

            // HOT view is always single source
            if (state.currentView === 'hot') {
                if (window.player && typeof window.player.pause === 'function') {
                    window.player.pause();
                }
                state.activeSources = [source];
                state.hotPage = 1;
                updateSourceChips();
                loadHotSongs(source, 1);
                UI.showToast(`已切换至 ${getSourceDisplayName(source)} 热歌榜`, 'info');
                return;
            }

            if (state.isMultiSource) {
                // Multi-source Toggle Logic
                if (state.activeSources.includes(source)) {
                    if (state.activeSources.length > 1) {
                        state.activeSources = state.activeSources.filter(s => s !== source);
                    } else {
                        UI.showToast('请至少保留一个音源', 'warning');
                        return;
                    }
                } else {
                    state.activeSources.push(source);
                }

                if (window.player && typeof window.player.pause === 'function') {
                    window.player.pause();
                }

                const names = state.activeSources.map(s => getSourceDisplayName(s)).join(' 和 ');
                UI.showToast(`已为您切换至 ${names}，播放已暂停`, 'info');
            } else {
                // Single source Logic
                if (state.activeSources.length === 1 && state.activeSources[0] === source) return;

                if (window.player && typeof window.player.pause === 'function') {
                    window.player.pause();
                }

                state.activeSources = [source];
                UI.showToast(`已为您切换至 ${getSourceDisplayName(source)}，播放已暂停`, 'info');
            }

            updateSourceChips();
            if (state.currentView === 'search' && state.globalKeyword) {
                state.searchPage = 1;
                doGlobalSearch();
            }
        });
    });

    function updateSourceChips() {
        sourceChips.forEach(c => {
            if (state.activeSources.includes(c.dataset.source)) c.classList.add('active');
            else c.classList.remove('active');
        });
    }

    // --- Playlist Logic ---
    const plSection = document.getElementById('sidebar-playlists');
    const plToggleIcon = document.getElementById('pl-toggle-icon');
    let isPlExpanded = true;

    async function renderSidebarPlaylists() {
        // Use DataService
        await DataService.fetchPlaylists();
        const playlists = DataService.playlists;

        plSection.innerHTML = '';

        // Group by type (Local vs Synced)
        // const localPls = playlists.filter(p => !p.is_sync);
        // const syncedPls = playlists.filter(p => p.is_sync);

        // 1. All Playlists (Unified)
        playlists.forEach(pl => {
            // Treat all as local for UI purposes
            const div = createPlaylistEl(pl);
            plSection.appendChild(div);
        });

        // 2. Synced Playlists (Removed Grouping)
        // if (syncedPls.length > 0) { ... }

        if (playlists.length === 0) {
            plSection.innerHTML = '<div style="padding:10px 30px;color:#999;font-size:12px;">暂无歌单</div>';
        }
    }

    function createPlaylistEl(pl) {
        const div = document.createElement('div');
        div.className = 'nav-item pl-nav-item';
        // const icon = pl.is_sync ? (pl.platform === 'netease' ? 'fa-cloud' : 'fa-music') : 'fa-list-ul';
        const icon = 'fa-list-ul'; // Unified Icon
        div.innerHTML = `
            <div style="display:flex;align-items:center;flex:1;overflow:hidden;">
                <i class="fas ${icon}"></i> 
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-left:5px;">${pl.name}</span>
            </div>
            <i class="fas fa-trash-alt nav-action-icon del-btn" style="font-size:12px;opacity:0;transition:opacity 0.2s;" title="删除"></i>
        `;

        // Always enable delete/context menu for all playlists
        // if (!pl.is_sync) { ... } -> Removed condition

        div.onmouseenter = () => div.querySelector('.del-btn').style.opacity = '1';
        div.onmouseleave = () => div.querySelector('.del-btn').style.opacity = '0';
        div.querySelector('.del-btn').addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI.showDialog({
                title: '删除歌单',
                content: `确定删除歌单 "${pl.name}" 吗？`,
                onConfirm: async () => {
                    try {
                        await DataService.deletePlaylist(pl.id);
                        UI.showToast('歌单已删除');
                        renderSidebarPlaylists();
                        if (state.currentView === 'playlist') {
                            switchView('search');
                        }
                    } catch (err) {
                        UI.showToast('删除失败', 'error');
                    }
                }
            });
        });

        // Add context menu listener to the WHOLE div
        div.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            UI.showPlaylistContextMenu(e.clientX, e.clientY, pl,
                async (id) => {
                    try {
                        await DataService.deletePlaylist(id);
                        UI.showToast('歌单已删除');
                        renderSidebarPlaylists();
                        if (state.currentView === 'playlist') switchView('search');
                    } catch (err) { UI.showToast('删除失败', 'error'); }
                },
                async (id, name) => {
                    try {
                        await DataService.renamePlaylist(id, name);
                        UI.showToast('重命名成功');
                        renderSidebarPlaylists();
                    } catch (err) { UI.showToast('重命名失败', 'error'); }
                }
            );
        });

        div.addEventListener('click', async () => {
            document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
            div.classList.add('active');

            // Force refresh data from server to ensure latest songs
            await DataService.fetchPlaylists();
            const freshPl = DataService.playlists.find(p => p.id === pl.id);

            if (freshPl) {
                switchView('playlist', freshPl);
            } else {
                switchView('playlist', pl);
            }
        });

        return div;
    }

    function createPlaylist() {
        UI.showInput({
            title: '新建歌单',
            placeholder: '请输入歌单名称',
            onConfirm: async (name) => {
                if (name) {
                    await DataService.createPlaylist(name);
                    renderSidebarPlaylists();
                    UI.uniDialog.classList.remove('show');
                }
            }
        });
    }

    document.getElementById('create-pl-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        createPlaylist();
    });

    plToggleIcon.addEventListener('click', () => {
        isPlExpanded = !isPlExpanded;
        if (isPlExpanded) {
            plSection.classList.remove('collapsed');
            plToggleIcon.classList.remove('rotate');
        } else {
            plSection.classList.add('collapsed');
            plToggleIcon.classList.add('rotate');
        }
    });

    // --- Init ---
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });

    renderSidebarPlaylists();
    switchView('search');

    // --- Global Events ---
    // Avatar Menu
    const userProfile = document.querySelector('.user-profile');
    const avatarInput = document.getElementById('avatar-input');

    // Help Modal
    const helpBtn = document.getElementById('help-btn');
    if (helpBtn) {
        helpBtn.addEventListener('click', () => {
            UI.showModal('help-modal');
        });
    }
    document.getElementById('close-help').addEventListener('click', () => {
        UI.closeModal('help-modal');
    });
    document.getElementById('help-ok-btn').addEventListener('click', () => {
        UI.closeModal('help-modal');
    });

    // Edit Profile Logic
    document.getElementById('edit-profile-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        UI.showModal('profile-modal');
        // Pre-fill
        document.getElementById('edit-nickname').value = currentUser.username || '';
        document.getElementById('edit-avatar-preview').src = currentUser.avatar || 'https://placehold.co/80x80?text=User';
    });

    document.getElementById('close-profile').addEventListener('click', () => {
        UI.closeModal('profile-modal');
    });

    // Avatar Click in Edit Modal
    document.getElementById('profile-avatar-wrapper').addEventListener('click', () => {
        avatarInput.click();
    });

    avatarInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (ev) => {
            const base64 = ev.target.result;
            // Preview
            document.getElementById('edit-avatar-preview').src = base64;
            // Temporarily store for save
            avatarInput.dataset.temp = base64;
        };
        reader.readAsDataURL(file);
    });

    document.getElementById('save-profile-btn').addEventListener('click', async () => {
        const avatarInput = document.getElementById('avatar-input');
        const newAvatar = avatarInput.dataset.temp || currentUser.avatar;

        try {
            // Update Profile API (Avatar only now)
            await fetch(`${API_BASE}/user/profile`, {
                method: 'POST',
                headers: { ...DataService.authHeader(), 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    avatar: newAvatar
                })
            });

            // Update Local Cache
            const updatedUser = { ...currentUser, avatar: newAvatar };
            localStorage.setItem('currentUser', JSON.stringify(updatedUser));

            // Update UI
            document.getElementById('user-avatar').src = newAvatar;

            UI.showToast('头像已更新');
            UI.closeModal('profile-modal');

            // Reload to reflect all changes safely
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            UI.showToast('更新失败', 'error');
        }
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        UI.showDialog({
            title: '退出登录',
            content: '确定要退出登录吗？',
            onConfirm: () => {
                AuthService.logout();
                window.location.href = 'index.html';
            }
        });
    });

    // Sync Logic (Digital ID)
    const qrModal = document.getElementById('qr-sync-modal');
    // We reuse the existing modal structure but change content dynamically
    const qrDetail = document.querySelector('.qr-detail');
    const qrPlatforms = document.querySelector('.sync-platforms');
    const backBtn = document.getElementById('back-to-select');

    // Init Platform Cards
    function initSyncPlatforms() {
        qrPlatforms.innerHTML = `
            <div class="qr-card" data-pf="netease">
                <i class="fas fa-cloud" style="font-size:32px;color:#c20c0c;margin-bottom:10px;"></i>
                <span>网易云音乐</span>
            </div>
            <div class="qr-card" data-pf="qq">
                <i class="fas fa-music" style="font-size:32px;color:#31c27c;margin-bottom:10px;"></i>
                <span>QQ音乐</span>
            </div>
            <div class="qr-card" data-pf="migu">
                <i class="fas fa-mobile-alt" style="font-size:32px;color:#e6005c;margin-bottom:10px;"></i>
                <span>咪咕音乐</span>
            </div>
            <div class="qr-card" data-pf="kuwo">
                <i class="fas fa-headphones" style="font-size:32px;color:#ffe443;margin-bottom:10px;"></i>
                <span>酷我音乐</span>
            </div>
        `;

        // Bind events
        document.querySelectorAll('.qr-card').forEach(card => {
            card.addEventListener('click', () => {
                const platform = card.dataset.pf;
                showIdInput(platform);
            });
        });
    }

    document.getElementById('sync-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        resetSyncModal();
        UI.showModal('qr-sync-modal');
        // Update title
        document.querySelector('#qr-sync-modal .modal-header span').textContent = '导入歌单';
    });

    document.getElementById('close-qr-sync').addEventListener('click', () => {
        UI.closeModal('qr-sync-modal');
    });

    backBtn.addEventListener('click', resetSyncModal);

    function resetSyncModal() {
        qrPlatforms.style.display = 'grid';
        qrDetail.style.display = 'none';
        // Clear previous input if needed
    }

    function showIdInput(platform) {
        qrPlatforms.style.display = 'none';
        qrDetail.style.display = 'block';

        const names = { 'netease': '网易云音乐', 'qq': 'QQ音乐', 'migu': '咪咕音乐', 'kuwo': '酷我音乐' };
        const name = names[platform] || platform;

        let hintHtml = '';
        if (platform === 'qq' || platform === 'migu') {
            hintHtml = `
                <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin-bottom:20px;font-size:12px;color:#666;text-align:left;line-height:1.6;">
                    <strong><i class="fas fa-info-circle"></i> 如何获取ID?</strong><br>
                    1. 在App中找到歌单，分享到微信/QQ<br>
                    2. 用浏览器打开分享链接<br>
                    3. 链接中的 id= 后面的数字即为ID
                </div>
            `;
        }

        // Inject Form (Updated for Link Import)
        qrDetail.innerHTML = `
            <div style="padding: 10px 20px;">
                <i class="fas fa-link" style="font-size: 48px; color: #1ecf9f; margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">导入 ${name} 歌单</h3>
                <p style="font-size: 12px; color: #999; margin-bottom: 20px;">
                    请粘贴歌单分享链接。我们将同步歌单内容，并为您保留手动添加的歌曲。
                </p>
                
                <div style="background:#f5f5f5;padding:12px;border-radius:8px;margin-bottom:20px;font-size:12px;color:#666;text-align:left;line-height:1.6;">
                    <strong><i class="fas fa-info-circle"></i> 如何获取链接?</strong><br>
                    1. 在App中找到歌单，点击"分享"<br>
                    2. 选择"分享到微信"微信打开后点击..."复制链接"<br>
                    3. 将链接粘贴到下方输入框
                </div>

                <div style="margin-bottom: 20px;">
                    <input type="text" id="sync-uid-input" placeholder="请粘贴分享链接 (如 https://...)" style="
                        width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px; font-size: 14px; text-align: center; box-sizing: border-box;
                    ">
                </div>
                <button id="start-sync-btn" class="btn-primary" style="width: 100%; margin-bottom: 10px;">开始导入</button>
                <div id="sync-status" style="height: 20px; font-size: 12px; color: #666; margin-top: 10px;"></div>
            </div>
            <button class="btn-text" id="back-to-select-dynamic" style="margin-top:5px;color:#666;background:none;border:none;cursor:pointer;">&lt; 返回选择平台</button>
        `;

        document.getElementById('back-to-select-dynamic').onclick = resetSyncModal;

        const btn = document.getElementById('start-sync-btn');
        const input = document.getElementById('sync-uid-input');
        const status = document.getElementById('sync-status');

        input.focus();

        // Helper: Parse Link
        const parseLink = (text, platform) => {
            let id = null;
            // Common patterns
            const idMatch = text.match(/id=(\d+)/);
            if (idMatch) return idMatch[1];

            if (platform === 'netease') {
                const match = text.match(/playlist\/(\d+)/) || text.match(/id=(\d+)/);
                if (match) return match[1];
            }
            if (platform === 'qq') {
                const match = text.match(/id=(\d+)/); // QQ uses id=xxx usually
                if (match) return match[1];
            }
            if (platform === 'kuwo') {
                // http://m.kuwo.cn/newh5app/playlist_detail/3386004928
                const match = text.match(/playlist_detail\/(\d+)/) || text.match(/id=(\d+)/);
                if (match) return match[1];
            }
            if (platform === 'migu') {
                // https://music.migu.cn/v3/music/playlist/186065680
                const match = text.match(/playlist\/(\d+)/) || text.match(/id=(\d+)/);
                if (match) return match[1];
            }

            // Try generic number extraction if reasonable length (5-12 digits)
            const numMatch = text.match(/(\d{5,12})/);
            if (numMatch) return numMatch[1];

            return text.trim(); // Fallback to raw input (maybe user entered ID directly)
        };

        btn.onclick = async () => {
            const val = input.value.trim();
            if (!val) {
                status.textContent = '请输入链接或ID';
                status.style.color = '#ff5252';
                return;
            }

            const uid = parseLink(val, platform);
            if (!uid || uid.length < 4) {
                status.textContent = '无法识别链接中的ID，请重试';
                status.style.color = '#ff5252';
                return;
            }

            btn.disabled = true;
            btn.textContent = '正在获取歌单...';
            status.textContent = `正在连接 ${name} 服务...`;
            status.style.color = '#666';

            try {
                // 1. Fetch Details (New method to get SINGLE playlist)
                // We need to use MusicAPI.getPlaylistSongs directly as we are importing a specific playlist, NOT user playlists
                // But wait, user said "Import Playlist" via link.
                // MusicAPI.getPlaylistSongs returns array of songs. We also need the playlist name.
                // We might need to fake the name or fetch it.
                // For simplicity, let's fetch songs. If we can't get name, use "Platform: ID".

                let songs = await MusicAPI.getPlaylistSongs(platform === 'qq' ? 'tencent' : platform, uid);

                if (!songs || songs.length === 0) {
                    throw new Error('未找到歌单或歌单为空');
                }

                // 歌单命名：尝试获取真实歌单名称
                const prefixMap = {
                    'netease': '网易',
                    'qq': 'QQ',
                    'tencent': 'QQ',
                    'kuwo': '酷我',
                    'migu': '咪咕'
                };
                const prefix = prefixMap[platform] || platform;

                // 尝试获取歌单真实名称
                let realName = null;
                try {
                    const info = await MusicAPI.getPlaylistInfo(platform === 'qq' ? 'tencent' : platform, uid);
                    if (info && info.name) {
                        realName = info.name;
                    }
                } catch (e) {
                    console.log('Failed to get playlist name, using ID');
                }

                const platformNamesShort = {
                    'netease': '网易',
                    'qq': 'QQ',
                    'tencent': 'QQ',
                    'kuwo': '酷我',
                    'migu': '咪咕'
                };
                const pfSuffix = platformNamesShort[platform] || platform;

                // 2. Prep restricted payload (only title and artist)
                const finalPlName = realName || `导入歌单_${uid}`;
                const payload = [{
                    id: uid,
                    name: finalPlName,
                    tracks: songs.map(s => ({
                        id: s.id, // Keep ID for uniqueness in frontend if needed
                        title: `${s.title} (${pfSuffix})`,
                        artist: s.artist,
                        source: platform === 'tencent' ? 'qq' : platform,
                        isImported: true, // Mark for on-demand search
                        album: '',
                        cover: '',
                        url: '',
                        lrc: ''
                    }))
                }];

                status.textContent = `获取到 ${songs.length} 首歌曲，正在保存...`;
                btn.textContent = '正在保存...';

                // 2. Send to Backend
                const res = await DataService.importPlaylists(platform, uid, payload);

                if (res.success) {
                    status.textContent = `导入成功！`;
                    status.style.color = '#1ecf9f';
                    UI.showToast(`导入成功！保留了您的本地修改`, 'success');

                    setTimeout(async () => {
                        UI.closeModal('qr-sync-modal');
                        await DataService.fetchPlaylists();
                        renderSidebarPlaylists();
                    }, 1500);
                } else {
                    throw new Error(res.message || '保存失败');
                }
            } catch (e) {
                btn.disabled = false;
                btn.textContent = '开始导入';
                let msg = e.message;
                if (msg.includes('Failed to fetch')) msg = '网络请求失败，请检查网络或跨域设置';
                status.textContent = msg;
                status.style.color = '#ff5252';
                console.error(e);
            }
        };

        input.onkeydown = (e) => {
            if (e.key === 'Enter') btn.click();
        };
    }

    // Remove old listeners references if any (cleaned up by replacement)

    // Listen for playlist updates (from UI add action)
    document.addEventListener('playlist-updated', async (e) => {
        const plId = e.detail.id;
        // 1. Always re-fetch playlists to get latest tracks
        await DataService.fetchPlaylists();

        // 2. If we are currently viewing ANY playlist, check if it's the modified one
        if (state.currentView === 'playlist') {
            const pl = DataService.playlists.find(p => p.id === plId);

            // Re-render if the modified playlist matches the current one
            if (pl && state.currentPlaylistId === plId) {
                state.currentListData = pl.tracks;
                UI.renderSongList(pl.tracks, 1, 1, null, true, 'playlist', pl.id);
            }
        }
    });

    // 监听收藏更新事件（从收藏页面取消收藏时刷新列表）
    document.addEventListener('favorites-updated', async () => {
        if (state.currentView === 'favorites') {
            await DataService.fetchFavorites();
            const favs = DataService.favorites;
            state.currentListData = favs;
            if (favs.length > 0) {
                UI.renderSongList(favs, 1, 1, null, true, 'favorites');
            } else {
                UI.renderEmptyState('暂无收藏的歌曲');
            }
        }
    });

    document.addEventListener('click', () => {
        document.getElementById('song-ctx-menu').style.display = 'none';
        document.getElementById('pl-ctx-menu').style.display = 'none';
    });
});
