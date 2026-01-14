DROP TABLE IF EXISTS users;
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    avatar TEXT,
    created_at INTEGER
);

DROP TABLE IF EXISTS connected_accounts;
CREATE TABLE connected_accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    platform TEXT NOT NULL, -- 'netease', 'qq', 'migu', 'kuwo'
    external_user_id TEXT,
    last_synced_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS playlists;
CREATE TABLE playlists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_sync INTEGER DEFAULT 0, -- 0: Local, 1: Synced
    platform TEXT DEFAULT 'local',
    external_id TEXT, -- Original Playlist ID from platform
    can_delete INTEGER DEFAULT 1, -- 0: Cannot delete manually (for synced)
    created_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS playlist_songs;
CREATE TABLE playlist_songs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id INTEGER NOT NULL,
    song_json TEXT NOT NULL,
    is_local_add INTEGER DEFAULT 0, -- 0: Imported/Synced, 1: Manually Added
    created_at INTEGER,
    FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS favorites;
CREATE TABLE favorites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    song_json TEXT NOT NULL,
    created_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);

DROP TABLE IF EXISTS play_history;
CREATE TABLE play_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    song_json TEXT NOT NULL,
    played_at INTEGER,
    FOREIGN KEY(user_id) REFERENCES users(id)
);
