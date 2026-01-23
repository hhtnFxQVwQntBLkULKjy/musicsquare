package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import com.musicsquare.service.SyncService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class SyncController {

    @Autowired
    private SyncService syncService;

    @PostMapping("/sync/import")
    public ApiResponse importData(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> body) {

        Long userId = Long.parseLong(auth.split(" ")[1]);
        String platform = (String) body.get("platform");
        String id = (String) body.get("id");
        List<Map<String, Object>> playlists = (List<Map<String, Object>>) body.get("playlists");

        if (platform == null || id == null || playlists == null) {
            return ApiResponse.error("Invalid data format");
        }

        try {
            int count = syncService.importPlaylists(userId, platform, id, playlists);
            return ApiResponse.success("同步成功", Map.of("count", count, "success", true));
        } catch (Exception e) {
            return ApiResponse.error("同步保存失败: " + e.getMessage());
        }
    }
}
