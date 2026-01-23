package com.musicsquare.repository;

import com.musicsquare.entity.PlaylistSong;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PlaylistSongRepository extends JpaRepository<PlaylistSong, Long> {
    List<PlaylistSong> findByPlaylistIdOrderByCreatedAtDesc(Long playlistId);

    void deleteByPlaylistId(Long playlistId);

    void deleteByPlaylistIdAndId(Long playlistId, Long id);
}
