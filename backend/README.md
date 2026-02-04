# Cloudflare Worker Backend for Pikachu Music

This backend handles user authentication, playlists, and favorites using Cloudflare Workers and D1 Database.

## Prerequisites

1.  Cloudflare Account
2.  Node.js & npm installed
3.  Wrangler CLI (`npm install -g wrangler`)

## Setup Instructions

1.  **Login to Cloudflare**
    ```bash
    wrangler login
    ```

2.  **Create D1 Database**
    (You've already created `musicsguare_db`, but for reference:)
    ```bash
    wrangler d1 create musicsguare_db
    ```
    *Note the `database_id` from the output.*

3.  **Configure `wrangler.toml`**
    Create a `wrangler.toml` file in this directory:

    ```toml
    name = "yunduanyingyue"
    main = "worker.js"
    compatibility_date = "2024-01-01"

    [[d1_databases]]
    binding = "DB" # Matches env.DB in worker.js
    database_name = "musicsguare_db"
    database_id = "<YOUR_DATABASE_ID>" # Replace this!
    ```

4.  **Initialize Database Schema**
    Run the SQL schema to create tables:
    ```bash
    wrangler d1 execute musicsguare_db --local --file=schema.sql
    # For production:
    wrangler d1 execute musicsguare_db --file=schema.sql
    ```

5.  **Develop Locally**
    ```bash
    wrangler dev
    ```
    This will start a local server (usually `http://localhost:8787`).

6.  **Deploy to Production**
    ```bash
    wrangler deploy
    ```
    Your API will be available at `https://yunduanyingyue.<your-subdomain>.workers.dev`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `TUNEHUB_API_KEY` | Yes | API Key from [TuneHub](https://tunehub.sayqz.com/) for song parsing |

Configure in Cloudflare Dashboard: Worker Settings -> Variables -> Environment Variables

## API Endpoints

*   **Auth**
    *   `POST /api/auth/register` - { username, password }
    *   `POST /api/auth/login` - { username, password } -> Returns user object with ID
*   **Playlists**
    *   `GET /api/playlists` - Headers: `Authorization: Bearer <user_id>`
    *   `POST /api/playlists` - { name }
    *   `DELETE /api/playlists/:id`
    *   `PUT /api/playlists/:id` - { name }
    *   `POST /api/playlists/:id/songs` - { ...song_object }
    *   `DELETE /api/playlists/:id/songs` - { uid }
*   **Favorites**
    *   `GET /api/favorites`
    *   `POST /api/favorites` - { ...song_object }
    *   `DELETE /api/favorites` - { uid }
*   **TuneHub Proxy** (New)
    *   `POST /api/tunehub/parse` - { platform, ids, quality } -> Song URL & lyrics
    *   `GET /api/tunehub/methods/*` - Proxy to TuneHub methods API
    *   `POST /api/tunehub/request` - { url, method, headers, body, params } -> Generic request proxy
    *   `GET /api/allorigins?url=...` - Proxy via allorigins.win (for QQ Music)
