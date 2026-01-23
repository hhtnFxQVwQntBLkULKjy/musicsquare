package com.musicsquare.service;

import com.musicsquare.entity.PlayHistory;
import com.musicsquare.repository.PlayHistoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class HistoryService {

    @Autowired
    private PlayHistoryRepository playHistoryRepository;

    public List<PlayHistory> getHistory(Long userId) {
        return playHistoryRepository.findByUserIdOrderByPlayedAtDesc(userId, PageRequest.of(0, 100));
    }

    public void addHistory(Long userId, String songJson) {
        PlayHistory history = new PlayHistory();
        history.setUserId(userId);
        history.setSongJson(songJson);
        history.setPlayedAt(System.currentTimeMillis());
        playHistoryRepository.save(history);
    }
}
