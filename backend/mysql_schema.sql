-- Database Initialization for MusicSquare Java Backend

CREATE DATABASE IF NOT EXISTS musicsquare DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE musicsquare;

-- 1. Users table
CREATE TABLE IF NOT EXISTS users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    avatar VARCHAR(255),
    created_at BIGINT
) ENGINE=InnoDB;

-- 2. Connected accounts
CREATE TABLE IF NOT EXISTS connected_accounts (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    platform VARCHAR(20) NOT NULL, -- 'netease', 'qq', 'migu', 'kuwo'
    external_user_id VARCHAR(50),
    last_synced_at BIGINT,
    CONSTRAINT fk_ca_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 3. Playlists
CREATE TABLE IF NOT EXISTS playlists (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    name VARCHAR(100) NOT NULL,
    is_sync TINYINT(1) DEFAULT 0, -- 0: Local, 1: Synced
    platform VARCHAR(20) DEFAULT 'local',
    external_id VARCHAR(50), -- Original Playlist ID from platform
    can_delete TINYINT(1) DEFAULT 1, -- 0: Cannot delete manually (for synced)
    created_at BIGINT,
    CONSTRAINT fk_pl_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. Playlist songs
CREATE TABLE IF NOT EXISTS playlist_songs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    playlist_id BIGINT NOT NULL,
    song_json TEXT NOT NULL,
    is_local_add TINYINT(1) DEFAULT 0, -- 0: Imported/Synced, 1: Manually Added
    created_at BIGINT,
    CONSTRAINT fk_ps_playlist FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 5. Favorites
CREATE TABLE IF NOT EXISTS favorites (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    song_json TEXT NOT NULL,
    created_at BIGINT,
    CONSTRAINT fk_fav_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- 6. Play history
CREATE TABLE IF NOT EXISTS play_history (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    song_json TEXT NOT NULL,
    played_at BIGINT,
    CONSTRAINT fk_hist_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;
