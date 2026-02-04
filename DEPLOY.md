# MusicSquare 部署手记

> [!CAUTION]
> **请务必修改配置**
> 
> 本项目默认指向演示用的后端。部署时，**必须**将 `js/service.js` 中的 API 地址修改为您自己的地址（无论是 Cloudflare Worker 还是 Java 后端），否则无法正常使用。

本文档指导您如何在自己的环境中部署 MusicSquare 的后端和前端。

## 1. 部署方式选择

您可以选择以下两种方式之一来提供后端服务：

1.  **Cloudflare Worker (推荐，轻量级)**: 不需要服务器，使用 Cloudflare 免费额度，适合个人使用。
2.  **Java 后端 (Spring Boot)**: 需要一台云服务器 (VPS)，功能最完整，支持 MySQL 数据库存储用户数据。

---

## 2. 前端配置修改 (必须执行)

无论您选择哪种后端部署方式，您都 **必须** 修改前端代码中的配置文件。

1.  打开项目文件: `js/service.js`
2.  找到文件顶部的配置区域：

    ```javascript
    // API 基础路径
    // Cloudflare Worker 后端地址
    const API_BASE = '你的Cloudflare Worker 后端地址'; 
    ```

3.  **如果您使用 Cloudflare Worker**:
    -   请将 `'https://yunduanyingyue.tmichi1001.workers.dev/api'` 替换为您自己部署的 Worker 地址。

4.  **如果您使用 Java 后端**:
    -   请将 `API_BASE` 修改为您服务器的公网 IP 或域名 (例如 `'http://123.45.67.89:3459/api'`)。

---

## 3. Java 后端部署指南 (适用于云服务器)

如果您拥有一台云服务器 (Linux)，请按照以下步骤部署 Java 后端。

### 3.1 环境准备 (Ubuntu/Debian 示例)

在服务器上执行以下命令安装必要软件：

```bash
# 更新系统软件源
sudo apt update && sudo apt upgrade -y

# 1. 安装 JDK 17 (后端运行环境)
sudo apt install -y openjdk-17-jdk
# 验证安装
java -version

# 2. 安装 Maven (用于编译打包，也可以在本地打包后只上传 jar)
sudo apt install -y maven

# 3. 安装 MySQL 8.0+ (数据库)
sudo apt install -y mysql-server
# 启动 MySQL
sudo systemctl start mysql
sudo systemctl enable mysql

# 4. 安装 Nginx (Web 服务器)
sudo apt install -y nginx

```

### 3.2 数据库初始化

1.  **设置 MySQL root 密码**:
    ```bash
    sudo mysql_secure_installation
    # 按照提示设置密码，建议选择强密码
    ```

2.  **创建数据库和用户**:
    登录 MySQL: `sudo mysql -u root -p`
    
    ```sql
    -- 创建数据库
    CREATE DATABASE IF NOT EXISTS musicsquare DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    
    -- (可选) 创建单独的用户并授权，比直接用 root 更安全
    CREATE USER 'music_user'@'localhost' IDENTIFIED BY '您的强密码';
    GRANT ALL PRIVILEGES ON musicsquare.* TO 'music_user'@'localhost';
    FLUSH PRIVILEGES;
    
    USE musicsquare;
    -- 在此执行 backend/mysql_schema.sql 中的 SQL 建表语句
    ```

### 3.3 Java 后端配置与打包

1.  **修改配置**: 
    在本地项目 `java-backend/src/main/resources/application.yml` 中：
    -   修改 `spring.datasource.password` 为您在 3.2 步设置的密码。
    -   如果使用了单独用户，也要修改 `username`。

2.  **编译打包**:
    在 `java-backend` 目录下执行：
    ```bash
    mvn clean package -DskipTests
    ```
    成功后会在 `target/` 目录下生成 `music-backend-1.0.0.jar`。

3.  **上传**:
    使用 SCP 或 SFTP 将 jar 包上传到服务器，例如 `/opt/musicsquare/app.jar`。

### 3.4 使用 Systemd 管理 Java 进程 (推荐)

不要只使用 `java -jar` 直接运行，容易断开。建议创建系统服务。

1.  创建服务文件: `sudo nano /etc/systemd/system/musicsquare.service`
2.  写入以下内容 (注意修改路径和用户):

    ```ini
    [Unit]
    Description=MusicSquare Backend Service
    After=syslog.target network.target mysql.service

    [Service]
    User=root
    # 您的 jar 包路径
    ExecStart=/usr/bin/java -jar /opt/musicsquare/app.jar
    SuccessExitStatus=143
    Restart=always
    RestartSec=5

    [Install]
    WantedBy=multi-user.target
    ```

3.  启动服务:
    ```bash
    sudo systemctl daemon-reload
    sudo systemctl start musicsquare
    sudo systemctl enable musicsquare
    # 查看状态
    sudo systemctl status musicsquare
    ```

### 3.5 部署前端并配置 Nginx

1.  **上传前端代码**:
    将本项目根目录下的所有 HTML/CSS/JS 文件上传到服务器 `/var/www/musicsquare/`。

2.  **配置 Nginx**:
    编辑 `/etc/nginx/sites-available/default`:
    ```nginx
    server {
        listen 80;
        server_name your-domain.com; # 您的域名或 IP

        # 前端静态文件
        location / {
            root /var/www/musicsquare;
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # 后端 API 代理 (可选，如果前端 API_BASE 填写的 ip:3459 则不需要此块，建议使用 Nginx 反代)
        location /api/ {
            proxy_pass http://127.0.0.1:3459/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }
    }
    ```
    
3.  **重启 Nginx**:
    ```bash
    sudo nginx -t
    sudo systemctl restart nginx
    ```

## 4. Cloudflare Worker 部署指南

如果您选择 Cloudflare Worker 作为后端：

1.  请访问 GitHub 上的 `Cloudflare Worker` 相关项目 (例如 `netease-cloud-music-api` 的 worker 版本)，或者使用本项目提供的 `worker` 目录下的代码（如果有）。
2.  部署到您的 Cloudflare 账号。
3.  获取您的 Worker 域名，填入前端 `js/service.js` 的配置中。

---
> [!NOTE]
> 如果您遇到问题，请检查浏览器的控制台 (F12) -> Network 面板，查看 API 请求的 URL 是否正确指向了您的后端地址，而不是默认的演示地址。

