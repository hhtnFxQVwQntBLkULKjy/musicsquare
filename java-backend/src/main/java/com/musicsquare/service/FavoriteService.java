package com.musicsquare.service;

import com.musicsquare.entity.Favorite;
import com.musicsquare.repository.FavoriteRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
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
}
