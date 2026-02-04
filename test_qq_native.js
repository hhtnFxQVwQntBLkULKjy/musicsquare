const https = require('https');

const id = '3817475436';
const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${id}&format=json&song_begin=0&song_num=10000`;

const options = {
    headers: {
        'Referer': 'https://y.qq.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
};

console.log('Fetching:', url);

https.get(url, options, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        console.log('Status:', res.statusCode);
        try {
            const json = JSON.parse(data);
            if (json.cdlist && json.cdlist[0]) {
                console.log('Playlist Name:', json.cdlist[0].dissname);
                console.log('Song Count in List:', json.cdlist[0].songlist ? json.cdlist[0].songlist.length : 0);
                console.log('Total Song Num:', json.cdlist[0].total_song_num);
                // Check first few songs for order
                if (json.cdlist[0].songlist && json.cdlist[0].songlist.length > 0) {
                    console.log('First Song:', json.cdlist[0].songlist[0].songname);
                }
            } else {
                console.log('Structure not found. Response start:', data.substring(0, 200));
            }
        } catch (e) {
            console.error('Parse Error:', e.message);
            console.log('Raw Data:', data.substring(0, 500));
        }
    });
}).on('error', (e) => {
    console.error('Request Error:', e);
});
