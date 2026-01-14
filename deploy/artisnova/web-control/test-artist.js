const https = require('https');

const url = 'https://itunes.apple.com/search?term=Robe&entity=musicArtist&country=ES&limit=1';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(JSON.stringify(json.results[0], null, 2));
        } catch (e) { console.log(e); }
    });
});
