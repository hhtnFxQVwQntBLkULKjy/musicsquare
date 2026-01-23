# MusicSquare 云服务器部署指南 (Java + Nginx + PM2)

如果您不想使用 Cloudflare Workers，想在自己的云服务器上托管完整的 MusicSquare，请参考本指南。

## 1. 环境准备

在服务器上执行以下命令安装必要软件：

```bash
# 更新系统
sudo apt update

# 1. 安装 JDK 17 (后端运行环境)
sudo apt install -y openjdk-17-jdk

# 2. 安装 MySQL (数据库)
sudo apt install -y mysql-server

# 3. 安装 Nginx (前端服务器)
sudo apt install -y nginx

# 4. 安装 Node.js 和 PM2 (进程管理)
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
```

## 2. 数据库配置

1.  **启动并登录 MySQL**:
    ```bash
    sudo service mysql start
    sudo mysql -u root
    ```
2.  **执行初始化脚本**:
    在 MySQL 中执行 `backend/mysql_schema.sql` 的内容，或导入文件：
    ```sql
    CREATE DATABASE IF NOT EXISTS musicsquare DEFAULT CHARACTER SET utf8mb4;
    USE musicsquare;
    -- 此处粘贴 mysql_schema.sql 的内容执行
    ```

## 3. 后端打包与 PM2 管理

1.  **修改配置**: 在本地修改 `java-backend/src/main/resources/application.yml` 中的 MySQL 账号密码。
2.  **打包**: 在本地执行 `mvn clean package` 得到 `target/music-backend-1.0.0.jar` 并上传。
3.  **使用 PM2 启动**:
    ```bash
    # 使用 PM2 启动 Java 程序并命名为 music-api
    pm2 start "java -jar music-backend-1.0.0.jar" --name music-api
    
    # 查看状态
    pm2 list
    ```

## 4. 前端 Nginx 部署与 PM2 管理

1.  **准备前端代码**:
    - 在 `js/service.js` 中，将 `BACKEND_TYPE` 修改为 `'java'` (默认为 `'cloudflare'`)。
    - 将 `API_BASE` 修改为 `'http://您的服务器IP:8080/api'`。
2.  **配置 Nginx**:
    编辑 `/etc/nginx/sites-available/default`:
    ```nginx
    server {
        listen 80;
        server_name localhost;

        location / {
            root /var/www/musicsquare; # 您前端代码存放的路径
            index index.html;
            try_files $uri $uri/ /index.html;
        }

        # 如果需要代理 API，可以在这里配置，也可以让前端直连 8080
    }
    ```
3.  **上传前端文件**: 将项目根目录下的所有文件（除 `java-backend` 外）上传到 `/var/www/musicsquare`。
4.  **重启并管理**:
    ```bash
    sudo nginx -t
    sudo systemctl restart nginx
    
    # 也可以用 PM2 守护 Nginx (可选)
    pm2 start nginx --name music-web
    
    # 保存 PM2 列表，确保服务器重启后自动启动
    pm2 save
    pm2 startup
    ```

## 5. 总结

- **端口检查**: 确保服务器安全组开放了 `80` (前端) 和 `8080` (后端) 端口。
- **默认配置**: 项目默认 `service.js` 使用 **Cloudflare** 后端。部署到云服务器后，请务必根据第 4 步手动修改前端配置。
- **管理命令**:
    - `pm2 logs`: 查看实时日志
    - `pm2 restart all`: 重启所有服务
    - `pm2 stop music-api`: 停止后端

---
> [!NOTE]
> 关于域名和备案：如果您有已备案域名，只需在 Nginx 中将 `server_name` 修改为域名并在前端填入域名地址即可。国内服务器使用 IP 访问通常不受限。
