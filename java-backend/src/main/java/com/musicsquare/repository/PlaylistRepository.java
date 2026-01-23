package com.musicsquare.repository;

import com.musicsquare.entity.Playlist;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface PlaylistRepository extends JpaRepository<Playlist, Long> {
    List<Playlist> findByUserIdOrderByCreatedAtDesc(Long userId);

    Optional<Playlist> findByUserIdAndPlatformAndExternalId(Long userId, String platform, String externalId);
}
