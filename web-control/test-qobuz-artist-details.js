const QobuzConnector = require('./connectors/QobuzConnector');

async function testQobuzArtistDetails() {
    try {
        console.log('Testing Qobuz Artist Details Directly...\n');
        
        // Load Qobuz config
        const fs = require('fs');
        let qobuzConfig = {};
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
            console.log('Loaded Qobuz config:', qobuzConfig);
        }
        
        const qobuzConnector = new QobuzConnector(qobuzConfig);
        
        // Test artist search
        console.log('1. Searching for Van Morrison...');
        const artistResults = await qobuzConnector.searchArtist('Van Morrison', 3);
        console.log(`Found ${artistResults.length} artists`);
        
        if (artistResults.length > 0) {
            const firstArtist = artistResults[0];
            console.log('\nFirst artist result:');
            console.log(`  Name: ${firstArtist.name}`);
            console.log(`  Qobuz ID: ${firstArtist.qobuz_id}`);
            console.log(`  Image URL: ${firstArtist.image_url ? 'YES' : 'NO'}`);
            console.log(`  Albums Count: ${firstArtist.albums_count}`);
            console.log(`  Source: ${firstArtist.source}`);
            
            // Test getting full artist details
            console.log(`\n2. Getting full artist details for ID ${firstArtist.qobuz_id}...`);
            const fullArtistData = await qobuzConnector.getArtist(firstArtist.qobuz_id);
            
            if (fullArtistData) {
                console.log('\nFull artist data:');
                console.log(`  Name: ${fullArtistData.name}`);
                console.log(`  Biography: ${fullArtistData.biography ? 'YES (' + fullArtistData.biography.length + ' chars)' : 'NO'}`);
                console.log(`  Image URL: ${fullArtistData.image_url ? 'YES' : 'NO'}`);
                console.log(`  Albums Count: ${fullArtistData.albums_count}`);
                console.log(`  Genres: ${fullArtistData.genres ? fullArtistData.genres.join(', ') : 'None'}`);
                console.log(`  Similar Artists: ${fullArtistData.similar_artists ? fullArtistData.similar_artists.length : 0}`);
                console.log(`  Qobuz ID: ${fullArtistData.qobuz_id}`);
                console.log(`  Source: ${fullArtistData.source}`);
                
                if (fullArtistData.biography) {
                    console.log('\n📝 ARTIST BIOGRAPHY:');
                    console.log(fullArtistData.biography.substring(0, 300) + '...');
                }
                
                if (fullArtistData.similar_artists && fullArtistData.similar_artists.length > 0) {
                    console.log('\n🎵 SIMILAR ARTISTS:');
                    fullArtistData.similar_artists.slice(0, 3).forEach(similar => {
                        console.log(`  ${similar.name} (ID: ${similar.qobuz_id})`);
                    });
                }
            } else {
                console.log('❌ Failed to get full artist details');
            }
        } else {
            console.log('❌ No artists found');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testQobuzArtistDetails();