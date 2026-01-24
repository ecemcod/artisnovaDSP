const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

const TEST_CASES = [
    { artist: 'Robe', album: 'Mayéutica' },
    { artist: 'Pink Floyd', album: 'The Dark Side of the Moon (50th Anniversary)' },
    { artist: 'C. Tangana', album: 'El Madrileño' },
    { artist: 'Daft Punk', album: 'Random Access Memories (10th Anniversary Edition)' }
];

async function runTests() {
    console.log('--- STARTING METADATA VERIFICATION ---\n');

    for (const test of TEST_CASES) {
        console.log(`Testing: "${test.artist}" - "${test.album}"`);
        try {
            const res = await axios.get(`${BASE_URL}/api/media/artist-info`, {
                params: test
            });

            const { artist, album, source } = res.data;

            console.log(`  Source: ${source}`);
            console.log(`  Artist Object: ${JSON.stringify(artist)}`);
            console.log(`  Album Object: ${JSON.stringify(album)}`);
            console.log(`  Bio (extract): ${artist?.bio ? artist.bio.substring(0, 100) + '...' : 'MISSING'}`);
            console.log(`  Album: ${album?.title || 'MISSING'}`);
            console.log(`  Year: ${album?.date || 'MISSING'}`);
            console.log(`  Tracklist: ${album?.tracklist?.length || 0} tracks`);
            console.log('---------------------------------------\n');

        } catch (e) {
            console.error(`  ERROR testing "${test.artist}": ${e.message}`);
            if (e.message.includes('ECONNREFUSED')) {
                console.error('\n[CRITICAL] Server is not running on port 3000. Start the server before running this test.');
                break;
            }
        }
    }
}

runTests();
