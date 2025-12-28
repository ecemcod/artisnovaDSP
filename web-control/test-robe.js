const https = require('https');

const url = 'https://itunes.apple.com/search?term=Robe&entity=album&country=ES&limit=20';

https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            console.log(`Found ${json.resultCount} albums:`);
            json.results.forEach(a => console.log(`- ${a.collectionName}`));
        } catch (e) { console.log(e); }
    });
});
