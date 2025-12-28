const https = require('https');

const search = (term, entity) => {
    return new Promise((resolve) => {
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=1`;
        console.log(`Searching: ${term} (${entity}) -> ${url}`);

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    console.log(`Results: ${json.resultCount}`);
                    if (json.resultCount > 0) {
                        console.log(`First result: ${json.results[0].artistName} - ${json.results[0].collectionName}`);
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
    // Original failed searches
    await search("Segundo movimiento: Mierda de filosofía Robe", "song");
    await search("Mayéutica Robe", "album");

    // Simplified searches
    await search("Robe Mayeutica", "album"); // No accent
    await search("Robe", "musicArtist");
    await search("Extremoduro", "musicArtist"); // Robe's band
};

run();
