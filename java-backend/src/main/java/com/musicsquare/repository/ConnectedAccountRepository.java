package com.musicsquare.repository;

import com.musicsquare.entity.ConnectedAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface ConnectedAccountRepository extends JpaRepository<ConnectedAccount, Long> {
    Optional<ConnectedAccount> findByUserIdAndPlatform(Long userId, String platform);
}
