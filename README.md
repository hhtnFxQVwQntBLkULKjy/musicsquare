# 云端音乐 | MusicSquare

<p align="center">
  <img src="https://img.shields.io/badge/版本-2.0-blue" alt="Version">
  <img src="https://img.shields.io/badge/平台-Web-green" alt="Platform">
  <img src="https://img.shields.io/badge/许可证-MIT-orange" alt="License">
</p>

一款功能强大的在线音乐播放器，支持多平台音源聚合搜索与播放。

## 🌐 在线体验

👉 **[点击这里体验云端音乐](https://7tangdagui.github.io/musicsquare/)**

## 📸 界面预览

### 搜索页面
![搜索页面](docs/screenshot_search.png)

### 热门歌曲 - 网易云
![热门歌曲-网易云](docs/screenshot_hot_netease.png)

### 热门歌曲 - QQ音乐
![热门歌曲-QQ音乐](docs/screenshot_hot_qq.png)

### 热门歌曲 - 酷我音乐
![热门歌曲-酷我音乐](docs/screenshot_hot_kuwo.png)

### 播放历史
![播放历史](docs/screenshot_history.png)

### 我的收藏（批量操作）
![我的收藏](docs/screenshot_favorites.png)

## ✨ 功能特色

### 🎵 多平台音源
- **聚合搜索**：一键搜索网易云音乐、QQ音乐、酷我音乐
- **智能匹配**：多源搜索自动去重，交替显示结果
- **音质优选**：自动降级选择最佳音质（Hi-Res → 无损 → 320K → 128K）

### 🎧 完整播放体验
- **歌词同步**：实时滚动歌词显示
- **封面展示**：高清专辑封面
- **播放模式**：顺序播放、单曲循环、随机播放
- **播放控制**：上一首、下一首、进度拖拽
- **音量控制**：音量调节与静音

### 📂 个人音乐库
- **用户系统**：注册登录，数据云端同步
- **我的收藏**：一键收藏喜欢的歌曲
- **自建歌单**：创建、编辑、删除个人歌单
- **播放历史**：自动记录播放历史

### 🔄 歌单同步
- **平台导入**：支持导入网易云、QQ音乐、酷我歌单
- **增量更新**：智能识别新增歌曲

### 🎨 界面设计
- **暗色模式**：支持明/暗主题切换
- **响应式布局**：适配桌面端与移动端
- **流畅动画**：精心设计的交互动画
- **批量操作**：多选模式批量添加收藏/歌单

### ⬇️ 其他功能
- **歌曲下载**：支持下载歌曲到本地
- **无限滚动**：歌曲列表无限加载
- **热门歌曲**：各平台热门榜单

## 🛠️ 技术栈

| 类型 | 技术 |
|------|------|
| **前端** | HTML5, CSS3, Vanilla JavaScript |
| **UI** | Flexbox, Grid, FontAwesome 图标 |
| **后端** | Cloudflare Workers |
| **数据库** | Cloudflare D1 (SQLite) |
| **音乐API** | [TuneHub API](https://api.tunefree.fun/) |
| **API代理** | 多重跨域代理，确保音频稳定加载 |
| **部署** | GitHub Pages + Cloudflare Workers |

## 🚀 快速开始

### 前端部署 (GitHub Pages)

1. Fork 本项目
2. 在仓库设置中启用 GitHub Pages
3. 选择 `main` 分支作为源
4. 访问 `https://[用户名].github.io/musicsquare`

### 后端部署 (Cloudflare Workers)

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 创建新的 Worker
3. 复制 `backend/worker.js` 内容到编辑器
4. 创建 D1 数据库并绑定
5. 运行 `backend/schema.sql` 初始化数据库表
6. 部署 Worker

### 本地开发

```bash
# 克隆项目
git clone https://github.com/7TangDaGui/musicsquare.git

# 直接用浏览器打开
open home.html
```

## 📁 项目结构

```
musicsquare/
├── home.html          # 主页面
├── index.html         # 登录页
├── js/
│   ├── api.js         # API 接口封装
│   ├── app.js         # 应用主逻辑
│   ├── player.js      # 播放器控制
│   ├── ui.js          # 界面渲染
│   └── service.js     # 数据服务
├── css/               # 样式文件
└── backend/
    ├── worker.js      # Cloudflare Worker
    └── schema.sql     # 数据库结构
```

## 📝 更新日志

### v2.0 (2026-01-20)
- ✅ 多平台音源聚合（网易云、QQ、酷我）
- ✅ 自动音质降级
- ✅ 歌单同步导入
- ✅ 响应式设计
- ✅ Cloudflare 边缘缓存加速

## 📄 许可证

本项目采用 [MIT License](LICENSE) 开源许可证。

## 🙏 致谢

- [TuneHub API](https://api.tunefree.fun/) - 音乐数据接口
- [FontAwesome](https://fontawesome.com/) - 图标库
- [Cloudflare](https://cloudflare.com/) - 边缘计算平台
- [GitHub Pages](https://pages.github.com/) - 静态网站托管

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/7TangDaGui">7TangDaGui</a>
</p>