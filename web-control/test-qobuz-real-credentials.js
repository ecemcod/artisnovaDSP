const QobuzConnector = require('./connectors/QobuzConnector');
const fs = require('fs');

async function testRealQobuzCredentials() {
    console.log('🎵 Testing Real Qobuz Credentials...\n');

    // Load config
    let config = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            config = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
            console.log('📋 Loaded config:');
            console.log('   App ID:', config.appId);
            console.log('   App Secret:', config.appSecret ? `${config.appSecret.substring(0, 8)}...` : 'Missing');
            console.log('   Base URL:', config.baseURL);
        } else {
            console.log('❌ No qobuz-config.json found');
            return;
        }
    } catch (error) {
        console.error('❌ Error loading config:', error.message);
        return;
    }

    // Test with QobuzConnector
    console.log('\n🔌 Testing with QobuzConnector...');
    try {
        const qobuz = new QobuzConnector(config);
        
        // Test artist search
        console.log('   Searching for "Van Morrison"...');
        const artistResults = await qobuz.searchArtist('Van Morrison', 3);
        
        if (artistResults && artistResults.length > 0) {
            console.log('✅ Artist search successful!');
            artistResults.forEach((artist, index) => {
                console.log(`   ${index + 1}. ${artist.name}`);
                console.log(`      Qobuz ID: ${artist.qobuz_id}`);
                console.log(`      Image: ${artist.image_url ? 'Present' : 'Missing'}`);
                console.log(`      Albums: ${artist.albums_count}`);
                console.log(`      Source: ${artist.source}`);
            });

            // Test getting detailed artist info
            const mainArtist = artistResults[0];
            console.log(`\n   Getting detailed info for "${mainArtist.name}"...`);
            const artistDetails = await qobuz.getArtist(mainArtist.qobuz_id);
            
            if (artistDetails) {
                console.log('✅ Detailed artist info retrieved!');
                console.log(`      Name: ${artistDetails.name}`);
                console.log(`      Image: ${artistDetails.image_url ? 'Present' : 'Missing'}`);
                console.log(`      Biography: ${artistDetails.biography ? 'Present' : 'Missing'}`);
                console.log(`      Genres: ${artistDetails.genres ? artistDetails.genres.length : 0}`);
                console.log(`      Similar Artists: ${artistDetails.similar_artists ? artistDetails.similar_artists.length : 0}`);
            }

            // Test album search
            console.log('\n   Searching for "Moondance" album...');
            const albumResults = await qobuz.searchAlbum('Moondance', 'Van Morrison', 3);
            
            if (albumResults && albumResults.length > 0) {
                console.log('✅ Album search successful!');
                albumResults.forEach((album, index) => {
                    console.log(`   ${index + 1}. ${album.title}`);
                    console.log(`      Artist: ${album.artist_name}`);
                    console.log(`      Qobuz ID: ${album.qobuz_id}`);
                    console.log(`      Artwork: ${album.artwork_url ? 'Present' : 'Missing'}`);
                    console.log(`      Release Date: ${album.release_date}`);
                    console.log(`      Tracks: ${album.track_count}`);
                });
            } else {
                console.log('⚠️  No albums found');
            }

        } else {
            console.log('❌ No artists found');
        }

    } catch (error) {
        console.log('❌ QobuzConnector failed:', error.message);
        console.log('   Full error:', error);
    }

    // Test our API integration
    console.log('\n🌐 Testing our API integration...');
    const axios = require('axios');
    try {
        const response = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: 'Van Morrison',
                type: 'artist',
                forceRefresh: true
            }
        });
        
        console.log('✅ Our API response:');
        if (response.data.artists && response.data.artists.length > 0) {
            const artist = response.data.artists[0];
            console.log(`   Name: ${artist.name}`);
            console.log(`   Source: ${artist.source}`);
            console.log(`   Image URL: ${artist.image_url ? 'Present' : 'Missing'}`);
            console.log(`   Qobuz ID: ${artist.qobuz_id || 'Missing'}`);
            console.log(`   Weight: ${artist.weight}`);
            
            if (artist.image_url) {
                console.log(`   Image URL: ${artist.image_url}`);
            }
        } else {
            console.log('   No artists found in our API');
        }
    } catch (error) {
        console.log('❌ Our API failed:', error.message);
    }
}

testRealQobuzCredentials().catch(console.error);