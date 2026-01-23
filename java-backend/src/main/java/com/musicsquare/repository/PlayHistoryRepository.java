package com.musicsquare.repository;

import com.musicsquare.entity.PlayHistory;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PlayHistoryRepository extends JpaRepository<PlayHistory, Long> {
    List<PlayHistory> findByUserIdOrderByPlayedAtDesc(Long userId, Pageable pageable);
}
