package com.musicsquare.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "playlists")
public class Playlist {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(name = "is_sync")
    private Integer isSync = 0;

    private String platform = "local";

    @Column(name = "external_id")
    private String externalId;

    @Column(name = "can_delete")
    private Integer canDelete = 1;

    @Column(name = "created_at")
    private Long createdAt;
}
