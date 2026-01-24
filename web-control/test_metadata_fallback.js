const axios = require('axios');

async function testSearch() {
    const album = "Somebody Tried To Sell Me A Bridge";

    console.log("Testing Discogs with album only...");
    try {
        const url = `https://api.discogs.com/database/search?q=${encodeURIComponent(album)}&type=release&per_page=5`;
        const res = await axios.get(url, {
            headers: { 'User-Agent': 'ArtisNova/1.2.1' },
            timeout: 5000
        });
        console.log("Discogs Results:", res.data.results.map(r => ({ title: r.title, id: r.id })));
    } catch (e) {
        console.error("Discogs failed:", e.message);
    }

    console.log("\nTesting MusicBrainz with album only...");
    try {
        const query = `release:"${album}"`;
        const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json`;
        const res = await axios.get(url, {
            timeout: 5000,
            headers: { 'User-Agent': 'ArtisNova/1.2.1' }
        });
        console.log("MusicBrainz Results:", res.data.releases.map(r => ({ title: r.title, artist: r['artist-credit']?.[0]?.name })));
    } catch (e) {
        console.error("MusicBrainz failed:", e.message);
    }
}

testSearch();
