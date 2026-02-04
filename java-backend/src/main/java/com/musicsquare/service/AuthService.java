package com.musicsquare.service;

import com.musicsquare.entity.User;
import com.musicsquare.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.Optional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets; // StandardCharsets
import java.util.Base64; // Base64

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    private String hashPassword(String password) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] encodedhash = digest.digest(password.getBytes(StandardCharsets.UTF_8));
            return Base64.getEncoder().encodeToString(encodedhash);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException(e);
        }
    }

    public Optional<User> register(String username, String password) {
        if (userRepository.findByUsername(username).isPresent()) {
            return Optional.empty();
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(hashPassword(password));
        user.setAvatar("https://ui-avatars.com/api/?name=" + username + "&background=random");
        user.setCreatedAt(System.currentTimeMillis());
        @SuppressWarnings("null")
        User savedUser = userRepository.save(user);
        return Optional.of(savedUser);
    }

    public Optional<User> login(String username, String password) {
        return userRepository.findByUsernameAndPassword(username, hashPassword(password));
    }

    public User updateProfile(Long userId, String username, String avatar) {
        User user = userRepository.findById(userId).orElseThrow();
        if (username != null)
            user.setUsername(username);
        if (avatar != null)
            user.setAvatar(avatar);
        return userRepository.save(user);
    }

    public boolean checkUserExists(String username) {
        return userRepository.findByUsername(username).isPresent();
    }

    public boolean resetPassword(String username, String newPassword) {
        Optional<User> userOpt = userRepository.findByUsername(username);
        if (userOpt.isPresent()) {
            User user = userOpt.get();
            user.setPassword(hashPassword(newPassword));
            userRepository.save(user);
            return true;
        }
        return false;
    }
}
