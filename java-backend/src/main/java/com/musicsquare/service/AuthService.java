package com.musicsquare.service;

import com.musicsquare.entity.User;
import com.musicsquare.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import java.util.Optional;

@Service
public class AuthService {

    @Autowired
    private UserRepository userRepository;

    public Optional<User> register(String username, String password) {
        if (userRepository.findByUsername(username).isPresent()) {
            return Optional.empty();
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(password); // Note: Should hash in production
        user.setAvatar("https://ui-avatars.com/api/?name=" + username + "&background=random");
        user.setCreatedAt(System.currentTimeMillis());
        @SuppressWarnings("null")
        User savedUser = userRepository.save(user);
        return Optional.of(savedUser);
    }

    public Optional<User> login(String username, String password) {
        return userRepository.findByUsernameAndPassword(username, password);
    }

    public User updateProfile(Long userId, String username, String avatar) {
        User user = userRepository.findById(userId).orElseThrow();
        if (username != null)
            user.setUsername(username);
        if (avatar != null)
            user.setAvatar(avatar);
        return userRepository.save(user);
    }
}
