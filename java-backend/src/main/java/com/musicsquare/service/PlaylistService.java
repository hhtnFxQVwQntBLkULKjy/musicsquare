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
}
