package com.musicsquare.controller;

import com.musicsquare.dto.ApiResponse;
import com.musicsquare.dto.AuthRequest;
import com.musicsquare.entity.User;
import com.musicsquare.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
@CrossOrigin(origins = "*")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/auth/register")
    public ApiResponse register(@RequestBody AuthRequest request) {
        if (request.getUsername() == null || request.getPassword() == null) {
            return ApiResponse.error("Missing username or password");
        }
        Optional<User> user = authService.register(request.getUsername(), request.getPassword());
        if (user.isPresent()) {
            return ApiResponse.success("User created", null);
        }
        return ApiResponse.error("Username already exists");
    }

    @PostMapping("/auth/login")
    public ApiResponse login(@RequestBody AuthRequest request) {
        Optional<User> user = authService.login(request.getUsername(), request.getPassword());
        if (user.isPresent()) {
            User u = user.get();
            return ApiResponse.success(Map.of(
                    "success", true,
                    "user", Map.of(
                            "id", u.getId(),
                            "username", u.getUsername(),
                            "avatar", u.getAvatar())));
        }
        return ApiResponse.error("Invalid credentials");
    }

    @PostMapping("/user/profile")
    public ApiResponse updateProfile(
            @RequestHeader("Authorization") String auth,
            @RequestBody Map<String, String> body) {

        Long userId = Long.parseLong(auth.split(" ")[1]);
        String username = body.get("username");
        String avatar = body.get("avatar");

        authService.updateProfile(userId, username, avatar);
        return ApiResponse.success(null);
    }
}
