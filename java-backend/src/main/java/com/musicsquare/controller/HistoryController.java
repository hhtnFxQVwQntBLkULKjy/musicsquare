package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import com.musicsquare.entity.PlayHistory;
import com.musicsquare.service.HistoryService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class HistoryController {

    @Autowired
    private HistoryService historyService;

    @Autowired
    private ObjectMapper objectMapper;

    @GetMapping("/history")
    public List<Map<String, Object>> getHistory(@RequestHeader("Authorization") String auth) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        List<PlayHistory> histories = historyService.getHistory(userId);
        List<Map<String, Object>> result = new ArrayList<>();
        for (PlayHistory h : histories) {
            try {
                Map<String, Object> song = objectMapper.readValue(h.getSongJson(), Map.class);
                song.put("uid", h.getId());
                result.add(song);
            } catch (Exception e) {
                e.printStackTrace();
            }
        }
        return result;
    }

    @PostMapping("/history")
    public ApiResponse addHistory(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, Object> song) {
        Long userId = Long.parseLong(auth.split(" ")[1]);
        try {
            String json = objectMapper.writeValueAsString(song);
            historyService.addHistory(userId, json);
            return ApiResponse.success(null);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }
}
