package com.musicsquare.controller;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

import java.util.Collections;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class ProxyController {

    private final RestTemplate restTemplate = new RestTemplate();

    @GetMapping("/proxy")
    public ResponseEntity<byte[]> proxy(@RequestParam("url") String targetUrl) {
        try {
            HttpHeaders headers = new HttpHeaders();
            headers.set("User-Agent", "Mozilla/5.0");
            // No strict referer for broad compatibility

            byte[] content = restTemplate.getForObject(targetUrl, byte[].class);

            HttpHeaders responseHeaders = new HttpHeaders();
            responseHeaders.setAccessControlAllowOrigin("*");
            responseHeaders.setCacheControl("public, max-age=3600");

            return new ResponseEntity<>(content, responseHeaders, HttpStatus.OK);
        } catch (Exception e) {
            return new ResponseEntity<>(HttpStatus.INTERNAL_SERVER_ERROR);
        }
    }
}
