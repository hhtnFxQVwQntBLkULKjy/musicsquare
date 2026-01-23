package com.musicsquare.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "favorites")
public class Favorite {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "song_json", columnDefinition = "TEXT", nullable = false)
    private String songJson;

    @Column(name = "created_at")
    private Long createdAt;
}
