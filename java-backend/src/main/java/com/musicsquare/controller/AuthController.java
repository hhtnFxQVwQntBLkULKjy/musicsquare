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
            return ApiResponse.error("用户名或密码不能为空");
        }
        Optional<User> user = authService.register(request.getUsername(), request.getPassword());
        if (user.isPresent()) {
            return ApiResponse.success("用户创建成功", null);
        }
        return ApiResponse.error("用户名已存在");
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
        return ApiResponse.error("用户名或密码错误");
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

    @PostMapping("/auth/check-user")
    public ApiResponse checkUser(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        if (username == null || username.isEmpty()) {
            return ApiResponse.error("用户名不能为空");
        }
        boolean exists = authService.checkUserExists(username);
        return ApiResponse.success(Map.of("exists", exists));
    }

    @PostMapping("/auth/reset-password")
    public ApiResponse resetPassword(@RequestBody Map<String, String> body) {
        String username = body.get("username");
        String newPassword = body.get("newPassword");
        if (username == null || newPassword == null) {
            return ApiResponse.error("用户名和新密码不能为空");
        }
        boolean success = authService.resetPassword(username, newPassword);
        if (success) {
            return ApiResponse.success("密码重置成功");
        }
        return ApiResponse.error("用户不存在");
    }
}
