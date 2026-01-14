const https = require('https');

const getArtworkFromiTunes = (track, artist, album) => {
    return new Promise((resolve) => {
        if (!artist && !track && !album) return resolve(null);

        const searches = [];
        if (track && artist) searches.push(`${track} ${artist}`);
        if (album && artist) searches.push(`${album} ${artist}`);

        const trySearch = (index) => {
            if (index >= searches.length) return resolve(null);

            const query = encodeURIComponent(searches[index]);
            const entity = index === 0 && track ? 'song' : 'album';
            const url = `https://itunes.apple.com/search?term=${query}&entity=${entity}&limit=1`;

            console.log(`Trying URL: ${url}`);

            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.results && json.results.length > 0) {
                            const artworkUrl = json.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
                            console.log('Found:', artworkUrl);
                            resolve(artworkUrl);
                        } else {
                            console.log('No results for this query');
                            trySearch(index + 1);
                        }
                    } catch (e) {
                        console.log('Error parsing JSON:', e.message);
                        trySearch(index + 1);
                    }
                });
            }).on('error', (e) => {
                console.log('Request error:', e.message);
                trySearch(index + 1);
            });
        };

        trySearch(0);
    });
};

// Test with the track that failed
getArtworkFromiTunes("Segundo movimiento: Mierda de filosofía", "Robe", "Mayéutica").then(url => {
    console.log('Final Result:', url);
});
