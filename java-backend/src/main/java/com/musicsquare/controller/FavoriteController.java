package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import com.musicsquare.entity.Favorite;
import com.musicsquare.service.FavoriteService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class FavoriteController {

    @Autowired
    private FavoriteService favoriteService;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/favorites")
    public List<Map<String, Object>> getFavorites(@RequestHeader("Authorization") String auth) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        List<Favorite> favorites = favoriteService.getFavorites(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Favorite f : favorites) {
            try {
                result.add(objectMapper.readValue(f.getSongJson(), Map.class));
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return result;
    }

    @PostMapping("/favorites")
    public ApiResponse addFavorite(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> song) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        try {
            String songId = song.get("id").toString();
            String json = objectMapper.writeValueAsString(song);
            favoriteService.addFavorite(userId, json, songId);
            return ApiResponse.success(null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/favorites")
    public ApiResponse removeFavorite(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        String songId = body.get("id").toString();
        favoriteService.removeFavorite(userId, songId);
        return ApiResponse.success(null);
    }
    @PostMapping("/favorites/batch")
    public ApiResponse addBatchFavorites(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        try {
            List<Object> songs = (List<Object>) body.get("songs");
            List<Map<String, String>> list = new ArrayList<>();
            for (Object s : songs) {
                Map<String, Object> sm = (Map<String, Object>) s;
                String songId = sm.get("id").toString();
                String json = objectMapper.writeValueAsString(s);
                list.add(Map.of("id", songId, "json", json));
            }
            favoriteService.addBatchFavorites(userId, list);
            return ApiResponse.success(null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/favorites/batch")
    public ApiResponse removeBatchFavorites(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        try {
            List<String> ids = (List<String>) body.get("ids");
            favoriteService.removeBatchFavorites(userId, ids);
            return ApiResponse.success(null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
