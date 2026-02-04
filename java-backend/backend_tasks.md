### Batch & Sync Implementation (Java)

1.  **PlaylistController.java**:
    -   Add `POST /playlists/sync` for `service.js::syncExistingPlaylist`.
    -   Add `POST /sync/import` (or `/playlists/import`) for `service.js::importPlaylists`.
    -   Add `POST /playlists/batch-songs` for `service.js::addBatchSongsToPlaylist`.
    -   Add `DELETE /playlists/{id}/songs/batch` for `service.js::removeBatchSongsFromPlaylist`.

2.  **FavoriteController.java**:
    -   Add `POST /favorites/batch` for `service.js::addBatchFavorites`.
    -   Add `DELETE /favorites/batch` for `service.js::removeBatchFavorites`.

3.  **SyncController.java**:
    -   Check if it already covers some of this.

4.  **Service Layer**:
    -   Update `PlaylistService.java` and `FavoriteService.java` to support these batch operations.
