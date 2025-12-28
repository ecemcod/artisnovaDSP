const https = require('https');

// Search for the album directly
const url = 'https://itunes.apple.com/search?term=Mayéutica&entity=album&country=ES&limit=5';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(`Found ${json.resultCount} albums:`);
            json.results.forEach(a => console.log(`- ${a.collectionName} by ${a.artistName}`));
        } catch (e) { console.log(e); }
    });
});
