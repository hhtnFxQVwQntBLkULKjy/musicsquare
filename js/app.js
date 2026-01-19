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
    const userNameEl = document.getElementById('user-name');
    if (userNameEl) userNameEl.textContent = currentUser.username || 'Guest';
    const userAvatarEl = document.getElementById('user-avatar');
    if (userAvatarEl && currentUser.avatar) {
        userAvatarEl.src = currentUser.avatar;
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
        if (!recContainer) return;
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
                if (searchInput) {
                    searchInput.value = tag;
                    triggerSearch();
                }
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
        if (contentView) {
            contentView.innerHTML = '';
            contentView.appendChild(UI.songListContainer);
            UI.songListContainer.style.display = 'block';
        }

        if (viewName === 'hot') {
            if (searchContainer) {
                searchContainer.style.display = 'flex';
                searchContainer.style.visibility = 'visible';
            }
            if (sourceControls) sourceControls.style.display = 'flex';
            const inputWrapper = document.querySelector('.search-input-wrapper');
            if (inputWrapper) inputWrapper.style.visibility = 'hidden';
            if (searchBtn) searchBtn.style.visibility = 'hidden';
            if (multiToggle) multiToggle.style.display = 'none';
            if (recContainer) recContainer.style.display = 'none';

            if (state.activeSources.length > 1) {
                state.activeSources = [state.activeSources[0]];
                updateSourceChips();
            }
        } else {
            const inputWrapper = document.querySelector('.search-input-wrapper');
            if (inputWrapper) inputWrapper.style.visibility = 'visible';
            if (searchBtn) searchBtn.style.visibility = 'visible';

            if (viewName === 'search') {
                if (searchContainer) {
                    searchContainer.style.display = 'flex';
                    searchContainer.style.visibility = 'visible';
                }
                if (sourceControls) sourceControls.style.display = 'flex';
                if (multiToggle) multiToggle.style.display = 'flex';
                if (recContainer) recContainer.style.display = 'flex';
            } else {
                if (searchContainer) {
                    searchContainer.style.display = 'flex';
                    searchContainer.style.visibility = 'visible';
                }
                if (sourceControls) sourceControls.style.display = 'none';
                if (recContainer) recContainer.style.display = 'none';
            }
        }

        if (viewName === 'search') {
            if (searchInput) {
                searchInput.value = state.globalKeyword;
                searchInput.placeholder = '搜索歌曲、歌手...';
            }
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
            if (searchInput) {
                searchInput.value = '';
                searchInput.placeholder = '搜索收藏...';
            }
            const favs = DataService.favorites;
            state.currentListData = favs;
            UI.renderSongList(favs, 1, 1, null, true, 'favorites');
        }
        else if (viewName === 'history') {
            if (searchInput) {
                searchInput.value = '';
                searchInput.placeholder = '搜索历史...';
            }
            const history = player.historyStack.slice().reverse();
            state.currentListData = history;
            if (history.length > 0) {
                UI.renderSongList(history, 1, 1, null, true, 'history');
            } else {
                UI.renderEmptyState('暂无播放历史');
            }
        }
        else if (viewName === 'playlist') {
            if (searchInput) {
                searchInput.value = '';
                searchInput.placeholder = '搜索歌单...';
            }
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
        UI.showLoading();
        try {
            let keyword = '热歌榜';
            if (source === 'migu') keyword = '周杰伦';
            if (source === 'qq') keyword = '热歌';

            const res = await MusicAPI.search(keyword, source, page, 50);

            const uniqueMap = new Map();
            res.forEach(item => {
                if (!uniqueMap.has(item.id)) {
                    const key = `${item.title.trim()}-${item.artist.trim()}`;
                    if (![...uniqueMap.values()].some(v => `${v.title.trim()}-${v.artist.trim()}` === key)) {
                        uniqueMap.set(item.id, item);
                    }
                }
            });
            const uniqueRes = [...uniqueMap.values()];

            if (uniqueRes.length > 0) {
                state.hotSongsCache[source] = uniqueRes;
                UI.renderSongList(uniqueRes, 1, 1, (newPage) => {
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
        if (!searchInput) return;
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

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            if (state.currentView !== 'search') doLocalFilter(e.target.value.trim());
        });
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') triggerSearch();
        });
    }
    if (searchBtn) {
        searchBtn.addEventListener('click', triggerSearch);
    }

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

    if (multiToggle) {
        multiToggle.addEventListener('click', () => {
            state.isMultiSource = !state.isMultiSource;
            multiToggle.classList.toggle('active', state.isMultiSource);

            if (window.player && typeof window.player.pause === 'function') {
                window.player.pause();
            }

            if (!state.isMultiSource && state.activeSources.length > 1) {
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
    }

    sourceChips.forEach(chip => {
        chip.addEventListener('click', () => {
            const source = chip.dataset.source;

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
        if (!plSection) return;
        await DataService.fetchPlaylists();
        const playlists = DataService.playlists;
        plSection.innerHTML = '';
        playlists.forEach(pl => {
            const div = createPlaylistEl(pl);
            plSection.appendChild(div);
        });
        if (playlists.length === 0) {
            plSection.innerHTML = '<div style="padding:10px 30px;color:#999;font-size:12px;">暂无歌单</div>';
        }
    }

    function createPlaylistEl(pl) {
        const div = document.createElement('div');
        div.className = 'nav-item pl-nav-item';
        const icon = 'fa-list-ul';
        div.innerHTML = `
            <div style="display:flex;align-items:center;flex:1;overflow:hidden;">
                <i class="fas ${icon}"></i> 
                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-left:5px;">${pl.name}</span>
            </div>
            <i class="fas fa-trash-alt nav-action-icon del-btn" style="font-size:12px;opacity:0;transition:opacity 0.2s;" title="删除"></i>
        `;

        div.onmouseenter = () => {
            const btn = div.querySelector('.del-btn');
            if (btn) btn.style.opacity = '1';
        };
        div.onmouseleave = () => {
            const btn = div.querySelector('.del-btn');
            if (btn) btn.style.opacity = '0';
        };
        const delBtn = div.querySelector('.del-btn');
        if (delBtn) {
            delBtn.addEventListener('click', (e) => {
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
        }

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
                    try {
                        await DataService.createPlaylist(name);
                        UI.showToast('歌单创建成功', 'success');
                        renderSidebarPlaylists();
                        const uniDialog = document.getElementById('uni-dialog');
                        if (uniDialog) uniDialog.classList.remove('show');
                    } catch (e) {
                        UI.showToast('新建歌单失败', 'error');
                    }
                }
            }
        });
    }

    const createPlBtn = document.getElementById('create-pl-btn');
    if (createPlBtn) {
        createPlBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            createPlaylist();
        });
    }

    if (plToggleIcon) {
        plToggleIcon.addEventListener('click', () => {
            isPlExpanded = !isPlExpanded;
            if (isPlExpanded) {
                if (plSection) plSection.classList.remove('collapsed');
                plToggleIcon.classList.remove('rotate');
            } else {
                if (plSection) plSection.classList.add('collapsed');
                plToggleIcon.classList.add('rotate');
            }
        });
    }

    // --- Init ---
    document.querySelectorAll('.nav-item[data-view]').forEach(item => {
        item.addEventListener('click', () => switchView(item.dataset.view));
    });

    renderSidebarPlaylists();
    switchView('search');

    document.addEventListener('playlists-updated', () => {
        renderSidebarPlaylists();
    });

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
    const closeHelp = document.getElementById('close-help');
    if (closeHelp) {
        closeHelp.addEventListener('click', () => {
            UI.closeModal('help-modal');
        });
    }
    const helpOk = document.getElementById('help-ok-btn');
    if (helpOk) {
        helpOk.addEventListener('click', () => {
            UI.closeModal('help-modal');
        });
    }

    // Edit Profile Logic
    const editProfileBtn = document.getElementById('edit-profile-btn');
    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            UI.showModal('profile-modal');
            const nickInput = document.getElementById('edit-nickname');
            const avatarPrev = document.getElementById('edit-avatar-preview');
            if (nickInput) nickInput.value = currentUser.username || '';
            if (avatarPrev) avatarPrev.src = currentUser.avatar || 'https://placehold.co/80x80?text=User';
        });
    }

    const closeProfile = document.getElementById('close-profile');
    if (closeProfile) {
        closeProfile.addEventListener('click', () => {
            UI.closeModal('profile-modal');
        });
    }

    // Avatar Click in Edit Modal
    const profileAvatarWrapper = document.getElementById('profile-avatar-wrapper');
    if (profileAvatarWrapper && avatarInput) {
        profileAvatarWrapper.addEventListener('click', () => {
            avatarInput.click();
        });
    }
    const triggerAvatarUpload = document.getElementById('trigger-avatar-upload');
    if (triggerAvatarUpload && avatarInput) {
        triggerAvatarUpload.addEventListener('click', () => {
            avatarInput.click();
        });
    }

    if (avatarInput) {
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (ev) => {
                const base64 = ev.target.result;
                const preview = document.getElementById('edit-avatar-preview');
                if (preview) preview.src = base64;
                avatarInput.dataset.temp = base64;
            };
            reader.readAsDataURL(file);
        });
    }

    const saveProfileBtn = document.getElementById('save-profile-btn');
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            const avatarInput = document.getElementById('avatar-input');
            const newAvatar = avatarInput ? (avatarInput.dataset.temp || currentUser.avatar) : currentUser.avatar;

            try {
                await fetch(`${API_BASE}/user/profile`, {
                    method: 'POST',
                    headers: { ...DataService.authHeader(), 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar: newAvatar })
                });

                const updatedUser = { ...currentUser, avatar: newAvatar };
                localStorage.setItem('currentUser', JSON.stringify(updatedUser));

                const userAvatarEl = document.getElementById('user-avatar');
                if (userAvatarEl) userAvatarEl.src = newAvatar;

                UI.showToast('头像已更新');
                UI.closeModal('profile-modal');

                setTimeout(() => location.reload(), 1000);
            } catch (err) {
                UI.showToast('更新失败', 'error');
            }
        });
    }

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            UI.showDialog({
                title: '退出登录',
                content: '确定要退出登录吗？',
                onConfirm: () => {
                    AuthService.logout();
                    window.location.href = 'index.html';
                }
            });
        });
    }

    // Sync Logic
    const qrDetail = document.querySelector('.qr-detail');
    const qrPlatforms = document.querySelector('.sync-platforms');
    const backBtn = document.getElementById('back-to-select');

    if (qrPlatforms) {
        initSyncPlatforms();
    }

    function initSyncPlatforms() {
        if (!qrPlatforms) return;
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

        document.querySelectorAll('.qr-card').forEach(card => {
            card.addEventListener('click', () => {
                const platform = card.dataset.pf;
                showIdInput(platform);
            });
        });
    }

    const syncBtn = document.getElementById('sync-btn');
    if (syncBtn) {
        syncBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetSyncModal();
            UI.showModal('qr-sync-modal');
            const modalHeader = document.querySelector('#qr-sync-modal .modal-header span');
            if (modalHeader) modalHeader.textContent = '导入歌单';
        });
    }

    const closeQrSync = document.getElementById('close-qr-sync');
    if (closeQrSync) {
        closeQrSync.addEventListener('click', () => {
            UI.closeModal('qr-sync-modal');
        });
    }

    if (backBtn) {
        backBtn.addEventListener('click', resetSyncModal);
    }

    function resetSyncModal() {
        if (qrPlatforms) qrPlatforms.style.display = 'grid';
        if (qrDetail) qrDetail.style.display = 'none';
    }

    function showIdInput(platform) {
        if (!qrPlatforms || !qrDetail) return;
        qrPlatforms.style.display = 'none';
        qrDetail.style.display = 'block';

        const names = { 'netease': '网易云音乐', 'qq': 'QQ音乐', 'migu': '咪咕音乐', 'kuwo': '酷我音乐' };
        const name = names[platform] || platform;

        qrDetail.innerHTML = `
            <div style="padding: 10px 20px;">
                <i class="fas fa-link" style="font-size: 48px; color: #1ecf9f; margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">导入 ${name} 歌单</h3>
                <p style="font-size: 12px; color: #999; margin-bottom: 20px;">请粘贴歌单分享链接。</p>
                <div style="margin-bottom: 20px;">
                    <input type="text" id="sync-uid-input" placeholder="请粘贴分享链接" style="width: 100%; padding: 12px; border: 1px solid #ddd; border-radius: 8px;">
                </div>
                <button id="start-sync-btn" class="btn-primary" style="width: 100%;">开始导入</button>
                <div id="sync-status" style="height: 20px; font-size: 12px; margin-top: 10px;"></div>
            </div>
            <button class="btn-text" id="back-to-select-dynamic" style="margin-top:5px;background:none;border:none;cursor:pointer;">&lt; 返回</button>
        `;

        const backDynamic = document.getElementById('back-to-select-dynamic');
        if (backDynamic) backDynamic.onclick = resetSyncModal;

        const btn = document.getElementById('start-sync-btn');
        const input = document.getElementById('sync-uid-input');
        const status = document.getElementById('sync-status');

        if (input) input.focus();

        const parseLink = (text, platform) => {
            const idMatch = text.match(/id=(\d+)/);
            if (idMatch) return idMatch[1];
            if (platform === 'netease') {
                const match = text.match(/playlist\/(\d+)/) || text.match(/id=(\d+)/);
                if (match) return match[1];
            }
            if (platform === 'qq') {
                const match = text.match(/id=(\d+)/);
                if (match) return match[1];
            }
            const numMatch = text.match(/(\d{5,12})/);
            if (numMatch) return numMatch[1];
            return text.trim();
        };

        if (btn) {
            btn.onclick = async () => {
                const val = input.value.trim();
                if (!val) {
                    status.textContent = '请输入链接或ID';
                    status.style.color = '#ff5252';
                    return;
                }

                const uid = parseLink(val, platform);
                if (!uid || uid.length < 4) {
                    status.textContent = '无法识别ID';
                    status.style.color = '#ff5252';
                    return;
                }

                btn.disabled = true;
                btn.textContent = '正在导入...';

                try {
                    let songs = await MusicAPI.getPlaylistSongs(platform === 'qq' ? 'tencent' : platform, uid);
                    if (!songs || songs.length === 0) throw new Error('歌单为空');

                    let realName = null;
                    try {
                        const info = await MusicAPI.getPlaylistInfo(platform === 'qq' ? 'tencent' : platform, uid);
                        if (info && info.name) realName = info.name;
                    } catch (e) { }

                    // Platform prefix for playlist name
                    const platformPrefixMap = { 'netease': '网易', 'qq': 'QQ', 'tencent': 'QQ', 'migu': '咪咕', 'kuwo': '酷我' };
                    const platformPrefix = platformPrefixMap[platform] || platform;

                    // Final playlist name with platform prefix
                    const baseName = realName || `导入歌单_${uid}`;
                    const finalPlName = `${platformPrefix}：${baseName}`;

                    const payload = [{
                        id: uid,
                        name: finalPlName,
                        tracks: songs.map(s => ({
                            // Preserve the ID exactly as returned from getPlaylistSongs (format: server-id)
                            id: s.id,
                            title: s.title,  // No suffix needed, playlist name has the prefix
                            artist: s.artist,
                            source: s.source || (platform === 'tencent' ? 'qq' : platform),
                            isImported: true,
                            album: s.album || '',
                            cover: s.cover || '',
                            url: '',  // Will be fetched on-demand
                            lrc: ''   // Will be fetched on-demand
                        }))
                    }];

                    const res = await DataService.importPlaylists(platform, uid, payload);
                    if (res.success) {
                        status.textContent = '导入成功！';
                        status.style.color = '#1ecf9f';

                        // Show different toast based on whether we got the real name
                        if (realName) {
                            UI.showToast(`成功导入 ${songs.length} 首歌曲！`);
                        } else {
                            UI.showToast(`已导入 ${songs.length} 首歌曲，请右键歌单重命名`);
                        }

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
                    status.textContent = e.message;
                    status.style.color = '#ff5252';
                }
            };
        }
    }

    document.addEventListener('playlist-updated', async (e) => {
        const plId = e.detail.id;
        await DataService.fetchPlaylists();
        if (state.currentView === 'playlist' && state.currentPlaylistId === plId) {
            const pl = DataService.playlists.find(p => p.id === plId);
            if (pl) {
                state.currentListData = pl.tracks;
                UI.renderSongList(pl.tracks, 1, 1, null, true, 'playlist', pl.id);
            }
        }
    });

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
        const songMenu = document.getElementById('song-ctx-menu');
        const plMenu = document.getElementById('pl-ctx-menu');
        if (songMenu) songMenu.style.display = 'none';
        if (plMenu) plMenu.style.display = 'none';
    });
});
