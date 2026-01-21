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
        // Separate sources for search and hot views
        searchActiveSources: ['netease'],  // For search - supports multi-source
        hotActiveSource: 'netease',        // For hot - single source only
        isMultiSource: false,
        globalKeyword: '',
        searchPage: 1,
        hotPage: 1,
        globalResults: [],
        currentListData: [],
        hotSongsCache: {},
        selectedBillboardId: null,
        isLoadingMore: false,
        // Per-source billboard state for independent tabs
        hotBillboardState: {
            netease: { selectedBillboardId: null, listCache: null, detailCache: null, currentBillboardName: null },
            qq: { selectedBillboardId: null, listCache: null, detailCache: null, currentBillboardName: null },
            kuwo: { selectedBillboardId: null, listCache: null, detailCache: null, currentBillboardName: null }
        }
    };
    window.appState = state; // 公开状态供 UI 层访问

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

    // View request ID to prevent race conditions when switching views quickly
    let currentViewRequestId = 0;

    // Search abort controller to cancel pending searches when switching sources
    let currentSearchController = null;

    // Listen for favorites update event
    document.addEventListener('favorites-updated', async () => {
        if (state.currentView === 'favorites') {
            await DataService.fetchFavorites();
            const favs = DataService.favorites;
            state.currentListData = favs;
            UI.renderSongList(favs, 1, 1, null, true, 'favorites');
        }
    });

    async function switchView(viewName, data = null) {
        // Increment request ID to invalidate any pending async operations
        const requestId = ++currentViewRequestId;
        state.currentView = viewName;

        // Clear selection when switching views
        UI.selectedSongs.clear();
        UI.updateBatchBar();
        document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
        const allCheck = document.getElementById('select-all-checkbox');
        if (allCheck) allCheck.checked = false;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        const navItem = document.querySelector(`.nav-item[data-view="${viewName}"]`);
        if (navItem) navItem.classList.add('active');

        const contentView = document.getElementById('content-view');
        if (contentView) {
            if (!contentView.contains(UI.songListContainer)) {
                contentView.appendChild(UI.songListContainer);
            }
            // Only hide, don't clear, to preserve persistent views like toplistGrid
            [...contentView.children].forEach(c => c.style.display = 'none');
            UI.songListContainer.style.display = 'block';
        }

        if (viewName === 'hot') {
            // Don't reset billboard selection - preserve per-source state
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

            // Hot view uses its own source
            updateSourceChips();
        } else {
            // Hide chart back button when not in hot view
            UI.hideChartBackButton();

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
                updateSourceChips();  // Show search sources
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
                state.currentListData = state.globalResults;  // Set currentListData for song clicks
                UI.renderSongList(state.globalResults, 1, 1, () => {
                    loadNextPage();
                }, false, 'search');
            } else if (state.globalKeyword) {
                doGlobalSearch();
            } else {
                UI.renderEmptyState();
            }
        }
        else if (viewName === 'hot') {
            // Load hot songs - uses hotActiveSource
            loadHotSongs(state.hotActiveSource, 1);
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
        if (viewName === 'playlist') {
            if (searchInput) {
                searchInput.value = '';
                searchInput.placeholder = '搜索歌单...';
            }
            if (data && data.tracks) {
                state.currentListData = data.tracks;
                state.currentPlaylistId = data.id;
                UI.renderSongList(data.tracks, 1, 1, null, true, 'playlist', data.id);
                // Ensure sidebar highlight is kept
                if (state.lastActivePlaylistDiv) {
                    state.lastActivePlaylistDiv.classList.add('active');
                }
            } else {
                UI.renderEmptyState('歌单为空');
            }
        }
    }

    async function loadHotSongs(source, page = 1, isAppend = false, forceRefresh = false) {
        // Capture current request ID to detect if view changed during async operations
        const thisRequestId = currentViewRequestId;

        // Get per-source state
        const sourceState = state.hotBillboardState[source] || { selectedBillboardId: null, listCache: null, detailCache: null };

        if (!isAppend) {
            state.hotPage = 1;
        }
        state.hotPage = page;
        state.isLoadingMore = true;
        UI.setLoadingMore(true);

        try {
            // Case 1: No billboard selected - show grid list
            if (!sourceState.selectedBillboardId) {
                if (!isAppend) {
                    UI.showLoading();
                    if (UI.contentView) UI.contentView.scrollTop = 0;
                }

                // Use cached list if available
                let list = sourceState.listCache;
                if (!list || forceRefresh) {
                    list = await MusicAPI.getBillboardList(source);
                    // Check if view changed during async operation
                    if (thisRequestId !== currentViewRequestId) return;
                    state.hotBillboardState[source].listCache = list;
                }

                // Check if view changed during async operation
                if (thisRequestId !== currentViewRequestId) return;
                // Check if source changed during async operation
                if (source !== state.hotActiveSource) return;

                // Render grid with back button hidden
                UI.hideChartBackButton();
                UI.renderToplistGrid(list, source, (target) => {
                    state.hotBillboardState[source].selectedBillboardId = target.id;
                    state.hotBillboardState[source].currentBillboardName = target.name;
                    state.hotPage = 1;
                    loadHotSongs(source, 1);
                });
                return;
            }

            // Case 2: Billboard selected - show detail
            const billboardId = sourceState.selectedBillboardId;

            // Show back button when viewing detail
            UI.showChartBackButton(sourceState.currentBillboardName || '榜单详情', () => {
                // Clear selection and go back to list (keep listCache for speed)
                state.hotBillboardState[source].selectedBillboardId = null;
                Object.assign(state.hotBillboardState[source], {
                    selectedBillboardId: null,
                    // Don't clear cache here so we can potentially re-enter without fetch IF same ID
                });
                loadHotSongs(source, 1);
            });

            // Use cached detail only if it matches current billboard ID
            if (!isAppend &&
                sourceState.detailCache &&
                sourceState.detailCache.length > 0 &&
                sourceState.cachedBillboardId === billboardId && // Check ID match
                !forceRefresh) {

                state.currentListData = sourceState.detailCache;
                state.hotSongsCache[source] = sourceState.detailCache;
                UI.renderSongList(sourceState.detailCache, 1, 1, () => { }, false, 'hot', null, false);
                return;
            }

            if (!isAppend) {
                UI.showLoading();
                if (UI.contentView) UI.contentView.scrollTop = 0;
            }

            // Fetch detail from API
            const res = await MusicAPI.getBillboardDetail(source, billboardId);

            // Check if view changed during async operation
            if (thisRequestId !== currentViewRequestId) return;
            // Check if source changed during async operation
            if (source !== state.hotActiveSource) return;

            const seenIds = new Set(isAppend ? (state.hotSongsCache[source] || []).map(s => s.id) : []);
            const actuallyNew = res.filter(item => {
                if (seenIds.has(item.id)) return false;
                seenIds.add(item.id);
                return true;
            });

            if (actuallyNew.length > 0) {
                if (isAppend) {
                    state.hotSongsCache[source] = [...(state.hotSongsCache[source] || []), ...actuallyNew];
                } else {
                    state.hotSongsCache[source] = actuallyNew;
                }
                state.currentListData = state.hotSongsCache[source];
                state.hotBillboardState[source].detailCache = state.hotSongsCache[source];
                state.hotBillboardState[source].cachedBillboardId = billboardId; // Save ID for validation
                UI.renderSongList(isAppend ? actuallyNew : state.hotSongsCache[source], 1, 1, () => {
                    // Toplists are usually full lists
                }, false, 'hot', null, isAppend);
            } else {
                if (!isAppend) UI.renderEmptyState('暂无热门歌曲');
            }
        } catch (e) {
            console.error(e);
            if (!isAppend) UI.renderEmptyState('加载失败');
        } finally {
            state.isLoadingMore = false;
            UI.setLoadingMore(false);
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

    async function doGlobalSearch(isAppend = false) {
        // Capture current request ID
        const thisRequestId = currentViewRequestId;

        // Abort any pending search requests
        if (currentSearchController && !isAppend) {
            currentSearchController.abort();
        }

        // Create new abort controller for this search
        if (!isAppend) {
            currentSearchController = new AbortController();
        }
        const searchSignal = currentSearchController?.signal;

        // Track this specific search request
        if (!isAppend) {
            state.currentSearchId = (state.currentSearchId || 0) + 1;
        }
        const thisSearchId = state.currentSearchId;

        if (!isAppend) {
            UI.showLoading();
            state.globalResults = [];
            state.searchDisplayCount = 0; // Reset display count for new search
            if (UI.contentView) UI.contentView.scrollTop = 0;
        } else {
            // Only show "loading more" indicator on scroll, not initial search
            UI.setLoadingMore(true);
        }
        state.isLoadingMore = true;
        try {
            let merged = [];

            // 如果是多源搜索且选择了 3 个源，调用聚合搜索接口
            if (state.isMultiSource && state.searchActiveSources.length === 3) {
                merged = await MusicAPI.aggregateSearch(state.globalKeyword, searchSignal);
            } else {
                // 如果是单源或 2 个源，分别调用
                // Initial search: 100 results, subsequent scroll: 20 more
                const searchLimit = isAppend ? 20 : 100;
                const promises = state.searchActiveSources.map(source =>
                    MusicAPI.search(state.globalKeyword, source, state.searchPage, searchLimit, searchSignal)
                        .catch(e => {
                            // Ignore abort errors
                            if (e.name === 'AbortError') return [];
                            return [];
                        })
                );
                const results = await Promise.all(promises);

                if (state.isMultiSource && state.searchActiveSources.length === 2) {
                    // 两个就分别调用两个接口。排序显示：先选择的在上面，交替显示 (121212)
                    const maxLength = Math.max(...results.map(r => r.length));
                    for (let i = 0; i < maxLength; i++) {
                        for (let j = 0; j < results.length; j++) {
                            if (results[j][i]) merged.push(results[j][i]);
                        }
                    }
                } else {
                    // 单个源
                    merged = results[0] || [];
                }
            }

            // Check if view changed during async operation
            if (thisRequestId !== currentViewRequestId) return;

            // Check if a newer search has started - if so, don't update UI
            if (thisSearchId !== state.currentSearchId) return;

            // 严格去重逻辑
            const seenIds = new Set(isAppend ? state.globalResults.map(s => s.id) : []);
            const actuallyNew = merged.filter(song => {
                if (seenIds.has(song.id)) return false;
                seenIds.add(song.id);
                return true;
            });

            if (isAppend) {
                state.globalResults = [...state.globalResults, ...actuallyNew];
            } else {
                state.globalResults = actuallyNew;
            }

            state.currentListData = state.globalResults;

            // Fix for pagination: If we fetched 100 items initially (limit=100), 
            // that's equivalent to 5 pages of standard 20-item limit.
            // So we set searchPage to 5, ensuring next loadNextPage() requests page 6.
            if (!isAppend && state.globalResults.length > 0) {
                state.searchPage = Math.ceil(state.globalResults.length / 20);
            }

            if (state.globalResults.length === 0) {
                if (!isAppend) UI.renderEmptyState('没有找到相关歌曲');
                return;
            }

            // Display all results (initial load: 100, subsequent: 20 more each)
            UI.renderSongList(isAppend ? actuallyNew : state.globalResults, 1, 1, () => {
                loadNextPage();
            }, false, 'search', null, isAppend);
        } catch (e) {
            // Don't show error for aborted requests
            if (e.name !== 'AbortError') {
                if (!isAppend) UI.renderEmptyState('搜索出错，请重试');
            }
        } finally {
            state.isLoadingMore = false;
            UI.setLoadingMore(false);
        }
    }

    function loadNextPage() {
        if (state.isLoadingMore) return;
        if (state.currentView === 'search' && state.globalKeyword) {
            // Load 20 more results from API
            state.searchPage++;
            doGlobalSearch(true);
        } else if (state.currentView === 'hot') {
            loadHotSongs(state.hotActiveSource, state.hotPage + 1, true);
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
            //case 'migu': return '咪咕音乐';
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

            if (!state.isMultiSource && state.searchActiveSources.length > 1) {
                state.searchActiveSources = [state.searchActiveSources[0]];
            }

            const names = state.searchActiveSources.map(s => getSourceDisplayName(s)).join(' 和 ');
            UI.showToast(`已为您切换至 ${names}，播放已暂停`, 'info');

            updateSourceChips();
            if (state.currentView === 'search' && state.globalKeyword) {
                // Abort pending search before starting new one
                if (currentSearchController) {
                    currentSearchController.abort();
                    currentSearchController = null;
                }
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
                state.hotActiveSource = source;
                state.hotPage = 1;
                updateSourceChips();
                loadHotSongs(source, 1);
                UI.showToast(`已切换至 ${getSourceDisplayName(source)} 热歌榜`, 'info');
                return;
            }

            if (state.isMultiSource) {
                if (state.searchActiveSources.includes(source)) {
                    if (state.searchActiveSources.length > 1) {
                        state.searchActiveSources = state.searchActiveSources.filter(s => s !== source);
                    } else {
                        UI.showToast('请至少保留一个音源', 'warning');
                        return;
                    }
                } else {
                    state.searchActiveSources.push(source);
                }

                if (window.player && typeof window.player.pause === 'function') {
                    window.player.pause();
                }

                const names = state.searchActiveSources.map(s => getSourceDisplayName(s)).join(' 和 ');
                UI.showToast(`已为您切换至 ${names}，播放已暂停`, 'info');
            } else {
                if (state.searchActiveSources.length === 1 && state.searchActiveSources[0] === source) return;

                if (window.player && typeof window.player.pause === 'function') {
                    window.player.pause();
                }

                state.searchActiveSources = [source];
                UI.showToast(`已为您切换至 ${getSourceDisplayName(source)}，播放已暂停`, 'info');
            }

            updateSourceChips();
            if (state.currentView === 'search' && state.globalKeyword) {
                // Abort pending search before starting new one
                if (currentSearchController) {
                    currentSearchController.abort();
                    currentSearchController = null;
                }
                state.searchPage = 1;
                doGlobalSearch();
            }
        });
    });

    function updateSourceChips() {
        sourceChips.forEach(c => {
            // Use appropriate source based on current view
            const activeSources = state.currentView === 'hot'
                ? [state.hotActiveSource]
                : state.searchActiveSources;
            if (activeSources.includes(c.dataset.source)) c.classList.add('active');
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
            state.lastActivePlaylistDiv = div; // Store reference to restore highlight
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
        qrDetail.innerHTML = '';
        qrDetail.style.display = 'block';

        const names = { 'netease': '网易云音乐', 'qq': 'QQ音乐', 'kuwo': '酷我音乐' };
        const name = names[platform] || platform;

        qrDetail.innerHTML = `
            <div style="padding: 10px 20px;">
                <i class="fas fa-link" style="font-size: 48px; color: var(--primary-color); margin-bottom: 20px;"></i>
                <h3 style="margin-bottom: 10px;">导入 ${name} 歌单</h3>
                <p style="font-size: 12px; color: #999; margin-bottom: 20px;">请粘贴歌单分享链接，系统将自动识别。</p>
                <input type="text" id="pl-import-input" placeholder="粘贴歌单链接..." style="width:100%; padding:12px; border-radius:8px; border:1px solid #ddd; margin-bottom:20px; font-size:14px;">
                <div style="display:flex; gap:10px;">
                    <button class="dialog-btn" id="pl-import-btn" style="flex:1; background:var(--primary-color); color:white; border:none; padding:10px; border-radius:8px; cursor:pointer;">立即解析</button>
                    <button class="dialog-btn" id="pl-import-cancel" style="flex:1; background:#eee; color:#666; border:none; padding:10px; border-radius:8px; cursor:pointer;">取消</button>
                </div>
            </div>
            <button class="btn-text" id="back-to-select-dynamic" style="margin-top:15px;background:none;border:none;cursor:pointer;color:var(--primary-color);font-size:14px;">&lt; 返回选择</button>
        `;

        const input = document.getElementById('pl-import-input');
        const btn = document.getElementById('pl-import-btn');
        const cancel = document.getElementById('pl-import-cancel');
        const backDynamic = document.getElementById('back-to-select-dynamic');

        if (backDynamic) backDynamic.onclick = resetSyncModal;
        if (cancel) cancel.onclick = resetSyncModal;
        if (input) input.focus();

        btn.onclick = async () => {
            const url = input.value.trim();
            if (!url) return UI.showToast('请输入链接或歌单 ID', 'warning');

            // 自动解析链接或识别平台
            let info = MusicAPI.parsePlaylistUrl(url);

            // 如果只有 ID 且解析不出平台，则使用当前手动选择的平台
            if (info && !info.source) {
                info.source = platform;
            } else if (!info) {
                // 如果完全无法解析，报错
                return UI.showToast('无法识别此链接，请粘贴完整的分享链接。', 'error');
            }

            btn.disabled = true;
            btn.textContent = '解析中...';

            UI.showToast(`正在从 ${names[info.source] || info.source} 获取歌单...`, 'info');
            try {
                const data = await MusicAPI.getPlaylistSongs(info.source, info.id);
                if (data && data.tracks.length > 0) {
                    await DataService.createPlaylist(data.name, data.tracks);
                    UI.showToast(`成功导入歌单: ${data.name}`, 'success');
                    UI.closeModal('qr-sync-modal');
                    renderSidebarPlaylists();
                } else {
                    UI.showToast('歌单内容为空或解析失败，请检查链接可见性。', 'error');
                    btn.disabled = false;
                    btn.textContent = '立即解析';
                }
            } catch (err) {
                UI.showToast('导入出错: ' + err.message, 'error');
                btn.disabled = false;
                btn.textContent = '立即解析';
            }
        };
    }
});
