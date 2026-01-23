package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class MusicApiController {

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/qq/qr/create")
    public ApiResponse createQqQr() {
        try {
            String url = "https://ssl.ptlogin2.qq.com/ptqrshow?appid=716027609&e=2&l=M&s=3&d=72&v=4&t=0.8";
            ResponseEntity<byte[]> response = restTemplate.getForEntity(url, byte[].class);

            String qrsig = "";
            String setCookie = response.getHeaders().getFirst(HttpHeaders.SET_COOKIE);
            if (setCookie != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern.compile("qrsig=([^;]+)").matcher(setCookie);
                if (m.find())
                    qrsig = m.group(1);
            }

            String base64 = Base64.getEncoder().encodeToString(response.getBody());
            Map<String, Object> data = new HashMap<>();
            data.put("success", true);
            data.put("qrsig", qrsig);
            data.put("image", "data:image/png;base64," + base64);
            data.put("tip", "请使用QQ或微信扫描二维码");

            return ApiResponse.success(data);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/qq/qr/check")
    public ApiResponse checkQqQr(@RequestBody Map<String, String> body) {
        String qrsig = body.get("qrsig");
        if (qrsig == null)
            return ApiResponse.error("Missing qrsig");

        int hash = 0;
        for (int i = 0; i < qrsig.length(); ++i) {
            hash += (hash << 5) + qrsig.charAt(i);
        }
        int ptqrtoken = hash & 0x7fffffff;

        String checkUrl = "https://ssl.ptlogin2.qq.com/ptqrlogin?ptqrtoken=" + ptqrtoken
                + "&u1=https%3A%2F%2Fy.qq.com%2F&ptredirect=0&h=1&t=1&g=1&from_ui=1&ptlang=2052";

        HttpHeaders headers = new HttpHeaders();
        headers.set("Cookie", "qrsig=" + qrsig);
        headers.set("User-Agent", "Mozilla/5.0");

        HttpEntity<String> entity = new HttpEntity<>(headers);
        ResponseEntity<String> response = restTemplate.exchange(checkUrl, HttpMethod.GET, entity, String.class);
        String text = response.getBody();

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        if (text.contains("登录成功")) {
            res.put("status", 2);
            res.put("message", "登录成功");
            res.put("cookies", response.getHeaders().getFirst(HttpHeaders.SET_COOKIE));
        } else if (text.contains("二维码未失效")) {
            res.put("status", 0);
            res.put("message", "等待扫码");
        } else if (text.contains("二维码认证中")) {
            res.put("status", 1);
            res.put("message", "已扫码，请确认");
        } else {
            res.put("status", -1);
            res.put("message", "二维码已过期");
        }
        return ApiResponse.success(res);
    }

    @GetMapping("/netease/qr/create")
    public ApiResponse createNeteaseQr() {
        try {
            // Simplification: Use a public instance or the official API directly if we can
            // Here we'll just proxy the key generation
            String keyUrl = "https://music.163.com/weapi/login/qrcode/unikey?csrf_token=";
            // Note: This requires specific encryption for official API,
            // but for this task, we can use a backup or simpler approach as in the worker.
            // I'll provide a simplified version that matches the worker's fallback logic.

            String backupUrl = "https://netease-cloud-music-api-liard.vercel.app/login/qr/key?timestamp="
                    + System.currentTimeMillis();
            Map<String, Object> keyJson = restTemplate.getForObject(backupUrl, Map.class);
            Map<String, Object> dataMap = (Map<String, Object>) keyJson.get("data");
            String unikey = (String) dataMap.get("unikey");

            String qrUrl = "https://music.163.com/login?codekey=" + unikey;
            Map<String, Object> data = new HashMap<>();
            data.put("success", true);
            data.put("unikey", unikey);
            data.put("image", "https://api.qrserver.com/v1/create-qr-code/?size=200x200&data="
                    + java.net.URLEncoder.encode(qrUrl, "UTF-8"));

            return ApiResponse.success(data);
        } catch (Exception e) {
            return ApiResponse.error(e.getMessage());
        }
    }

    @PostMapping("/netease/qr/check")
    public ApiResponse checkNeteaseQr(@RequestBody Map<String, String> body) {
        String unikey = body.get("unikey");
        String url = "https://music.163.com/api/login/qrcode/client/login?type=1&key=" + unikey + "&timestamp="
                + System.currentTimeMillis();

        ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
        Map data = response.getBody();
        int code = (int) data.get("code");

        Map<String, Object> res = new HashMap<>();
        res.put("success", true);
        if (code == 803) {
            res.put("status", 2);
            res.put("message", "登录成功");
            res.put("cookies", response.getHeaders().getFirst(HttpHeaders.SET_COOKIE));
        } else if (code == 801) {
            res.put("status", 0);
            res.put("message", "等待扫码");
        } else if (code == 802) {
            res.put("status", 1);
            res.put("message", "已扫码，等待确认");
        } else {
            res.put("status", -1);
            res.put("message", "二维码已过期");
        }
        return ApiResponse.success(res);
    }
}
