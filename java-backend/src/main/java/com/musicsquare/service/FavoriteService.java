package com.musicsquare.service;

import com.musicsquare.entity.Favorite;
import com.musicsquare.repository.FavoriteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class FavoriteService {

    @Autowired
    private FavoriteRepository favoriteRepository;

    public List<Favorite> getFavorites(Long userId) {
        return favoriteRepository.findByUserIdOrderByCreatedAtDesc(userId);
    }

    public void addFavorite(Long userId, String songJson, String songId) {
        Optional<Favorite> existing = favoriteRepository.findByUserIdAndSongId(userId, songId);
        if (existing.isEmpty()) {
            Favorite fav = new Favorite();
            fav.setUserId(userId);
            fav.setSongJson(songJson);
            fav.setCreatedAt(System.currentTimeMillis());
            favoriteRepository.save(fav);
        }
    }

    @Transactional
    public void removeFavorite(Long userId, String songId) {
        favoriteRepository.deleteByUserIdAndSongId(userId, songId);
    }

    @Transactional
    public void addBatchFavorites(Long userId, List<Map<String, String>> songs) {
        // songs is list of {json, id}
        for (Map<String, String> item : songs) {
            addFavorite(userId, item.get("json"), item.get("id"));
        }
    }

    @Transactional
    public void removeBatchFavorites(Long userId, List<String> songIds) {
        for (String sid : songIds) {
            favoriteRepository.deleteByUserIdAndSongId(userId, sid);
        }
    }
}
