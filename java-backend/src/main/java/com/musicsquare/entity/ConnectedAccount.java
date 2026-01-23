package com.musicsquare.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "connected_accounts")
public class ConnectedAccount {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String platform;

    @Column(name = "external_user_id")
    private String externalUserId;

    @Column(name = "last_synced_at")
    private Long lastSyncedAt;
}
