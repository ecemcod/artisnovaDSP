const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'history.db');
console.log(`Opening database at ${dbPath}`);
const db = new sqlite3.Database(dbPath);

async function getMetadataFromiTunes(artist, title, album) {
    try {
        // 1. Try searching for artist + title
        let query = `${title} ${artist}`;
        let searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&limit=1`;
        let response = await axios.get(searchUrl);

        if (response.data.results && response.data.results.length > 0) {
            const result = response.data.results[0];
            return {
                genre: result.primaryGenreName,
                artworkUrl: result.artworkUrl100
            };
        }

        // 2. Fallback: Search for Album + Artist (useful if track title is specific/live)
        if (album) {
            console.log(`  -> Fallback search: ${album} ${artist}`);
            query = `${album} ${artist}`;
            searchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=music&entity=album&limit=1`;
            response = await axios.get(searchUrl);

            if (response.data.results && response.data.results.length > 0) {
                const result = response.data.results[0];
                return {
                    genre: result.primaryGenreName,
                    artworkUrl: result.artworkUrl100
                };
            }
        }

    } catch (error) {
        console.error('iTunes search error:', error.message);
    }
    return { genre: null, artworkUrl: null };
}

// Wrap db.all in promise
function getRows() {
    return new Promise((resolve, reject) => {
        db.all("SELECT id, artist, track, album FROM listening_history WHERE artwork_url IS NULL OR artwork_url = ''", (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function updateRow(id, url) {
    return new Promise((resolve, reject) => {
        db.run("UPDATE listening_history SET artwork_url = ? WHERE id = ?", [url, id], (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

async function run() {
    try {
        const rows = await getRows();
        console.log(`Found ${rows.length} rows to update.`);

        for (const row of rows) {
            console.log(`Processing: ${row.artist} - ${row.track}`);
            const meta = await getMetadataFromiTunes(row.artist, row.track, row.album);

            if (meta.artworkUrl) {
                await updateRow(row.id, meta.artworkUrl);
                console.log(`Updated id ${row.id} with ${meta.artworkUrl}`);
            } else {
                console.log(`No artwork found for id ${row.id}`);
            }

            // Be nice to API, wait 200ms
            await new Promise(r => setTimeout(r, 200));
        }

        console.log("Done.");
    } catch (e) {
        console.error("Error:", e);
    } finally {
        db.close();
    }
}

run();
