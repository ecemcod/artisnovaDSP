const QobuzConnector = require('./connectors/QobuzConnector');
const fs = require('fs');

async function testQobuzCredentials() {
    try {
        console.log('=== TESTING QOBUZ CREDENTIALS ===\n');
        
        // Load config
        const config = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
        console.log('Loaded config:', {
            appId: config.appId,
            appSecret: config.appSecret ? 'Present' : 'Missing',
            baseURL: config.baseURL
        });
        
        // Create connector
        const qobuz = new QobuzConnector(config);
        
        // Test 1: Artist search
        console.log('\n1. Testing artist search...');
        const artistResults = await qobuz.searchArtist('Miles Davis', 3);
        console.log(`Found ${artistResults.length} artists`);
        
        if (artistResults.length > 0) {
            const artist = artistResults[0];
            console.log('First artist:', {
                id: artist.qobuz_id,
                name: artist.name,
                image: artist.image_url ? 'Present' : 'Missing'
            });
            
            // Test 2: Get full artist details
            console.log('\n2. Testing full artist details...');
            const fullArtist = await qobuz.getArtist(artist.qobuz_id);
            if (fullArtist) {
                console.log('Full artist data:', {
                    name: fullArtist.name,
                    biography: fullArtist.biography ? 'Present' : 'Missing',
                    similarArtists: fullArtist.similar_artists ? fullArtist.similar_artists.length : 0
                });
            } else {
                console.log('Failed to get full artist details');
            }
        }
        
        // Test 3: Album search
        console.log('\n3. Testing album search...');
        const albumResults = await qobuz.searchAlbum('Kind of Blue', 'Miles Davis', 3);
        console.log(`Found ${albumResults.length} albums`);
        
        if (albumResults.length > 0) {
            const album = albumResults[0];
            console.log('First album:', {
                id: album.qobuz_id,
                title: album.title,
                artist: album.artist_name,
                artwork: album.artwork_url ? 'Present' : 'Missing'
            });
            
            // Test 4: Get full album details (THIS IS KEY FOR TiVo REVIEWS)
            console.log('\n4. Testing full album details...');
            const fullAlbum = await qobuz.getAlbum(album.qobuz_id);
            if (fullAlbum) {
                console.log('Full album data:', {
                    title: fullAlbum.title,
                    description: fullAlbum.description ? 'Present (TiVo review!)' : 'Missing',
                    descriptionLength: fullAlbum.description ? fullAlbum.description.length : 0,
                    credits: fullAlbum.credits ? fullAlbum.credits.length : 0,
                    tracks: fullAlbum.tracks ? fullAlbum.tracks.length : 0
                });
                
                if (fullAlbum.description) {
                    console.log('\nDescription preview:', fullAlbum.description.substring(0, 200) + '...');
                }
            } else {
                console.log('Failed to get full album details');
            }
        }
        
        console.log('\n=== TEST COMPLETE ===');
        
    } catch (error) {
        console.error('Test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testQobuzCredentials();