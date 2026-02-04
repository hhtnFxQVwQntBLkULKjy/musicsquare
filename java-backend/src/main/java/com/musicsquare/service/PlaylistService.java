package com.musicsquare.service;

import com.musicsquare.entity.Playlist;
import com.musicsquare.entity.PlaylistSong;
import com.musicsquare.repository.PlaylistRepository;
import com.musicsquare.repository.PlaylistSongRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
public class PlaylistService {

    @Autowired
    private PlaylistRepository playlistRepository;

    @Autowired
    private PlaylistSongRepository playlistSongRepository;

    public List<Playlist> getUserPlaylists(Long userId) {
        return playlistRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public List<PlaylistSong> getPlaylistSongs(Long playlistId) {
        return playlistSongRepository.findByPlaylistIdOrderByCreatedAtDesc(playlistId);
    }

    public Playlist createPlaylist(Long userId, String name) {
        Playlist pl = new Playlist();
        pl.setUserId(userId);
        pl.setName(name);
        pl.setCreatedAt(System.currentTimeMillis());
        pl.setIsSync(0);
        pl.setPlatform("local");
        pl.setCanDelete(1);
        return playlistRepository.save(pl);
    }

    @Transactional
    public void deletePlaylist(Long userId, Long playlistId) {
        Optional<Playlist> pl = playlistRepository.findById(playlistId);
        if (pl.isPresent() && pl.get().getUserId().equals(userId)) {
            playlistSongRepository.deleteByPlaylistId(playlistId);
            playlistRepository.deleteById(playlistId);
        }
    }

    public void renamePlaylist(Long userId, Long playlistId, String name) {
        Playlist pl = playlistRepository.findById(playlistId).orElseThrow();
        if (pl.getUserId().equals(userId)) {
            pl.setName(name);
            playlistRepository.save(pl);
        }
    }

    public PlaylistSong addSongToPlaylist(Long playlistId, String songJson, Integer isLocalAdd) {
        PlaylistSong ps = new PlaylistSong();
        ps.setPlaylistId(playlistId);
        ps.setSongJson(songJson);
        ps.setIsLocalAdd(isLocalAdd);
        ps.setCreatedAt(System.currentTimeMillis());
        return playlistSongRepository.save(ps);
    }

    @Transactional
    public void removeSongFromPlaylist(Long playlistId, Long songUid) {
        playlistSongRepository.deleteByPlaylistIdAndId(playlistId, songUid);
    }

    @Transactional
    public void removeBatchSongsFromPlaylist(Long playlistId, List<Long> uids) {
        for (Long uid : uids) {
            playlistSongRepository.deleteByPlaylistIdAndId(playlistId, uid);
        }
    }

    @Transactional
    public int addBatchSongsToPlaylist(Long playlistId, List<String> songJsons) {
        int count = 0;
        for (String json : songJsons) {
            PlaylistSong ps = new PlaylistSong();
            ps.setPlaylistId(playlistId);
            ps.setSongJson(json);
            ps.setIsLocalAdd(1);
            ps.setCreatedAt(System.currentTimeMillis());
            playlistSongRepository.save(ps);
            count++;
        }
        return count;
    }

    @Transactional
    public void syncPlaylist(Long userId, String platform, String externalId, String name, List<String> songJsons) {
        // Find existing playlist or create new
        Playlist pl = playlistRepository.findByUserIdAndPlatformAndExternalId(userId, platform, externalId)
                .orElseGet(() -> {
                    Playlist newPl = new Playlist();
                    newPl.setUserId(userId);
                    newPl.setName(name);
                    newPl.setPlatform(platform);
                    newPl.setExternalId(externalId);
                    newPl.setIsSync(1);
                    newPl.setCreatedAt(System.currentTimeMillis());
                    newPl.setCanDelete(1);
                    return playlistRepository.save(newPl);
                });

        // Update name if changed
        if (!pl.getName().equals(name)) {
            pl.setName(name);
            playlistRepository.save(pl);
        }

        // Incremental sync logic from service.js:
        // "This endpoint handles adding new songs AND removing deleted songs (while preserving manual adds)"
        // But for SIMPLICITY in Java backend initial version, and since service.js sends the FULL list of fresh songs:
        
        // Strategy:
        // 1. Get all existing songs for this playlist
        // 2. Identify manual adds (isLocalAdd=1) -> Keep them
        // 3. Identify sync songs (isLocalAdd=0) -> Replace them with new list?
        // Service.js says "Increment Sync", but it sends `songs: freshSongs` which is the FULL list from source.
        
        // Let's matching the "smart sync" logic might be complex. 
        // A simple approach for now: 
        // Delete all `isLocalAdd=0` (synced songs) and re-insert the new list.
        // This preserves `isLocalAdd=1` (manual additions).
        
        playlistSongRepository.deleteByPlaylistIdAndIsLocalAdd(pl.getId(), 0);

        // Insert new songs
        for (String json : songJsons) {
            PlaylistSong ps = new PlaylistSong();
            ps.setPlaylistId(pl.getId());
            ps.setSongJson(json);
            ps.setIsLocalAdd(0); // It's a synced song
            ps.setCreatedAt(System.currentTimeMillis());
            playlistSongRepository.save(ps);
        }
    }
}
