const QobuzConnector = require('./connectors/QobuzConnector');
const fs = require('fs');

async function testQobuzConnector() {
    console.log('Testing Qobuz Connector...\n');

    // Load configuration if available
    let config = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            config = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
            console.log('✓ Loaded Qobuz configuration');
        } else {
            console.log('ℹ No Qobuz configuration found, using defaults');
        }
    } catch (error) {
        console.warn('⚠ Error loading Qobuz configuration:', error.message);
    }

    const qobuz = new QobuzConnector(config);

    try {
        // Test artist search
        console.log('\n1. Testing artist search for "Van Morrison"...');
        const artists = await qobuz.searchArtist('Van Morrison', 5);
        console.log(`✓ Found ${artists.length} artists`);
        if (artists.length > 0) {
            console.log('First result:', {
                name: artists[0].name,
                qobuz_id: artists[0].qobuz_id,
                image_url: artists[0].image_url ? 'Present' : 'Missing',
                albums_count: artists[0].albums_count
            });

            // Test getting detailed artist info
            if (artists[0].qobuz_id) {
                console.log('\n2. Testing detailed artist info...');
                const artistDetails = await qobuz.getArtist(artists[0].qobuz_id);
                if (artistDetails) {
                    console.log('✓ Got detailed artist info:', {
                        name: artistDetails.name,
                        biography: artistDetails.biography ? 'Present' : 'Missing',
                        image_url: artistDetails.image_url ? 'Present' : 'Missing',
                        similar_artists: artistDetails.similar_artists ? artistDetails.similar_artists.length : 0,
                        genres: artistDetails.genres ? artistDetails.genres.length : 0
                    });
                } else {
                    console.log('✗ No detailed artist info returned');
                }

                // Test getting artist albums
                console.log('\n3. Testing artist albums...');
                const albums = await qobuz.getArtistAlbums(artists[0].qobuz_id, 10);
                console.log(`✓ Found ${albums.length} albums`);
                if (albums.length > 0) {
                    console.log('First album:', {
                        title: albums[0].title,
                        artist_name: albums[0].artist_name,
                        release_date: albums[0].release_date,
                        artwork_url: albums[0].artwork_url ? 'Present' : 'Missing',
                        track_count: albums[0].track_count
                    });

                    // Test getting detailed album info
                    if (albums[0].qobuz_id) {
                        console.log('\n4. Testing detailed album info...');
                        const albumDetails = await qobuz.getAlbum(albums[0].qobuz_id);
                        if (albumDetails) {
                            console.log('✓ Got detailed album info:', {
                                title: albumDetails.title,
                                artist_name: albumDetails.artist_name,
                                tracks: albumDetails.tracks ? albumDetails.tracks.length : 0,
                                credits: albumDetails.credits ? albumDetails.credits.length : 0,
                                genres: albumDetails.genres ? albumDetails.genres.length : 0,
                                artwork_url: albumDetails.artwork_url ? 'Present' : 'Missing'
                            });
                        } else {
                            console.log('✗ No detailed album info returned');
                        }
                    }
                }
            }
        }

        // Test album search
        console.log('\n5. Testing album search for "Moondance"...');
        const albumResults = await qobuz.searchAlbum('Moondance', 'Van Morrison', 5);
        console.log(`✓ Found ${albumResults.length} albums`);
        if (albumResults.length > 0) {
            console.log('First result:', {
                title: albumResults[0].title,
                artist_name: albumResults[0].artist_name,
                release_date: albumResults[0].release_date,
                artwork_url: albumResults[0].artwork_url ? 'Present' : 'Missing',
                track_count: albumResults[0].track_count
            });
        }

        // Test track search
        console.log('\n6. Testing track search for "Brown Eyed Girl"...');
        const trackResults = await qobuz.searchTrack('Brown Eyed Girl', 'Van Morrison', null, 5);
        console.log(`✓ Found ${trackResults.length} tracks`);
        if (trackResults.length > 0) {
            console.log('First result:', {
                title: trackResults[0].title,
                artist_name: trackResults[0].artist_name,
                album_title: trackResults[0].album_title,
                duration: trackResults[0].duration,
                artwork_url: trackResults[0].artwork_url ? 'Present' : 'Missing'
            });
        }

        console.log('\n✅ All Qobuz connector tests completed successfully!');
        console.log(`\nReliability Score: ${qobuz.getReliabilityScore()}`);

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

// Run the test
testQobuzConnector().catch(console.error);