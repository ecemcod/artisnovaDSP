const axios = require('axios');

async function testArtistInfoWithLogs() {
    try {
        console.log('Testing Artist Info Endpoint with Detailed Logging...\n');
        
        // Make the request and capture any server logs
        console.log('Making request to /api/media/artist-info...');
        const response = await axios.get('http://localhost:3000/api/media/artist-info', {
            params: {
                artist: 'Van Morrison',
                album: 'Moondance'
            },
            timeout: 15000
        });
        
        const data = response.data;
        console.log('\n=== RESPONSE RECEIVED ===');
        console.log(`Source: ${data.source}`);
        
        if (data.artist) {
            console.log('\n🎤 ARTIST DATA:');
            console.log(`  Name: ${data.artist.name}`);
            console.log(`  Biography: ${data.artist.biography ? 'YES (' + data.artist.biography.length + ' chars)' : 'NO'}`);
            console.log(`  Image URL: ${data.artist.image_url ? 'YES' : 'NO'}`);
            console.log(`  Albums Count: ${data.artist.albums_count || 'Unknown'}`);
            console.log(`  Active Years: ${data.artist.activeYears || 'Unknown'}`);
            console.log(`  Tags: ${data.artist.tags || 'None'}`);
            console.log(`  Country: ${data.artist.country || 'Unknown'}`);
            console.log(`  Qobuz ID: ${data.artist.qobuz_id}`);
            console.log(`  Source: ${data.artist.source}`);
            
            if (data.artist.biography) {
                console.log('\n📝 ARTIST BIOGRAPHY (first 200 chars):');
                console.log(data.artist.biography.substring(0, 200) + '...');
            }
        }
        
        // Test the getArtistInfo function directly to see if it works
        console.log('\n=== TESTING DIRECT getArtistInfo FUNCTION ===');
        
        // We'll simulate what the server should be doing
        const testAudioDB = async (artist) => {
            try {
                const url = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`;
                const res = await axios.get(url, { timeout: 4000 });
                const adbArtist = res.data?.artists?.[0];
                
                if (adbArtist) {
                    return {
                        name: adbArtist.strArtist || artist,
                        bio: adbArtist.strBiographyEN || null,
                        formed: adbArtist.intFormedYear || 'Unknown',
                        origin: adbArtist.strCountry || 'Unknown',
                        tags: [adbArtist.strStyle, adbArtist.strGenre]
                            .filter(Boolean)
                            .filter(t => !['music', 'unknown'].includes(t.toLowerCase().trim())),
                        image: adbArtist.strArtistThumb || null,
                        source: 'TheAudioDB'
                    };
                }
            } catch (error) {
                console.log('AudioDB test failed:', error.message);
            }
            return null;
        };
        
        const directResult = await testAudioDB('Van Morrison');
        if (directResult) {
            console.log('✅ Direct AudioDB call successful:');
            console.log(`  Biography: ${directResult.bio ? 'YES (' + directResult.bio.length + ' chars)' : 'NO'}`);
            console.log(`  Formed: ${directResult.formed}`);
            console.log(`  Origin: ${directResult.origin}`);
            console.log(`  Tags: ${directResult.tags.join(', ')}`);
        } else {
            console.log('❌ Direct AudioDB call failed');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testArtistInfoWithLogs();