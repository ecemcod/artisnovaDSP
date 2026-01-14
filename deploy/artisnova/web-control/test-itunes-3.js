const https = require('https');

const search = (term, entity, country = 'US') => {
    return new Promise((resolve) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=1&country=${country}`;
        console.log(`Searching: ${term} (${entity}, ${country}) -> ${url}`);

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`Results: ${json.resultCount}`);
                    if (json.resultCount > 0) {
                        console.log(`First result: ${json.results[0].artistName} - ${json.results[0].collectionName}`);
                        console.log(`Artwork: ${json.results[0].artworkUrl100}`);
                    }
                    resolve();
                } catch (e) {
                    console.log('Error:', e.message);
                    resolve();
                }
            });
        }).on('error', (e) => {
            console.log('Request error:', e.message);
            resolve();
        });
    });
};

const run = async () => {
    await search("Mayéutica Robe", "album", "ES");
    await search("Segundo movimiento Robe", "song", "ES");
};

run();
