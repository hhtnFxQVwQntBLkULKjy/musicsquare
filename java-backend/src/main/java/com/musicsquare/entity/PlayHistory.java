package com.musicsquare.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "play_history")
public class PlayHistory {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "user_id", nullable = false)
    private Long userId;

    @Column(name = "song_json", columnDefinition = "TEXT", nullable = false)
    private String songJson;

    @Column(name = "played_at")
    private Long playedAt;
}
