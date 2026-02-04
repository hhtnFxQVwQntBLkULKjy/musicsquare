package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import com.musicsquare.entity.Playlist;
import com.musicsquare.entity.PlaylistSong;
import com.musicsquare.service.PlaylistService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class PlaylistController {

    @Autowired
    private PlaylistService playlistService;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/playlists")
    public List<Map<String, Object>> getPlaylists(@RequestHeader("Authorization") String auth) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        List<Playlist> playlists = playlistService.getUserPlaylists(userId);
        List<Map<String, Object>> result = new ArrayList<>();

        for (Playlist pl : playlists) {
            Map<String, Object> map = new HashMap<>();
            map.put("id", pl.getId());
            map.put("name", pl.getName());
            map.put("is_sync", pl.getIsSync() == 1);
            map.put("platform", pl.getPlatform());
            map.put("external_id", pl.getExternalId());
            map.put("can_delete", pl.getCanDelete() == 1);

            List<PlaylistSong> songs = playlistService.getPlaylistSongs(pl.getId());
            List<Map<String, Object>> tracks = new ArrayList<>();
            for (PlaylistSong s : songs) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> songMap = objectMapper.readValue(s.getSongJson(), Map.class);
                    songMap.put("uid", s.getId());
                    songMap.put("is_local_add", s.getIsLocalAdd() == 1);
                    tracks.add(songMap);
                } catch (Exception e) {
                    e.printStackTrace();
                }
            }
            map.put("tracks", tracks);
            result.add(map);
        }
        return result;
    }

    @PostMapping("/playlists")
    public Map<String, Object> createPlaylist(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, String> body) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        Playlist pl = playlistService.createPlaylist(userId, body.get("name"));

        Map<String, Object> result = new HashMap<>();
        result.put("id", pl.getId());
        result.put("name", pl.getName());
        result.put("tracks", new ArrayList<>());
        return result;
    }

    @PostMapping("/playlists/{id}/songs")
    public ApiResponse addSong(
            @PathVariable("id") Long playlistId,
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> song) {
        try {
            String json = objectMapper.writeValueAsString(song);
            PlaylistSong ps = playlistService.addSongToPlaylist(playlistId, json, 1);
            return ApiResponse.success(Map.of("success", true, "uid", ps.getId()));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @DeleteMapping("/playlists/{id}/songs")
    public ApiResponse removeSong(
            @PathVariable("id") Long playlistId,
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        Long uid = Long.parseLong(body.get("uid").toString());
        playlistService.removeSongFromPlaylist(playlistId, uid);
        return ApiResponse.success(null);
    }

    @DeleteMapping("/playlists/{id}")
    public ApiResponse deletePlaylist(
            @PathVariable("id") Long playlistId,
            @RequestHeader("Authorization") String auth) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        playlistService.deletePlaylist(userId, playlistId);
        return ApiResponse.success(null);
    }

    @PutMapping("/playlists/{id}")
    public ApiResponse renamePlaylist(
            @PathVariable("id") Long playlistId,
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, String> body) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        playlistService.renamePlaylist(userId, playlistId, body.get("name"));
        return ApiResponse.success(null);
    }
    @DeleteMapping("/playlists/{id}/songs/batch")
    public ApiResponse removeBatchSongs(
            @PathVariable("id") Long playlistId,
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        List<?> uidsRaw = (List<?>) body.get("uids");
        List<Long> uids = new ArrayList<>();
        if (uidsRaw != null) {
            for (Object obj : uidsRaw) {
                if (obj instanceof Number) {
                    uids.add(((Number) obj).longValue());
                } else if (obj instanceof String) {
                    try {
                        uids.add(Long.parseLong((String) obj));
                    } catch (NumberFormatException ignored) {}
                }
            }
        }
        playlistService.removeBatchSongsFromPlaylist(playlistId, uids);
        return ApiResponse.success(null);
    }

    @PostMapping("/playlists/batch-songs")
    public ApiResponse addBatchSongs(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        try {
            Long playlistId = Long.parseLong(body.get("playlistId").toString());
            List<Object> songs = (List<Object>) body.get("songs");
            List<String> jsons = new ArrayList<>();
            for (Object s : songs) {
                jsons.add(objectMapper.writeValueAsString(s));
            }
            int count = playlistService.addBatchSongsToPlaylist(playlistId, jsons);
            return ApiResponse.success(Map.of("count", count));
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/playlists/sync")
    public ApiResponse syncPlaylist(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {
        try {
            Long userId = Long.parseLong(auth.split(" ")[1]);
            String platform = (String) body.get("platform");
            String externalId = (String) body.get("externalId");
            String name = (String) body.get("name");
            List<Object> songs = (List<Object>) body.get("songs");
            
            List<String> jsons = new ArrayList<>();
            if (songs != null) {
                for (Object s : songs) {
                    jsons.add(objectMapper.writeValueAsString(s));
                }
            }

            playlistService.syncPlaylist(userId, platform, externalId, name, jsons);
            return ApiResponse.success(Map.of("count", jsons.size()));
        } catch (Exception e) {
             e.printStackTrace();
            return ApiResponse.error(e.getMessage());
        }
    }
}
