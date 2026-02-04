$url = "https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=3817475436&format=json&song_begin=0&song_num=10000"
$headers = @{
    "Referer" = "https://y.qq.com/"
    "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
}

Write-Host "Testing URL: $url"

try {
    $response = Invoke-RestMethod -Uri $url -Headers $headers -Method Get
    
    if ($response.code -eq 0) {
        if ($response.cdlist -and $response.cdlist.Count -gt 0) {
            $playlist = $response.cdlist[0]
            Write-Host "✅ API Test Passed!"
            Write-Host "Playlist Name: $($playlist.dissname)"
            Write-Host "Song Count: $($playlist.songlist.Count)"
            Write-Host "Total Songs (Metadata): $($playlist.total_song_num)"
            
            if ($playlist.songlist.Count -gt 0) {
                Write-Host "First Song: $($playlist.songlist[0].songname)"
            }
        } else {
            Write-Host "❌ API returned 200 but no playlist data found."
            Write-Host $response
        }
    } else {
        Write-Host "❌ API Error Code: $($response.code)"
    }
} catch {
    Write-Host "❌ Request Failed: $_"
}
