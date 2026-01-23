package com.musicsquare.entity;

import jakarta.persistence.*;
import lombok.Data;

@Data
@Entity
@Table(name = "playlist_songs")
public class PlaylistSong {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "playlist_id", nullable = false)
    private Long playlistId;

    @Column(name = "song_json", columnDefinition = "TEXT", nullable = false)
    private String songJson;

    @Column(name = "is_local_add")
    private Integer isLocalAdd = 0;

    @Column(name = "created_at")
    private Long createdAt;
}
