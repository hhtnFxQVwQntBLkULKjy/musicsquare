const UI = {
    init() {
        this.songListContainer = document.querySelector('.song-list-container');
        this.contentView = document.getElementById('content-view');
        this.songListContainer.innerHTML = '';
        this.progressTrack = document.getElementById('progress-track');
        this.progressFill = document.getElementById('progress-fill');
        this.progressHandle = document.getElementById('progress-handle');
        this.timeCurrent = document.getElementById('time-current');
        this.timeTotal = document.getElementById('time-total');
        this.playerCover = document.getElementById('player-cover');
        this.playerTitle = document.getElementById('player-title');
        this.playerArtist = document.getElementById('player-artist');
        this.playBtn = document.getElementById('play-btn');
        this.overlay = document.getElementById('player-overlay');
        this.lyricsPanel = document.getElementById('lyrics-panel');
        this.cdWrapper = document.getElementById('cd-wrapper');
        this.downloadBtn = document.getElementById('download-btn');
        this.globalLoading = document.getElementById('global-loading');

        // Theme Toggle
        this.themeToggle = document.getElementById('theme-toggle');
        if (this.themeToggle) {
            const savedTheme = localStorage.getItem('theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            this.themeToggle.innerHTML = savedTheme === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';

            this.themeToggle.addEventListener('click', () => {
                const current = document.documentElement.getAttribute('data-theme');
                const next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('theme', next);
                this.themeToggle.innerHTML = next === 'dark' ? '<i class="fas fa-moon"></i>' : '<i class="fas fa-sun"></i>';
            });
        }

        // Dialog Elements
        this.uniDialog = document.getElementById('uni-dialog');
        this.dialogTitle = document.getElementById('dialog-title');
        this.dialogContent = document.getElementById('dialog-content');
        this.dialogConfirm = document.getElementById('dialog-confirm');
        this.dialogCancel = document.getElementById('dialog-cancel');
        this.dialogClose = document.getElementById('dialog-close');

        this.bindPlayerEvents();
        this.bindDialogEvents();
        this.initSidebarResizer();
        this.bindGlobalClickEvents();
        this.createBatchBar();
        this.selectedSongs = new Set();
        this.isSelectionMode = true;

        this.bindSelectionMode();
        this.bindEffectDropdown();
        this.bindQualityDropdown();

        // Sync Playlist Binding
        const syncBtn = document.getElementById('sync-pl-btn');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => {
                this.showSyncDialog();
            });
        }

        // --- Infinite Scroll Setup ---
        this._isLoadingMore = false;
        if (this.contentView) {
            this.contentView.addEventListener('scroll', () => {
                if (this._onLoadMore && !this._isLoadingMore) {
                    const { scrollTop, clientHeight, scrollHeight } = this.contentView;
                    // 触底 100px 触发
                    if (scrollTop + clientHeight >= scrollHeight - 100) {
                        this._onLoadMore();
                    }
                }
            });
        }

        // --- Scroll Loading Indicator ---
        // 已移除底部重复的 scrollLoadingTip，仅保留居中的 centerLoading

        // --- Center Loading Overlay (For scroll feedback) ---
        this.centerLoading = document.createElement('div');
        this.centerLoading.id = 'center-loading';
        this.centerLoading.style.cssText = `
            position: fixed; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            background: var(--card-bg, rgba(255,255,255,0.95)); 
            color: var(--primary-color, #1db954); 
            padding: 20px 35px; 
            border-radius: 12px; 
            display: none; 
            z-index: 1000; 
            align-items: center; 
            pointer-events: none;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            font-weight: 500;
            font-size: 14px;
        `;
        this.centerLoading.innerHTML = '<i class="fas fa-compact-disc fa-spin" style="margin-right:12px; font-size: 24px;"></i> 正在加载更多...';
        document.body.appendChild(this.centerLoading);

    },


    setLoadingMore(loading) {
        this._isLoadingMore = loading;
        if (this.centerLoading) {
            this.centerLoading.style.display = loading ? 'flex' : 'none';
        }
    },


    showLoadingLock() {
        if (this.globalLoading) {
            this.globalLoading.style.display = 'flex';
        }
    },

    hideLoadingLock() {
        if (this.globalLoading) {
            this.globalLoading.style.display = 'none';
        }
    },

    clearLoadingToasts() {
        this.hideLoadingLock();
    },

    showSyncDialog() {
        const container = document.createElement('div');
        container.style.padding = '10px 0';
        const tip = document.createElement('p');
        tip.style.fontSize = '12px';
        tip.style.color = '#888';
        tip.style.marginBottom = '15px';
        tip.textContent = '支持网易云、QQ音乐歌单分享链接（建议使用浏览器打开歌单后复制地址）。';

        const platformWrap = document.createElement('div');
        platformWrap.style.display = 'flex';
        platformWrap.style.gap = '10px';
        platformWrap.style.marginBottom = '15px';

        let selectedPlatform = 'netease';
        const createPlatBtn = (id, label) => {
            const btn = document.createElement('div');
            btn.className = 'dialog-btn';
            btn.style.flex = '1';
            btn.style.textAlign = 'center';
            btn.style.padding = '8px';
            btn.style.borderRadius = '6px';
            btn.style.border = '1px solid #ddd';
            btn.style.fontSize = '14px';
            btn.style.cursor = 'pointer';
            btn.textContent = label;

            const updateStyles = () => {
                if (selectedPlatform === id) {
                    btn.style.background = 'var(--primary-color)';
                    btn.style.color = 'white';
                    btn.style.borderColor = 'var(--primary-color)';
                } else {
                    btn.style.background = 'none';
                    btn.style.color = 'var(--text-main)';
                    btn.style.borderColor = '#ddd';
                }
            };
            btn.onclick = () => {
                selectedPlatform = id;
                platformWrap.childNodes.forEach(c => c.updateStyles());
            };
            btn.updateStyles = updateStyles;
            updateStyles();
            return btn;
        };

        platformWrap.appendChild(createPlatBtn('netease', '网易云音乐'));
        platformWrap.appendChild(createPlatBtn('qq', 'QQ音乐'));
        platformWrap.appendChild(createPlatBtn('kuwo', '酷我音乐'));

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = '粘贴歌单链接，如 https://music.163.com/playlist?id=...';
        input.style.width = '100%';
        input.style.padding = '12px';
        input.style.borderRadius = '8px';
        input.style.border = '1px solid #ddd';
        input.style.fontSize = '14px';

        container.appendChild(tip);
        container.appendChild(platformWrap);
        container.appendChild(input);

        this.showDialog({
            title: '同步平台歌单',
            content: container,
            onConfirm: async (setLoading) => {
                const url = input.value.trim();
                if (!url) {
                    this.showToast('请输入歌单链接', 'warning');
                    return;
                }
                setLoading(true);
                const success = await DataService.syncPlatform(selectedPlatform, url);
                setLoading(false);
                if (success) {
                    this.uniDialog.classList.remove('show');
                    document.dispatchEvent(new CustomEvent('playlists-updated'));
                }
            }
        });
    },

    bindSelectionMode() { },

    bindEffectDropdown() {
        const btn = document.getElementById('effect-btn');
        const menu = document.getElementById('effect-menu');
        if (!btn || !menu) return;

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            menu.classList.toggle('show');
        });

        menu.querySelectorAll('.effect-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const mode = item.dataset.mode;
                if (window.player) {
                    try {
                        window.player.setAudioEffect(mode);
                        btn.textContent = item.textContent;
                        this.showToast(`音效已切换为: ${item.textContent}`, 'success');
                    } catch (err) {
                        this.showToast(`音效设置失败，回滚为原声`, 'error');
                        window.player.setAudioEffect('original');
                        btn.textContent = '原声';
                        menu.querySelectorAll('.effect-item').forEach(i => i.classList.remove('active'));
                        menu.querySelector('[data-mode="original"]').classList.add('active');
                    }
                    menu.classList.remove('show');
                    menu.querySelectorAll('.effect-item').forEach(i => i.classList.remove('active'));
                    item.classList.add('active');
                }
            });
        });

        document.addEventListener('click', () => {
            menu.classList.remove('show');
        });
    },

    bindQualityDropdown() {
        const btn = document.getElementById('quality-btn');
        const menu = document.getElementById('quality-menu');
        if (!btn || !menu) return;

        // Initialize from saved preference
        const saved = MusicAPI.preferredQuality;
        const labels = { '128k': '标准音质', '320k': '高品质', 'flac': '无损音质', 'flac24bit': 'Hi-Res' };
        btn.textContent = labels[saved] || '高品质';
        menu.querySelectorAll('.effect-item').forEach(item => {
            item.classList.toggle('active', item.dataset.quality === saved);
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            menu.classList.toggle('show');
        });

        menu.querySelectorAll('.effect-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const quality = item.dataset.quality;
                MusicAPI.preferredQuality = quality;
                btn.textContent = item.textContent;
                menu.classList.remove('show');
                menu.querySelectorAll('.effect-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                this.showToast(`音质已切换为: ${item.textContent}`, 'success');
            });
        });

        document.addEventListener('click', () => {
            menu.classList.remove('show');
        });
    },

    bindGlobalClickEvents() {
        document.addEventListener('click', (e) => {
            const songMenu = document.getElementById('song-ctx-menu');
            const plMenu = document.getElementById('pl-ctx-menu');
            if (songMenu && songMenu.style.display === 'block' && !e.target.closest('#song-ctx-menu') && !e.target.closest('.more-btn')) {
                songMenu.style.display = 'none';
            }
            if (plMenu && plMenu.style.display === 'block' && !e.target.closest('#pl-ctx-menu') && !e.target.closest('.pl-nav-item')) {
                plMenu.style.display = 'none';
            }
        });
    },

    initSidebarResizer() {
        const resizer = document.getElementById('sidebar-resizer');
        const sidebar = document.querySelector('.sidebar');
        const playerBar = document.getElementById('player-bar');
        const overlay = document.getElementById('player-overlay');
        let isResizing = false;

        if (resizer) {
            resizer.addEventListener('mousedown', (e) => {
                isResizing = true;
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            });
        }

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            let width = e.clientX;
            if (width < 180) width = 180;
            if (width > 400) width = 400;
            document.documentElement.style.setProperty('--sidebar-width', `${width}px`);
            if (playerBar) playerBar.style.left = `${width + 20}px`;
            if (overlay) overlay.style.left = `${width}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = 'default';
                document.body.style.userSelect = 'auto';
                localStorage.setItem('sidebarWidth', document.documentElement.style.getPropertyValue('--sidebar-width'));
            }
        });

        const savedWidth = localStorage.getItem('sidebarWidth');
        if (savedWidth) {
            document.documentElement.style.setProperty('--sidebar-width', savedWidth);
            const w = parseInt(savedWidth);
            if (playerBar) playerBar.style.left = `${w + 20}px`;
            if (overlay) overlay.style.left = `${w}px`;
        }
    },

    bindPlayerEvents() {
        let isDragging = false;
        const updateDrag = (e) => {
            const rect = this.progressTrack.getBoundingClientRect();
            let x = e.clientX - rect.left;
            if (x < 0) x = 0;
            if (x > rect.width) x = rect.width;
            const percent = (x / rect.width) * 100;
            this.progressFill.style.width = `${percent}%`;
            this.progressHandle.style.left = `calc(${percent}% - 5px)`;
            if (player.audio.duration) {
                const time = (percent / 100) * player.audio.duration;
                this.timeCurrent.textContent = this.formatTime(time);
            }
            return (x / rect.width);
        };
        if (this.progressTrack) {
            this.progressTrack.addEventListener('mousedown', (e) => {
                isDragging = true;
                const ratio = updateDrag(e);
                if (player.audio.duration) player.audio.currentTime = ratio * player.audio.duration;
            });
        }
        document.addEventListener('mousemove', (e) => { if (isDragging) updateDrag(e); });
        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                const ratio = updateDrag(e);
                if (player.audio.duration) player.seek(ratio * player.audio.duration);
            }
        });

        const toggleOverlay = () => {
            if (this.overlay.classList.contains('active')) {
                this.overlay.classList.remove('active');
            } else {
                this.overlay.classList.add('active');
                // Fix: Force scroll to current lyric when opening player
                if (window.player && typeof window.player.lyricIndex === 'number' && window.player.lyricIndex >= 0) {
                    // Small delay to ensure transition starts/layout updates
                    setTimeout(() => this.highlightLyric(window.player.lyricIndex), 100);
                }
            }
        };
        const wrapper = document.getElementById('cover-wrapper');
        const info = document.getElementById('player-info-area');
        const close = document.getElementById('overlay-close');
        const overlayCover = document.getElementById('overlay-cover');

        if (wrapper) wrapper.addEventListener('click', toggleOverlay);
        if (info) info.addEventListener('click', toggleOverlay);
        if (close) close.addEventListener('click', toggleOverlay);
        if (overlayCover) overlayCover.addEventListener('click', toggleOverlay);

        if (this.downloadBtn) {
            this.downloadBtn.onclick = () => {
                if (player.currentTrack) this.handleDownload(player.currentTrack);
                else this.showToast('暂无播放歌曲', 'warning');
            };
        }
    },

    showToast(msg, type = 'success') {
        const container = document.querySelector('.toast-container') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.style.zIndex = '9999';
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });
        setTimeout(() => {
            if (toast.parentElement) {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(-20px)';
                setTimeout(() => toast.remove(), 300);
            }
        }, 3000);
    },

    clearToasts() {
        document.querySelectorAll('.toast').forEach(t => t.remove());
    },

    clearLoadingToasts() {
        document.querySelectorAll('.toast').forEach(t => {
            if (t.textContent.includes('正在加载') || t.textContent.includes('正在搜索')) t.remove();
        });
    },

    createToastContainer() {
        const div = document.createElement('div');
        div.className = 'toast-container';
        div.style.zIndex = '9999';
        document.body.appendChild(div);
        return div;
    },

    showModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('show');
    },

    closeModal(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('show');
    },

    createBatchBar() {
        const self = this;  // Capture reference to UI object
        const div = document.createElement('div');
        div.className = 'batch-bar';
        div.innerHTML = `
            <span>已选择 <span class="batch-count">0</span> 首</span>
            <div class="batch-btn" id="batch-add-pl"><i class="fas fa-plus"></i> 添加到歌单</div>
            <div class="batch-btn" id="batch-add-fav"><i class="fas fa-heart"></i> 收藏到我的</div>
            <div class="batch-btn" id="batch-remove-fav"><i class="fas fa-heart-broken"></i> 取消收藏</div>
            <div class="batch-btn" id="batch-play-next"><i class="fas fa-list"></i> 下一首播放</div>
            <div class="batch-btn batch-delete-btn" style="color:#ff5252;border-color:#ff5252;display:none" id="batch-delete"><i class="fas fa-trash"></i> 批量删除</div>
            <div class="batch-btn" style="color:#ff5252;border-color:#ff5252" id="batch-clear"><i class="fas fa-times"></i> 取消选择</div>
        `;
        document.body.appendChild(div);
        this.batchBar = div;

        // Use explicit self reference and addEventListener for better binding
        div.querySelector('#batch-add-pl').addEventListener('click', function (e) {
            e.stopPropagation();
            if (self.selectedSongs.size === 0) return;
            self.showBatchPlaylistSelect([...self.selectedSongs]);
        });
        div.querySelector('#batch-add-fav').addEventListener('click', function (e) {
            e.stopPropagation();
            if (self.selectedSongs.size === 0) return;
            self.batchAddFavorites([...self.selectedSongs]);
        });
        div.querySelector('#batch-remove-fav').addEventListener('click', function (e) {
            e.stopPropagation();
            if (self.selectedSongs.size === 0) return;
            self.batchRemoveFavorites([...self.selectedSongs]);
        });
        div.querySelector('#batch-play-next').addEventListener('click', function (e) {
            e.stopPropagation();
            const list = [...self.selectedSongs];
            if (list.length === 0) return;
            if (window.player) {
                window.player.addToNextQueue(list);
                self.showToast(`已添加 ${list.length} 首歌曲到播放队列`);
                self.selectedSongs.clear();
                self.updateBatchBar();
                document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                const allCheck = document.getElementById('select-all-checkbox');
                if (allCheck) allCheck.checked = false;
            }
        });
        div.querySelector('#batch-delete').addEventListener('click', function (e) {
            e.stopPropagation();
            if (self.selectedSongs.size === 0) return;
            self.batchDeleteSongs([...self.selectedSongs]);
        });
        div.querySelector('#batch-clear').addEventListener('click', function (e) {
            e.stopPropagation();
            self.selectedSongs.clear();
            self.updateBatchBar();
            document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
            const allCheck = document.getElementById('select-all-checkbox');
            if (allCheck) allCheck.checked = false;
        });
    },

    updateBatchBar() {
        const count = this.selectedSongs.size;
        this.batchBar.querySelector('.batch-count').textContent = count;
        if (count > 0) this.batchBar.classList.add('show');
        else this.batchBar.classList.remove('show');

        // Show delete button in history and playlist views only (NOT in search, hot, or favorites)
        // Favorites should use "取消收藏" button instead of delete
        const deleteBtn = document.getElementById('batch-delete');
        if (deleteBtn) {
            const showDelete = ['history', 'playlist'].includes(this._currentViewType);
            deleteBtn.style.display = showDelete ? 'flex' : 'none';
        }
    },

    async showBatchPlaylistSelect(songs) {
        await DataService.fetchPlaylists();
        const pls = DataService.playlists;
        if (pls.length === 0) { this.showToast('暂无创建的歌单', 'warning'); return; }
        const container = document.createElement('div');
        container.className = 'pl-multi-select';
        const list = document.createElement('div');
        list.className = 'pl-select-list';
        list.style.maxHeight = '300px';
        list.style.overflowY = 'auto';
        const selectedPls = new Set();
        pls.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'pl-select-item';
            const count = pl.tracks ? pl.tracks.length : 0;
            item.innerHTML = `
                <input type="checkbox" class="pl-checkbox" data-id="${pl.id}">
                <div class="pl-select-info">
                    <span class="pl-select-name">${pl.name}</span>
                    <span class="pl-select-count">${count}首</span>
                </div>
            `;
            item.onclick = (e) => {
                if (e.target.classList.contains('pl-checkbox')) return;
                const cb = item.querySelector('.pl-checkbox');
                cb.checked = !cb.checked;
                if (cb.checked) selectedPls.add(pl.id);
                else selectedPls.delete(pl.id);
            };
            item.querySelector('.pl-checkbox').onclick = (e) => {
                e.stopPropagation();
                if (e.target.checked) selectedPls.add(pl.id);
                else selectedPls.delete(pl.id);
            };
            list.appendChild(item);
        });
        container.appendChild(list);
        this.showDialog({
            title: songs.length === 1 ? `选择添加到的歌单` : `批量添加 ${songs.length} 首歌曲`,
            content: container,
            onConfirm: async (setLoading) => {
                if (selectedPls.size === 0) { this.showToast('请选择目标歌单', 'warning'); return; }
                setLoading(true);
                const plIds = [...selectedPls];
                try {
                    for (const plId of plIds) await DataService.addBatchSongsToPlaylist(plId, songs);
                    this.showToast(`成功添加至 ${plIds.length} 个歌单`, 'success');
                    this.selectedSongs.clear();
                    this.updateBatchBar();
                    document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                    const allCheck = document.getElementById('select-all-checkbox');
                    if (allCheck) allCheck.checked = false;
                    return true;
                } catch (e) {
                    this.showToast(`批量添加失败: ${e.message}`, 'error');
                    return false;
                } finally { setLoading(false); }
            },
            showCancel: true
        });
    },

    showPlaylistSelect(song) { this.showBatchPlaylistSelect([song]); },

    bindDialogEvents() {
        const hide = () => { if (this.isDialogLoading) return; this.uniDialog.classList.remove('show'); };
        this.dialogClose.onclick = hide;
        this.dialogCancel.onclick = hide;
        this.uniDialog.onclick = (e) => { if (this.isDialogLoading) return; if (e.target === this.uniDialog) hide(); };
    },

    showDialog({ title, content, onConfirm, showCancel = true }) {
        this.dialogTitle.textContent = title;
        this.dialogContent.innerHTML = '';
        if (typeof content === 'string') this.dialogContent.textContent = content;
        else this.dialogContent.appendChild(content);
        this.dialogCancel.style.display = showCancel ? 'block' : 'none';
        this.uniDialog.classList.remove('loading');
        const setLoading = (loading) => {
            this.isDialogLoading = loading;
            if (loading) {
                this.uniDialog.classList.add('loading');
                this.dialogConfirm.disabled = true; this.dialogCancel.disabled = true;
                this.dialogConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 处理中...';
            } else {
                this.uniDialog.classList.remove('loading');
                this.dialogConfirm.disabled = false; this.dialogCancel.disabled = false;
                this.dialogConfirm.textContent = '确认';
            }
        };
        if (onConfirm) {
            this.dialogConfirm.style.display = 'block';
            this.dialogConfirm.onclick = async () => {
                const shouldClose = await onConfirm(setLoading);
                if (shouldClose !== false) this.uniDialog.classList.remove('show');
            };
        } else this.dialogConfirm.style.display = 'none';
        this.uniDialog.classList.add('show');
    },

    batchAddFavorites(songs) {
        this.showDialog({
            title: `批量收藏`,
            content: `确定要将选中的 ${songs.length} 首歌曲添加到我的收藏吗？`,
            onConfirm: async (setLoading) => {
                setLoading(true);
                try {
                    await DataService.addBatchFavorites(songs);
                    this.showToast(`成功收藏 ${songs.length} 首歌曲`, 'success');
                    this.selectedSongs.clear(); this.updateBatchBar();
                    document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                    const allCheck = document.getElementById('select-all-checkbox');
                    if (allCheck) allCheck.checked = false;
                    return true;
                } catch (e) { this.showToast(`批量收藏失败: ${e.message}`, 'error'); return false; }
                finally { setLoading(false); }
            },
            showCancel: true
        });
    },

    batchRemoveFavorites(songs) {
        this.showDialog({
            title: `批量取消收藏`,
            content: `确定要将选中的 ${songs.length} 首歌曲从收藏中移除吗？`,
            onConfirm: async (setLoading) => {
                setLoading(true);
                try {
                    await DataService.removeBatchFavorites(songs);
                    this.showToast(`已取消收藏 ${songs.length} 首歌曲`, 'success');
                    this.selectedSongs.clear(); this.updateBatchBar();
                    document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                    const allCheck = document.getElementById('select-all-checkbox');
                    if (allCheck) allCheck.checked = false;
                    // Refresh favorites view if currently on it
                    if (this._currentViewType === 'favorites') {
                        document.dispatchEvent(new CustomEvent('favorites-updated'));
                    }
                    return true;
                } catch (e) { this.showToast(`批量取消收藏失败: ${e.message}`, 'error'); return false; }
                finally { setLoading(false); }
            },
            showCancel: true
        });
    },

    batchDeleteSongs(songs) {
        const viewType = this._currentViewType;
        const plId = this._currentPlaylistId;

        // Handle based on view type
        if (viewType === 'favorites') {
            // For favorites, use batchRemoveFavorites instead
            this.batchRemoveFavorites(songs);
            return;
        }

        if (viewType === 'history') {
            this.showDialog({
                title: `批量删除`,
                content: `确定要从播放历史中删除选中的 ${songs.length} 首歌曲吗？`,
                onConfirm: async (setLoading) => {
                    setLoading(true);
                    try {
                        await DataService.removeBatchHistory(songs);
                        this.showToast(`已删除 ${songs.length} 首歌曲`, 'success');
                        this.selectedSongs.clear(); this.updateBatchBar();
                        document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                        const allCheck = document.getElementById('select-all-checkbox');
                        if (allCheck) allCheck.checked = false;
                        songs.forEach(song => {
                            const songEl = document.querySelector(`.song-item[data-id="${song.id || song.uid}"]`);
                            if (songEl) songEl.remove();
                        });
                        return true;
                    } catch (e) { this.showToast(`批量删除失败: ${e.message}`, 'error'); return false; }
                    finally { setLoading(false); }
                },
                showCancel: true
            });
            return;
        }

        // Playlist view
        if (!plId) {
            this.showToast('当前不在歌单视图中', 'error');
            return;
        }
        this.showDialog({
            title: `批量删除`,
            content: `确定要从歌单中删除选中的 ${songs.length} 首歌曲吗？`,
            onConfirm: async (setLoading) => {
                setLoading(true);
                try {
                    await DataService.removeBatchSongsFromPlaylist(plId, songs);
                    this.showToast(`已删除 ${songs.length} 首歌曲`, 'success');
                    this.selectedSongs.clear(); this.updateBatchBar();
                    document.querySelectorAll('.song-checkbox').forEach(c => c.checked = false);
                    const allCheck = document.getElementById('select-all-checkbox');
                    if (allCheck) allCheck.checked = false;
                    songs.forEach(song => {
                        const songEl = document.querySelector(`.song-item[data-id="${song.id || song.uid}"]`);
                        if (songEl) songEl.remove();
                    });
                    return true;
                } catch (e) { this.showToast(`批量删除失败: ${e.message}`, 'error'); return false; }
                finally { setLoading(false); }
            },
            showCancel: true
        });
    },

    showInput({ title, placeholder, onConfirm }) {
        const input = document.createElement('input');
        input.style.cssText = 'width:100%; padding:12px; border-radius:8px; border:1px solid #ddd;';
        input.placeholder = placeholder;
        this.showDialog({ title, content: input, onConfirm: () => onConfirm(input.value.trim()) });
        setTimeout(() => input.focus(), 100);
    },

    showLoading() {
        this.songListContainer.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>正在加载...</p></div>';
    },

    renderEmptyState(msg = '搜索你想听的歌曲') {
        this.songListContainer.innerHTML = `<div class="empty-state"><i class="fas fa-music"></i><p>${msg}</p></div>`;
    },

    hideLoading() {
        // Defensive safeguard
    },

    // --- Chart Back Button ---
    showChartBackButton(title, onBack) {
        if (!this.chartBackBtn) {
            this.chartBackBtn = document.createElement('div');
            this.chartBackBtn.className = 'chart-back-btn';
            this.chartBackBtn.innerHTML = `
                <button class="back-btn"><i class="fas fa-arrow-left"></i></button>
                <span class="chart-title"></span>
            `;
            this.chartBackBtn.style.cssText = `
                display: flex; align-items: center; gap: 12px; 
                padding: 10px 0; margin-bottom: 10px;
            `;
            const btn = this.chartBackBtn.querySelector('.back-btn');
            btn.style.cssText = `
                width: 36px; height: 36px; border-radius: 50%; border: none;
                background: var(--bg-body); cursor: pointer; color: var(--text-main);
                display: flex; align-items: center; justify-content: center;
                transition: all 0.2s; box-shadow: var(--shadow-card);
            `;
            btn.onmouseenter = () => { btn.style.background = 'var(--primary-color)'; btn.style.color = 'white'; };
            btn.onmouseleave = () => { btn.style.background = 'var(--bg-body)'; btn.style.color = 'var(--text-main)'; };
            this.chartBackBtn.querySelector('.chart-title').style.cssText = `
                font-size: 18px; font-weight: 600; color: var(--text-main);
            `;
        }
        this.chartBackBtn.querySelector('.chart-title').textContent = title;
        this.chartBackBtn.querySelector('.back-btn').onclick = onBack;
        this.chartBackBtn.style.display = 'flex';

        // Insert at top of content view
        if (this.contentView && !this.contentView.contains(this.chartBackBtn)) {
            this.contentView.insertBefore(this.chartBackBtn, this.contentView.firstChild);
        }
    },

    hideChartBackButton() {
        if (this.chartBackBtn) {
            this.chartBackBtn.style.display = 'none';
        }
    },

    // --- Toplist Grid ---
    renderToplistGrid(toplists, source, onSelect) {
        if (!this.toplistGrid) {
            this.toplistGrid = document.createElement('div');
            this.toplistGrid.className = 'toplist-grid';
            this.contentView.appendChild(this.toplistGrid);
        }

        this.toplistGrid.innerHTML = '';
        this.toplistGrid.style.display = 'grid';
        this.songListContainer.style.display = 'none';

        toplists.forEach(item => {
            const card = document.createElement('div');
            card.className = 'toplist-card';
            card.innerHTML = `
                <div class="toplist-cover-wrapper">
                    <img class="toplist-cover" src="${item.pic || 'https://placehold.co/200x200?text=Toplist'}" loading="lazy">
                    <div class="toplist-mask">
                        <i class="fas fa-play-circle toplist-play-icon"></i>
                    </div>
                </div>
                <div class="toplist-info">
                    <div class="toplist-name">${item.name}</div>
                    <div class="toplist-update">排行榜</div>
                </div>
            `;
            card.onclick = () => onSelect(item);
            this.toplistGrid.appendChild(card);
        });
    },

    // --- Song List ---
    renderSongList(songs, page = 1, total = 1, onMore = null, isStatic = false, viewType = 'search', playlistId = null, isAppend = false) {
        if (this.toplistGrid) this.toplistGrid.style.display = 'none';
        this.songListContainer.style.display = 'block';

        if (!isAppend) {
            this.songListContainer.innerHTML = '';
            this.selectedSongs.clear();
        }
        this._lastRenderArgs = arguments;

        if (songs.length === 0 && !isAppend) {
            this.renderEmptyState('没有找到相关歌曲');
            return;
        }

        if (!isAppend) {
            this.songListContainer.classList.add('selection-mode');
            const header = document.createElement('div');
            header.className = 'list-header';
            header.innerHTML = `
                <div class="col-check"><input type="checkbox" id="select-all-checkbox"></div>
                <div class="col-index">#</div><div>标题</div><div>歌手</div><div>专辑</div><div>时长</div><div style="text-align: right">操作</div>
            `;
            this.songListContainer.appendChild(header);

            // Store songs reference for select-all
            this._currentSongsList = songs;

            const self = this;
            const allCheck = header.querySelector('#select-all-checkbox');
            allCheck.onclick = (e) => {
                const checked = e.target.checked;
                document.querySelectorAll('.song-checkbox').forEach(c => c.checked = checked);
                // Update selectedSongs set
                if (checked) {
                    // Add all songs from current list
                    if (self._currentSongsList) {
                        self._currentSongsList.forEach(song => self.selectedSongs.add(song));
                    }
                } else {
                    // Clear all selections
                    self.selectedSongs.clear();
                }
                self.updateBatchBar();
            };
        } else {
            // Append mode - extend songs list
            if (this._currentSongsList) {
                this._currentSongsList = [...this._currentSongsList, ...songs];
            }
        }

        this._currentViewType = viewType;
        this._currentPlaylistId = playlistId;

        // 序号基数：追加模式时基于已有 DOM 数量，首次加载时为 0
        const baseIndex = isAppend ? this.songListContainer.querySelectorAll('.song-item').length : 0;

        songs.forEach((song, index) => {
            const div = document.createElement('div');
            div.className = 'song-item';
            div.dataset.id = song.id || song.uid;
            div.onclick = (e) => {
                if (e.target.closest('.col-check') || e.target.closest('input')) return;
                if (e.target.closest('.btn-action') || e.target.closest('.col-actions')) return;
                if (song.unplayable) { this.showToast('该歌曲暂时无法播放', 'error'); return; }
                if (window.player) {
                    // 使用 ID 寻址，不再强依赖索引
                    window.player.setPlaylist(window.appState ? window.appState.currentListData : songs, -1, song.id || song.uid);
                }
            };
            if (window.player && window.player.currentTrack && window.player.currentTrack.id === song.id) div.classList.add('playing');
            if (song.unplayable) div.classList.add('unplayable');

            const isFav = DataService.isFavorite(song);
            const favClass = isFav ? 'fas fa-heart active' : 'far fa-heart';
            const showDeleteBtn = viewType === 'playlist';
            const isSelected = this.selectedSongs.has(song);

            // 序号：基数 + 当前索引 + 1
            const displayIndex = baseIndex + index + 1;



            div.innerHTML = `
                <div class="col-check"><input type="checkbox" class="song-checkbox" ${isSelected ? 'checked' : ''}></div>
                <div class="col-index">${displayIndex}</div>
                <div class="col-title">${song.title} <span class="source-tag">${this.getSourceName(song.source)}</span></div>

                <div class="col-artist">${song.artist}</div>
                <div class="col-album">${song.album || '-'}</div>
                <div class="col-duration">${this.formatTime(song.duration)}</div>
                <div class="col-actions">
                    <button class="btn-action fav ${isFav ? 'active' : ''}" title="${isFav ? '取消收藏' : '收藏'}"><i class="${favClass}"></i></button>
                    <button class="btn-action download-btn" title="下载"><i class="fas fa-download"></i></button>
                    <button class="btn-action more-btn" title="更多"><i class="fas fa-ellipsis-h"></i></button>
                    <button class="btn-action del-song-btn" title="从歌单删除" style="color:#ff5252; display: ${showDeleteBtn ? 'flex' : 'none'}"><i class="fas fa-trash"></i></button>
                </div>
            `;

            const ck = div.querySelector('.song-checkbox');
            ck.onclick = (e) => {
                e.stopPropagation();
                if (ck.checked) this.selectedSongs.add(song);
                else this.selectedSongs.delete(song);
                this.updateBatchBar();
            };
            div.querySelector('.more-btn').onclick = (e) => {
                e.stopPropagation();
                this.showSongContextMenu(e.clientX, e.clientY, song);
            };
            const delBtn = div.querySelector('.del-song-btn');
            if (delBtn && showDeleteBtn) {
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const plId = this._currentPlaylistId;
                    this.showDialog({
                        title: '删除歌曲',
                        content: `确定要删除 "${song.title}" 吗？`,
                        onConfirm: async () => {
                            await DataService.removeSongFromPlaylist(plId, song.uid || song.id);
                            div.remove(); this.showToast('已删除');
                        }
                    });
                });
            }
            div.querySelector('.download-btn').onclick = (e) => { e.stopPropagation(); this.handleDownload(song); };
            const favBtn = div.querySelector('.fav');
            favBtn.onclick = (e) => { e.stopPropagation(); this.toggleFavorite(song, favBtn); };
            this.songListContainer.appendChild(div);
        });

        this._onLoadMore = onMore;
        if (window.player && window.player.currentTrack) this.highlightPlayingByID(window.player.currentTrack.id);
    },

    toggleFavorite(song, btnEl) {
        if (DataService.isFavorite(song)) {
            DataService.removeFavorite(song.uid || song.id);
            btnEl.classList.remove('active');
            btnEl.querySelector('i').className = 'far fa-heart';
            if (this._currentViewType === 'favorites') document.dispatchEvent(new CustomEvent('favorites-updated'));
        } else {
            DataService.addFavorite(song);
            btnEl.classList.add('active');
            btnEl.querySelector('i').className = 'fas fa-heart';
        }
    },

    handleDownload(song) {
        if (!song || !song.url) {
            this.showDialog({ title: '提示', content: '请求超时或由于版权保护无法下载该音源。请尝试播放后再下载。', showCancel: false });
            return;
        }
        window.open(song.url, '_blank');
    },

    getSourceName(source) {
        const map = { 'netease': '网易', 'qq': 'QQ', 'tencent': 'QQ', 'kuwo': '酷我' };
        return map[source] || source;
    },

    showSongContextMenu(x, y, song) {
        const menu = document.getElementById('song-ctx-menu');
        const w = window.innerWidth, h = window.innerHeight;
        if (x + 160 > w) x = w - 170;
        if (y + 100 > h) y = h - 110;
        menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.display = 'block';
        const playNext = document.getElementById('ctx-play-next');
        const addPl = document.getElementById('ctx-add-pl');
        const newPlayNext = playNext.cloneNode(true);
        const newAddPl = addPl.cloneNode(true);
        playNext.parentNode.replaceChild(newPlayNext, playNext);
        addPl.parentNode.replaceChild(newAddPl, addPl);
        newPlayNext.onclick = () => {
            player.addToNextQueue(song);
            menu.style.display = 'none';
            this.showToast('已添加到下一首播放');
        };
        newAddPl.onclick = () => { menu.style.display = 'none'; this.showPlaylistSelect(song); };
    },

    showPlaylistContextMenu(x, y, pl, onDelete, onRename) {
        const menu = document.getElementById('pl-ctx-menu');
        menu.style.left = `${x}px`; menu.style.top = `${y}px`; menu.style.display = 'block';
        const ren = document.getElementById('ctx-rename-pl'), del = document.getElementById('ctx-delete-pl');
        const newRen = ren.cloneNode(true), newDel = del.cloneNode(true);
        ren.parentNode.replaceChild(newRen, ren);
        del.parentNode.replaceChild(newDel, del);
        newRen.onclick = () => {
            menu.style.display = 'none';
            this.showInput({ title: '重命名歌单', placeholder: '新名称', onConfirm: (name) => { if (name) onRename(pl.id, name); } });
        };
        newDel.onclick = () => {
            menu.style.display = 'none';
            this.showDialog({ title: '删除确认', content: `确定要删除 "${pl.name}" 吗？`, onConfirm: () => onDelete(pl.id) });
        };
    },

    highlightPlayingByID(id) {
        if (!id) return;
        // Only highlight within the current song list container to avoid multiple highlights
        const container = this.songListContainer || document;
        const items = container.querySelectorAll('.song-item');
        const sid = String(id);
        items.forEach((el) => {
            if (el.dataset.id === sid) {
                el.classList.add('playing');
                // Ensure it's scrolled into view if needed
                // el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                el.classList.remove('playing');
            }
        });
    },

    highlightPlaying(index) {
        document.querySelectorAll('.song-item').forEach(el => el.classList.remove('playing'));
        const items = document.querySelectorAll('.song-item');
        if (items[index]) items[index].classList.add('playing');
    },

    updateProgress(currentTime, duration) {
        this.timeCurrent.textContent = this.formatTime(currentTime);
        this.timeTotal.textContent = this.formatTime(duration || 0);
        if (duration) {
            const percent = (currentTime / duration) * 100;
            this.progressFill.style.width = `${percent}%`;
            this.progressHandle.style.left = `calc(${percent}% - 5px)`;
        }
    },

    updatePlayState(isPlaying) {
        this.playBtn.innerHTML = isPlaying ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>';
        if (isPlaying) this.cdWrapper.classList.add('playing');
        else this.cdWrapper.classList.remove('playing');
    },

    updatePlayerInfo(track) {
        this.playerTitle.textContent = track.title;
        this.playerArtist.textContent = track.artist;
        const cover = track.cover || 'https://placehold.co/60x60?text=Music';
        this.playerCover.src = cover;
        document.getElementById('overlay-cover').src = cover;
    },

    setLyrics(lyrics) {
        this.lyricsPanel.innerHTML = '';
        if (!lyrics || lyrics.length === 0) { this.lyricsPanel.innerHTML = '<div class="lrc-p">暂无歌词</div>'; return; }
        lyrics.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'lrc-p'; div.textContent = line.text; div.dataset.index = i;
            div.onclick = () => player.seek(line.time);
            this.lyricsPanel.appendChild(div);
        });
    },

    highlightLyric(index) {
        const active = this.lyricsPanel.querySelector('.active');
        if (active) active.classList.remove('active');
        const next = this.lyricsPanel.querySelector(`.lrc-p[data-index="${index}"]`);
        if (next) {
            next.classList.add('active');
            next.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    formatTime(s) {
        if (!s || isNaN(s)) return '00:00';
        const m = Math.floor(s / 60); const sec = Math.floor(s % 60);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    },

    markSongUnplayable(id) {
        const item = this.songListContainer.querySelector(`.song-item[data-id="${id}"]`);
        if (item) item.classList.add('unplayable');
    }
};
