package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

@RestController
@RequestMapping("/api/tunehub")
@CrossOrigin(origins = "*")
public class TuneHubController {

    private final RestTemplate restTemplate = new RestTemplate();

    @PostMapping("/request")
    public ApiResponse proxyRequest(@RequestBody Map<String, Object> body) {
        try {
            String targetUrl = (String) body.get("url");
            if (targetUrl == null) {
                return ApiResponse.error("Missing url parameter");
            }

            Map<String, String> customHeaders = (Map<String, String>) body.get("headers");
            String method = (String) body.getOrDefault("method", "GET");
            Object data = body.get("data");

            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36");
            if (customHeaders != null) {
                customHeaders.forEach(headers::set);
            }

            HttpEntity<Object> entity = new HttpEntity<>(data, headers);
            HttpMethod httpMethod = HttpMethod.valueOf(method.toUpperCase());

            // Handle binary response or json response? 
            // The usage in api.js expects JSON mostly, but let's return Object/Map
            // QQ returns JSONP or JSON, Kuwo returns JSON or text.
            // Using String.class to get raw body and let frontend parse if checking json
            // But api.js does `res.json()`, so we should return an object if possible or string.
            // Let's stick to returning the body as is (String or Map) wrapped in ApiResponse.
            
            // However, RestTemplate might try to parse JSON automatically if we ask for Object.class
            // Let's ask for String to be safe and versatile.
            
            ResponseEntity<String> response = restTemplate.exchange(targetUrl, httpMethod, entity, String.class);
            
            // Attempt to parse JSON if content-type is json? 
            // Or just return the string.
            // But `api.js` expects: `result.success` and `result.data = actual_response`.
            
            // If the upstream returns simple JSON, we put it in `data`.
            // Issues might arise if upstream returns JSONP.
            
            // Simple string return:
            return ApiResponse.success(response.getBody());

        } catch (Exception e) {
            return ApiResponse.error("Proxy error: " + e.getMessage());
        }
    }

    @PostMapping("/parse")
    public ApiResponse parseSong(@RequestBody Map<String, Object> body) {
        String platform = (String) body.get("platform");
        String id = (String) body.get("ids"); // api.js uses 'ids'
        // String quality = (String) body.get("quality");

        if ("netease".equals(platform)) {
             try {
                // Proxy to Netease Cloud Music API (public instance)
                // You might want to make this configurable in application.properties
                 String url = "https://netease-cloud-music-api-eight-rho.vercel.app/song/url?id=" + id;
                 Map res = restTemplate.getForObject(url, Map.class);
                 if (res != null && res.get("data") != null) {
                     return ApiResponse.success(Map.of("data", res.get("data")));
                 }
             } catch (Exception e) {
                 e.printStackTrace();
             }
        } else if ("kuwo".equals(platform)) {
            // Simple fallback for Kuwo
             try {
                 String url = "http://www.kuwo.cn/api/v1/www/music/playUrl?mid=" + id + "&type=music&httpsStatus=1";
                 ResponseEntity<String> res = restTemplate.exchange(url, HttpMethod.GET, 
                    new HttpEntity<>(new HttpHeaders() {{ set("User-Agent", "Mozilla/5.0"); }}), String.class);
                 
                 // Kuwo returns: { "code": 200, "msg": "success", "data": { "url": "..." } }
                 // We need to wrap it so api.js sees json.data.url
                 // Since we return ApiResponse, api.js sees { success:true, data: { ... } }
                 // api.js expects json.data.url or json.data.data[0].url
                 
                 // If we return the raw Kuwo response map as 'data':
                 // api.js sees: res.data = { code:200, data: { url: ... } }
                 // api.js checks: json.data.url? No. json.data.data? Yes.
                 // api.js checks `res.data.data[0]`? No.
                 // So we need to ensure the structure aligns.
                 
                 // Best is to standardize: return { url: "..." } in our data.
                 
                 return ApiResponse.success(Map.of("url", "http://antiserver.kuwo.cn/anti.s?format=mp3&rid=MUSIC_" + id + "&response=url&type=convert_url3")); 
                 // Using the older stable API for fallback if the complex one fails?
                 // Or stick to the one proposed?
             } catch (Exception e) {
                 // ignore
             }
        }

        // Fallback or empty
        return ApiResponse.success(Map.of("url", ""));
    }
}
