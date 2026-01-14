# 前端修复与启动计划

既然后端已成功部署，我们将专注于修复前端遗留的 UI 问题并启动项目。

## 1. 修复歌词显示问题
**问题描述**：热门歌曲和收藏列表播放时，歌词不显示。搜索和历史记录正常。
**原因分析**：
*   **搜索/历史**：数据中通常直接包含 `lrc` 字段（来自 API 响应）。
*   **热门/收藏**：
    *   **收藏**：从数据库读取，可能在存入数据库时未正确保存 `lrc` 字段，或者字段名不匹配。
    *   **热门**：直接调用搜索 API，理应有歌词。
    *   **通用问题**：`js/api.js` 中的 `getSongDetails` 方法负责补全歌词。可能在点击播放（`player.setPlaylist`）时，没有触发详情获取，或者获取后未更新 UI。
    *   **关键点**：`js/ui.js` 中的 `renderSongList` 绑定点击事件时，直接使用了列表中的 `song` 对象。如果该对象缺少 `lrc`，播放器就不会显示。我们需要确保在播放前或播放时获取完整详情。

**解决方案**：
*   修改 `js/player.js` 或 `js/ui.js`，在播放歌曲时，如果 `lrc` 为空，强制调用 `MusicAPI.getSongDetails` 补全信息。

## 2. 更新 API 地址
*   修改 `js/service.js`，将 `API_BASE` 指向您提供的生产环境地址：`https://yunduanyingyue.tmichi1001.workers.dev/api`。

## 3. 启动服务
*   重启本地开发服务器，确保最新代码生效。

## 执行步骤
1.  **Update `js/service.js`**: 替换 API URL。
2.  **Fix `js/player.js`**: 在 `play` 方法中增加“检查并获取详情”的逻辑，确保歌词加载。
3.  **Restart Server**: 启动 8103 端口。
