package com.musicsquare.service;

import com.musicsquare.entity.ConnectedAccount;
import com.musicsquare.entity.Playlist;
import com.musicsquare.entity.PlaylistSong;
import com.musicsquare.repository.ConnectedAccountRepository;
import com.musicsquare.repository.PlaylistRepository;
import com.musicsquare.repository.PlaylistSongRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Service
public class SyncService {

    @Autowired
    private ConnectedAccountRepository connectedAccountRepository;

    @Autowired
    private PlaylistRepository playlistRepository;

    @Autowired
    private PlaylistSongRepository playlistSongRepository;

    @Autowired
    private ObjectMapper objectMapper;

    @Transactional
    public int importPlaylists(Long userId, String platform, String externalUserId,
            List<Map<String, Object>> playlists) {
        // 1. Record/Update Connection
        Optional<ConnectedAccount> existingConn = connectedAccountRepository.findByUserIdAndPlatform(userId, platform);
        ConnectedAccount conn = existingConn.orElse(new ConnectedAccount());
        conn.setUserId(userId);
        conn.setPlatform(platform);
        conn.setExternalUserId(externalUserId);
        conn.setLastSyncedAt(System.currentTimeMillis());
        connectedAccountRepository.save(conn);

        int importedCount = 0;
        String prefix = getPlatformPrefix(platform);

        for (Map<String, Object> plMap : playlists) {
            String plExternalId = plMap.get("id").toString();
            String plName = plMap.get("name").toString();
            List<Map<String, Object>> tracks = (List<Map<String, Object>>) plMap.get("tracks");

            Optional<Playlist> existingPl = playlistRepository.findByUserIdAndPlatformAndExternalId(userId, platform,
                    plExternalId);
            Playlist pl;
            if (existingPl.isPresent()) {
                pl = existingPl.get();
                playlistSongRepository.deleteByPlaylistId(pl.getId());
            } else {
                pl = new Playlist();
                pl.setUserId(userId);
                pl.setPlatform(platform);
                pl.setExternalId(plExternalId);
                pl.setIsSync(1);
                pl.setCanDelete(1);
                pl.setCreatedAt(System.currentTimeMillis());

                String cleanName = cleanPrefix(plName);
                pl.setName(prefix + cleanName);
                playlistRepository.save(pl);
            }

            if (tracks != null && !tracks.isEmpty()) {
                importedCount++;
                for (Map<String, Object> track : tracks) {
                    try {
                        track.remove("url");
                        Object lrc = track.get("lrc");
                        if (lrc instanceof String && ((String) lrc).startsWith("http")) {
                            track.remove("lrc");
                        }

                        PlaylistSong ps = new PlaylistSong();
                        ps.setPlaylistId(pl.getId());
                        ps.setSongJson(objectMapper.writeValueAsString(track));
                        ps.setIsLocalAdd(0);
                        ps.setCreatedAt(System.currentTimeMillis());
                        playlistSongRepository.save(ps);
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            }
        }
        return importedCount;
    }

    private String getPlatformPrefix(String platform) {
        switch (platform) {
            case "netease":
                return "网易:";
            case "qq":
                return "QQ:";
            case "kuwo":
                return "酷我:";
            default:
                return platform + ":";
        }
    }

    private String cleanPrefix(String name) {
        String[] prefixes = { "网易:", "QQ:", "酷我:", "netease:", "qq:", "kuwo:", "网易：", "酷我：", "QQ：" };
        String n = name;
        boolean found = true;
        while (found) {
            found = false;
            for (String p : prefixes) {
                if (n.toLowerCase().startsWith(p.toLowerCase())) {
                    n = n.substring(p.length()).trim();
                    found = true;
                }
            }
        }
        return n;
    }
}
