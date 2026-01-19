
const axios = require('axios');

async function fetchLyrics(url, params) {
    try {
        const response = await axios.get(url, {
            params,
            timeout: 5000,
            headers: {
                'User-Agent': 'ArtisNova-Test/1.2.1'
            }
        });
        return response.data;
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.log(`Lyrics: API 404 for ${url} with params: ${JSON.stringify(params)}`);
            return null;
        }
        console.error(`Lyrics: API Error (${e.response?.status}) for ${url}:`, e.message);
        return null;
    }
}

function normalizeLyricsMetadata(artist, track) {
    let cleanArtist = artist
        .split(/[\\\/,;&]/)[0]
        .replace(/\s+(feat|ft)\.?\s+.*/i, '')
        .trim();

    let cleanTrack = track
        .replace(/\s*\((Live|Remastered|Deluxe|Deluxe Edition|Special Edition|Expanded|Anniversary|Remaster|Bonus Track Version|Radio Edit|Edit|Duet With.*)\)\s*$/i, '')
        .replace(/\s*\[(Live|Remastered|Deluxe|Special Edition)\]\s*$/i, '')
        .replace(/\s*-\s*(Live|Remastered|Deluxe|Single Version|Radio Edit).*/i, '')
        .trim();

    return { artist: cleanArtist, track: cleanTrack };
}

async function getLyricsFromLrcLib(track, artist) {
    const { artist: cleanArtist, track: cleanTrack } = normalizeLyricsMetadata(artist, track);
    console.log(`Normalized: "${cleanArtist}" - "${cleanTrack}"`);

    // Strategy A
    console.log(`Lyrics: Trying Strategy A (Get)`);
    let data = await fetchLyrics('https://lrclib.net/api/get', {
        artist_name: cleanArtist,
        track_name: cleanTrack
    });
    if (data && (data.plainLyrics || data.syncedLyrics)) return data;

    // Strategy B
    console.log(`Lyrics: Trying Strategy B (Search Normalized)`);
    let searchData = await fetchLyrics('https://lrclib.net/api/search', {
        q: `${cleanArtist} ${cleanTrack}`
    });
    if (Array.isArray(searchData) && searchData.length > 0) return searchData[0];

    // Strategy D
    if (cleanTrack.includes('/')) {
        const parts = cleanTrack.split('/').map(p => p.trim()).filter(p => p.length >= 3);
        console.log(`Lyrics: Strategy D - Detected medley: ${parts.join(', ')}`);
        for (const part of parts) {
            console.log(`Lyrics: Strategy D - Trying component: "${cleanArtist} ${part}"`);
            let medleySearchData = await fetchLyrics('https://lrclib.net/api/search', {
                q: `${cleanArtist} ${part}`
            });
            if (Array.isArray(medleySearchData) && medleySearchData.length > 0) {
                console.log(`Lyrics: Strategy D - SUCCESS for "${part}"`);
                return medleySearchData[0];
            }
        }
    }

    return null;
}

const track = "Celtic Excavation / Into The Mystic (Live)";
const artist = "Van Morrison";

getLyricsFromLrcLib(track, artist).then(res => {
    if (res) {
        console.log("FOUND LYRICS!");
        console.log("ID:", res.id);
        console.log("Plain excerpt:", res.plainLyrics?.substring(0, 50));
    } else {
        console.log("NOT FOUND");
    }
});
