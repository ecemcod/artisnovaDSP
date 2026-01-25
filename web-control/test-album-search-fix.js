const axios = require('axios');

async function testAlbumSearchFix() {
    console.log('🔧 TEST ALBUM SEARCH FIX\n');
    
    const albumName = 'Keep Me Singing';
    const artistName = 'Van Morrison';
    
    console.log(`Testing album search for: "${albumName}" by "${artistName}"`);
    
    try {
        // Test the API endpoint with artist parameter
        console.log('\n1. Testing API with artist parameter:');
        const response = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: albumName,
                type: 'album',
                artist: artistName,
                limit: 5
            }
        });
        
        console.log(`   Status: ${response.status}`);
        console.log(`   Albums found: ${response.data.albums ? response.data.albums.length : 0}`);
        
        if (response.data.albums && response.data.albums.length > 0) {
            response.data.albums.forEach((album, index) => {
                console.log(`   ${index + 1}. "${album.title || 'N/A'}" - ${album.artist_name || 'N/A'} (${album.source}) [weight: ${album.weight}]`);
            });
            
            // Check if Qobuz is in the results
            const qobuzAlbum = response.data.albums.find(album => album.source === 'qobuz');
            if (qobuzAlbum) {
                console.log('\n   ✅ Qobuz album found in results!');
                console.log(`      Title: ${qobuzAlbum.title}`);
                console.log(`      Artist: ${qobuzAlbum.artist_name}`);
                console.log(`      Artwork: ${qobuzAlbum.artwork_url ? 'Available' : 'Not available'}`);
                console.log(`      Weight: ${qobuzAlbum.weight}`);
            } else {
                console.log('\n   ❌ No Qobuz album found in results');
            }
        } else {
            console.log('   No albums found');
        }
        
        // Test 2: Check if the issue is with source ordering
        console.log('\n2. Testing source priority:');
        const allSources = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: albumName,
                type: 'album',
                artist: artistName,
                limit: 10
            }
        });
        
        if (allSources.data.albums) {
            console.log('   All sources found:');
            const sourceCount = {};
            allSources.data.albums.forEach(album => {
                sourceCount[album.source] = (sourceCount[album.source] || 0) + 1;
            });
            
            Object.entries(sourceCount).forEach(([source, count]) => {
                console.log(`      ${source}: ${count} results`);
            });
            
            // Show top result by weight
            const sortedByWeight = allSources.data.albums.sort((a, b) => (b.weight || 0) - (a.weight || 0));
            console.log('\n   Top result by weight:');
            const topResult = sortedByWeight[0];
            console.log(`      "${topResult.title || 'N/A'}" - ${topResult.artist_name || 'N/A'} (${topResult.source}) [weight: ${topResult.weight}]`);
        }
        
    } catch (error) {
        console.error('Error:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testAlbumSearchFix().catch(console.error);