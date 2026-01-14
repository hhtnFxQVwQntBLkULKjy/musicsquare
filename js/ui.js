const UI = {
    init() {
        this.songListContainer = document.querySelector('.song-list-container');
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
    },

    initSidebarResizer() {
        const resizer = document.getElementById('sidebar-resizer');
        const sidebar = document.querySelector('.sidebar');
        const playerBar = document.getElementById('player-bar');
        const overlay = document.getElementById('player-overlay');
        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        });

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

        // Load saved width
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
        this.progressTrack.addEventListener('mousedown', (e) => {
            isDragging = true;
            const ratio = updateDrag(e);
            if (player.audio.duration) player.audio.currentTime = ratio * player.audio.duration;
        });
        document.addEventListener('mousemove', (e) => { if (isDragging) updateDrag(e); });
        document.addEventListener('mouseup', (e) => {
            if (isDragging) {
                isDragging = false;
                const ratio = updateDrag(e);
                if (player.audio.duration) player.seek(ratio * player.audio.duration);
            }
        });

        const toggleOverlay = () => {
            if (this.overlay.classList.contains('active')) this.overlay.classList.remove('active');
            else this.overlay.classList.add('active');
        };
        document.getElementById('cover-wrapper').addEventListener('click', toggleOverlay);
        document.getElementById('player-info-area').addEventListener('click', toggleOverlay);
        document.getElementById('overlay-close').addEventListener('click', toggleOverlay);
        document.getElementById('overlay-cover').addEventListener('click', toggleOverlay);
        
        if (this.downloadBtn) {
            this.downloadBtn.onclick = () => {
                if (player.currentTrack) {
                    this.handleDownload(player.currentTrack);
                } else {
                    this.showDialog({ title: '提示', content: '暂无播放歌曲', showCancel: false });
                }
            };
        }
    },

    // --- Toast & Modal ---
    showToast(msg, type = 'success') {
        const container = document.querySelector('.toast-container') || this.createToastContainer();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        // Force high z-index and visibility
        toast.style.zIndex = '9999'; 
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${msg}</span>`;
        container.appendChild(toast);
        
        // Ensure animation plays
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateY(0)';
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-20px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    createToastContainer() {
        const div = document.createElement('div');
        div.className = 'toast-container';
        // Ensure container is above everything
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

    // --- Dialog System ---
    bindDialogEvents() {
        const hide = () => this.uniDialog.classList.remove('show');
        this.dialogClose.onclick = hide;
        this.dialogCancel.onclick = hide;
        this.uniDialog.onclick = (e) => { if (e.target === this.uniDialog) hide(); };
    },

    showDialog({ title, content, onConfirm, showCancel = true }) {
        this.dialogTitle.textContent = title;
        this.dialogContent.innerHTML = '';
        if (typeof content === 'string') {
            this.dialogContent.textContent = content;
        } else {
            this.dialogContent.appendChild(content);
        }
        this.dialogCancel.style.display = showCancel ? 'block' : 'none';
        
        // Always reset confirm button visibility
        if (onConfirm) {
            this.dialogConfirm.style.display = 'block';
            this.dialogConfirm.onclick = () => {
                if (onConfirm) onConfirm();
                this.uniDialog.classList.remove('show');
            };
        } else {
            this.dialogConfirm.style.display = 'none';
        }
        
        this.uniDialog.classList.add('show');
    },

    showInput({ title, placeholder, onConfirm }) {
        const input = document.createElement('input');
        input.style.width = '100%';
        input.style.padding = '12px';
        input.style.borderRadius = '8px';
        input.style.border = '1px solid #ddd';
        input.placeholder = placeholder;
        this.showDialog({
            title,
            content: input,
            onConfirm: () => onConfirm(input.value.trim())
        });
        setTimeout(() => input.focus(), 100);
    },

    async showPlaylistSelect(song) {
        // Force refresh playlists from DataService
        await DataService.fetchPlaylists();
        const pls = DataService.playlists; // Show ALL playlists

        if (pls.length === 0) {
            this.showDialog({
                title: '添加到歌单',
                content: '您还没有创建自建歌单，请先去侧边栏新建。',
                showCancel: false
            });
            return;
        }

        const list = document.createElement('div');
        list.className = 'pl-select-list';
        pls.forEach(pl => {
            const item = document.createElement('div');
            item.className = 'pl-select-item';
            const count = pl.tracks ? pl.tracks.length : 0;
            item.innerHTML = `
                <div style="display:flex;align-items:center;gap:10px;flex:1;">
                    <i class="fas fa-list-ul"></i> 
                    <span>${pl.name}</span>
                </div>
                <span style="font-size:12px;color:#999;">${count}首</span>
            `;
            // BIND CLICK EVENT DIRECTLY TO ITEM
            item.addEventListener('click', async (e) => {
                e.preventDefault(); 
                e.stopPropagation(); // Stop propagation
                
                // 1. Show loading state if needed, or just optimistic update
                // Close Dialog FIRST
                this.uniDialog.classList.remove('show');
                
                // Show immediate feedback
                this.showToast('正在添加到歌单...', 'success');

                try {
                    // 2. Call Service
                    const success = await DataService.addSongToPlaylist(pl.id, song);
                    
                    if (success) {
                        this.showToast(`已成功添加到: ${pl.name}`, 'success');
                        // 3. Dispatch Global Event
                        const event = new CustomEvent('playlist-updated', { detail: { id: pl.id } });
                        document.dispatchEvent(event);
                    } else {
                         // Fallback if success is false but no error thrown (e.g. optimistic revert)
                         this.showToast('添加失败：可能歌曲已存在', 'error');
                    }
                } catch (err) {
                    console.error('Add to playlist UI error:', err);
                    let msg = err.message || '未知错误';
                    if (msg.includes('exists')) msg = '歌曲已存在于该歌单';
                    this.showToast(`添加失败：${msg}`, 'error');
                }
            });
            list.appendChild(item);
        });

        this.showDialog({
            title: '添加到歌单',
            content: list,
            showCancel: true 
        });
        this.dialogConfirm.style.display = 'none';
    },

    // --- List Rendering ---
    showLoading() {
        this.songListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-spinner fa-spin"></i>
                <p>正在加载...</p>
            </div>
        `;
    },

    renderEmptyState(msg = '搜索你想听的歌曲') {
        this.songListContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-music"></i>
                <p>${msg}</p>
            </div>
        `;
    },

    renderSongList(songs, currentPage, totalPages, onPageChange, isLocal = false) {
        this.songListContainer.innerHTML = '';
        if (songs.length === 0) {
            this.renderEmptyState('没有找到相关歌曲');
            return;
        }
        const header = document.createElement('div');
        header.className = 'list-header';
        header.innerHTML = `<div>#</div><div>标题</div><div>歌手</div><div>专辑</div><div>时长</div><div style="text-align: right">操作</div>`;
        this.songListContainer.appendChild(header);

        songs.forEach((song, index) => {
            const div = document.createElement('div');
            div.className = 'song-item';
            const favs = JSON.parse(localStorage.getItem('favorites') || '[]');
            const isFav = favs.some(f => f.id === song.id);
            const favClass = isFav ? 'fas fa-heart active' : 'far fa-heart';
            div.innerHTML = `
                <div class="col-index">${(currentPage - 1) * 20 + index + 1}</div>
                <div class="col-title">${song.title} <span style="font-size:10px;color:#ccc;border:1px solid #eee;padding:0 2px;border-radius:2px;margin-left:5px;">${this.getSourceName(song.source)}</span></div>
                <div class="col-artist">${song.artist}</div>
                <div class="col-album">${song.album || '-'}</div>
                <div class="col-duration">${this.formatTime(song.duration)}</div>
                <div class="col-actions">
                    <button class="btn-action fav ${isFav ? 'active' : ''}" title="收藏"><i class="${favClass}"></i></button>
                    <button class="btn-action download-btn" title="下载"><i class="fas fa-download"></i></button>
                    <button class="btn-action more-btn" title="更多"><i class="fas fa-ellipsis-h"></i></button>
                    <button class="btn-action del-song-btn" title="从歌单删除" style="color:#ff5252; display: ${isLocal ? 'flex' : 'none'}"><i class="fas fa-trash"></i></button>
                </div>
            `;
            
            // ... (events)
            
            div.querySelector('.more-btn').onclick = (e) => {
                e.stopPropagation();
                this.showSongContextMenu(e.clientX, e.clientY, song);
            };

            const delBtn = div.querySelector('.del-song-btn');
            if (delBtn) {
                 // Use addEventListener to avoid overwriting or propagation issues
                 delBtn.addEventListener('click', (e) => {
                     e.stopPropagation();
                     
                     // We need to find the CURRENT playlist ID more reliably
                     // 1. Check if we are in 'playlist' view
                     const currentView = document.querySelector('.nav-item.active');
                     if (!currentView || !currentView.classList.contains('pl-nav-item')) {
                         console.error('Cannot delete: Not in a playlist view');
                         return;
                     }
                     
                     const plName = currentView.querySelector('span').textContent;
                     // Find playlist by name AND ID (if possible, but name is what we have in DOM)
                     // A better way is to store data-id on the nav item. 
                     // Let's rely on DataService.playlists finding it.
                     const pl = DataService.playlists.find(p => p.name === plName);
                     
                     if (pl) {
                         this.showDialog({
                             title: '删除歌曲',
                             content: `确定从歌单 "${pl.name}" 中删除 "${song.title}" 吗？`,
                             onConfirm: async () => {
                                 await DataService.removeSongFromPlaylist(pl.id, song.uid || song.id);
                                 // Refresh
                                 const event = new CustomEvent('playlist-updated', { detail: { id: pl.id } });
                                 document.dispatchEvent(event);
                                 this.showToast('已删除');
                             }
                         });
                     } else {
                         console.error('Playlist not found in cache');
                     }
                 });
            }
            div.querySelector('.download-btn').onclick = (e) => {
                e.stopPropagation();
                this.handleDownload(song);
            };
            const favBtn = div.querySelector('.fav');
            favBtn.onclick = (e) => {
                e.stopPropagation();
                this.toggleFavorite(song, favBtn);
            };
            this.songListContainer.appendChild(div);
        });
        if (!isLocal) this.renderPagination(currentPage, totalPages, onPageChange);
    },

    toggleFavorite(song, btnEl) {
        if (DataService.isFavorite(song)) {
            DataService.removeFavorite(song.uid);
            btnEl.classList.remove('active');
            btnEl.querySelector('i').className = 'far fa-heart';
        } else {
            DataService.addFavorite(song);
            btnEl.classList.add('active');
            btnEl.querySelector('i').className = 'fas fa-heart';
        }
    },

    getSourceName(source) {
        const map = { 'netease': '网易', 'qq': 'QQ', 'kuwo': '酷我', 'migu': '咪咕' };
        return map[source] || source;
    },

    renderPagination(current, total, onPageChange) {
        const div = document.createElement('div');
        div.className = 'pagination';
        const createBtn = (num, isActive = false) => {
            const btn = document.createElement('div');
            btn.className = `page-num ${isActive ? 'active' : ''}`;
            btn.textContent = num;
            btn.onclick = () => onPageChange(num);
            return btn;
        };
        const createDots = () => {
            const span = document.createElement('div');
            span.className = 'page-num dots';
            span.textContent = '...';
            return span;
        };
        div.appendChild(createBtn(1, current === 1));
        let start = Math.max(2, current - 2);
        let end = Math.min(total - 1, current + 2);
        if (start > 2) div.appendChild(createDots());
        for (let i = start; i <= end; i++) div.appendChild(createBtn(i, current === i));
        if (end < total - 1) div.appendChild(createDots());
        if (total > 1) div.appendChild(createBtn(total, current === total));
        this.songListContainer.appendChild(div);
    },

    showSongContextMenu(x, y, song) {
        const menu = document.getElementById('song-ctx-menu');
        const w = window.innerWidth, h = window.innerHeight;
        if (x + 160 > w) x = w - 170;
        if (y + 100 > h) y = h - 110;
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';

        const playNext = document.getElementById('ctx-play-next');
        const addPl = document.getElementById('ctx-add-pl');
        const download = document.getElementById('ctx-download'); // New
        
        const newPlayNext = playNext.cloneNode(true);
        const newAddPl = addPl.cloneNode(true);
        const newDownload = download ? download.cloneNode(true) : null; // Handle if exists or create dynamically if not in HTML

        playNext.parentNode.replaceChild(newPlayNext, playNext);
        addPl.parentNode.replaceChild(newAddPl, addPl);
        
        if (download && newDownload) {
             download.parentNode.replaceChild(newDownload, download);
             newDownload.onclick = () => {
                 menu.style.display = 'none';
                 this.handleDownload(song);
             };
        }

        newPlayNext.onclick = () => {
            player.playlist.splice(player.currentIndex + 1, 0, song);
            menu.style.display = 'none';
        };
        newAddPl.onclick = () => {
            menu.style.display = 'none';
            this.showPlaylistSelect(song);
        };
    },

    handleDownload(song) {
        if (!song.url) {
            this.showDialog({ title: '提示', content: '未加载完成，请点击该歌曲播放后再点击下载', showCancel: false });
            return;
        }
        window.open(song.url, '_blank');
    },

    showPlaylistContextMenu(x, y, pl, onDelete, onRename) {
        const menu = document.getElementById('pl-ctx-menu');
        menu.style.left = `${x}px`;
        menu.style.top = `${y}px`;
        menu.style.display = 'block';
        const ren = document.getElementById('ctx-rename-pl'), del = document.getElementById('ctx-delete-pl');
        const newRen = ren.cloneNode(true), newDel = del.cloneNode(true);
        ren.parentNode.replaceChild(newRen, ren);
        del.parentNode.replaceChild(newDel, del);
        newRen.onclick = () => {
            menu.style.display = 'none';
            this.showInput({ title: '重命名歌单', placeholder: '新歌单名称', onConfirm: (name) => { if (name) onRename(pl.id, name); } });
        };
        newDel.onclick = () => {
            menu.style.display = 'none';
            this.showDialog({ title: '删除确认', content: `确定要删除歌单 "${pl.name}" 吗？`, onConfirm: () => onDelete(pl.id) });
        };
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
        if (!lyrics || lyrics.length === 0) {
            this.lyricsPanel.innerHTML = '<div class="lrc-p">暂无歌词</div>';
            return;
        }
        lyrics.forEach((line, i) => {
            const div = document.createElement('div');
            div.className = 'lrc-p';
            div.textContent = line.text;
            div.dataset.index = i;
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
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    }
};
