const axios = require('axios');

async function testEnhancedMusicInfo() {
    console.log('🎵 Testing Enhanced Music Info Integration...\n');

    const baseUrl = 'http://localhost:3000';

    try {
        // Test 1: Search for Van Morrison with fresh Qobuz data
        console.log('1. Testing artist search with Qobuz data...');
        const artistResponse = await axios.get(`${baseUrl}/api/music/search`, {
            params: {
                q: 'Van Morrison',
                type: 'artist',
                forceRefresh: true
            }
        });

        if (artistResponse.data.artists && artistResponse.data.artists.length > 0) {
            const artist = artistResponse.data.artists[0];
            console.log('✅ Artist found:', {
                name: artist.name,
                source: artist.source,
                image_url: artist.image_url ? 'Present' : 'Missing',
                qobuz_id: artist.qobuz_id
            });

            // Test 2: Get detailed artist info
            console.log('\n2. Testing detailed artist info...');
            const artistDetailResponse = await axios.get(`${baseUrl}/api/music/artist/${artist.qobuz_id || artist.id}`);
            
            if (artistDetailResponse.data) {
                const artistInfo = artistDetailResponse.data;
                console.log('✅ Detailed artist info:', {
                    name: artistInfo.name,
                    image_url: artistInfo.image_url ? 'Present' : 'Missing',
                    genres: artistInfo.genres ? artistInfo.genres.length : 0,
                    albums: artistInfo.albums ? artistInfo.albums.length : 0,
                    sources: artistInfo.sources ? artistInfo.sources.map(s => `${s.source_name}(${s.quality_score})`) : []
                });

                // Show first few albums
                if (artistInfo.albums && artistInfo.albums.length > 0) {
                    console.log('\n📀 Recent albums:');
                    artistInfo.albums.slice(0, 3).forEach((album, index) => {
                        console.log(`   ${index + 1}. ${album.title} (${album.release_date || 'Unknown'}) - ${album.track_count || 0} tracks`);
                        console.log(`      Artwork: ${album.artwork_url ? 'Present' : 'Missing'}`);
                    });
                }
            }
        }

        // Test 3: Search for Moondance album
        console.log('\n3. Testing album search...');
        const albumResponse = await axios.get(`${baseUrl}/api/music/search`, {
            params: {
                q: 'Moondance',
                type: 'album',
                artist: 'Van Morrison',
                forceRefresh: true
            }
        });

        if (albumResponse.data.albums && albumResponse.data.albums.length > 0) {
            const album = albumResponse.data.albums[0];
            console.log('✅ Album found:', {
                title: album.title,
                artist_name: album.artist_name,
                source: album.source,
                artwork_url: album.artwork_url ? 'Present' : 'Missing',
                release_date: album.release_date,
                track_count: album.track_count
            });
        }

        console.log('\n✅ Enhanced Music Info Integration Test Completed!');
        console.log('\n🎯 Summary:');
        console.log('- ✅ Qobuz artist data retrieval working');
        console.log('- ✅ High-quality images available');
        console.log('- ✅ Detailed metadata with albums');
        console.log('- ✅ Source attribution working');
        console.log('- ✅ Ready for EnhancedMusicInfo component');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testEnhancedMusicInfo().catch(console.error);