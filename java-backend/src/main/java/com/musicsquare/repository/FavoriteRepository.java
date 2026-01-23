package com.musicsquare.repository;

import com.musicsquare.entity.Favorite;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import java.util.List;
import java.util.Optional;

public interface FavoriteRepository extends JpaRepository<Favorite, Long> {
    List<Favorite> findByUserIdOrderByCreatedAtDesc(Long userId);

    @Query(value = "SELECT * FROM favorites WHERE user_id = ?1 AND JSON_EXTRACT(song_json, '$.id') = ?2", nativeQuery = true)
    Optional<Favorite> findByUserIdAndSongId(Long userId, String songId);

    @Query(value = "DELETE FROM favorites WHERE user_id = ?1 AND JSON_EXTRACT(song_json, '$.id') = ?2", nativeQuery = true)
    void deleteByUserIdAndSongId(Long userId, String songId);
}
