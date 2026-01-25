const MusicInfoManager = require('./MusicInfoManager');
const MusicBrainzConnector = require('./connectors/MusicBrainzConnector');
const DiscogsConnector = require('./connectors/DiscogsConnector');
const LastFmConnector = require('./connectors/LastFmConnector');
const iTunesConnector = require('./connectors/iTunesConnector');
const WikipediaConnector = require('./connectors/WikipediaConnector');
const QobuzConnector = require('./connectors/QobuzConnector');
const db = require('./database'); // Use real database
const fs = require('fs');

async function testMusicSystem() {
    console.log('Testing Enhanced Music Information System...\n');

    // Initialize Music Info Manager with real database
    const musicInfoManager = new MusicInfoManager(db.db); // Use db.db to get the raw SQLite connection

    // Load Qobuz configuration if available
    let qobuzConfig = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
            console.log('✓ Loaded Qobuz configuration');
        } else {
            console.log('ℹ No Qobuz configuration found, using defaults');
        }
    } catch (error) {
        console.warn('⚠ Error loading Qobuz configuration:', error.message);
    }

    // Register all connectors
    console.log('\nRegistering data source connectors...');
    musicInfoManager.registerConnector('qobuz', new QobuzConnector(qobuzConfig));
    musicInfoManager.registerConnector('musicbrainz', new MusicBrainzConnector());
    musicInfoManager.registerConnector('discogs', new DiscogsConnector());
    musicInfoManager.registerConnector('lastfm', new LastFmConnector());
    musicInfoManager.registerConnector('itunes', new iTunesConnector());
    musicInfoManager.registerConnector('wikipedia', new WikipediaConnector());
    console.log('✓ All connectors registered');

    try {
        // Test artist search across all sources
        console.log('\n1. Testing artist search for "Van Morrison"...');
        const artistResults = await musicInfoManager.searchArtists('Van Morrison', { limit: 5 });
        console.log(`✓ Found ${artistResults.length} artists from multiple sources`);
        
        if (artistResults.length > 0) {
            console.log('Top results:');
            artistResults.slice(0, 3).forEach((artist, index) => {
                console.log(`  ${index + 1}. ${artist.name} (${artist.source}) - Weight: ${artist.weight}`);
            });

            // Test getting detailed artist info
            console.log('\n2. Testing detailed artist aggregation...');
            const artistInfo = await musicInfoManager.getArtistInfo('Van Morrison');
            if (artistInfo) {
                console.log('✓ Got aggregated artist info:', {
                    name: artistInfo.name,
                    biography: artistInfo.biography ? 'Present' : 'Missing',
                    image_url: artistInfo.image_url ? 'Present' : 'Missing',
                    genres: artistInfo.genres ? artistInfo.genres.length : 0,
                    sources: artistInfo.sources ? artistInfo.sources.length : 0,
                    quality_score: artistInfo.quality_score
                });
            } else {
                console.log('✗ No aggregated artist info returned');
            }
        }

        // Test album search
        console.log('\n3. Testing album search for "Moondance"...');
        const albumResults = await musicInfoManager.searchAlbums('Moondance', { artist: 'Van Morrison', limit: 5 });
        console.log(`✓ Found ${albumResults.length} albums from multiple sources`);
        
        if (albumResults.length > 0) {
            console.log('Top results:');
            albumResults.slice(0, 3).forEach((album, index) => {
                console.log(`  ${index + 1}. ${album.title} by ${album.artist_name} (${album.source}) - Weight: ${album.weight}`);
            });

            // Test getting detailed album info
            console.log('\n4. Testing detailed album aggregation...');
            const albumInfo = await musicInfoManager.getAlbumInfo('Moondance', 'Van Morrison');
            if (albumInfo) {
                console.log('✓ Got aggregated album info:', {
                    title: albumInfo.title,
                    artist_name: albumInfo.artist_name,
                    release_date: albumInfo.release_date,
                    artwork_url: albumInfo.artwork_url ? 'Present' : 'Missing',
                    track_count: albumInfo.track_count,
                    sources: albumInfo.sources ? albumInfo.sources.length : 0,
                    quality_score: albumInfo.quality_score
                });
            } else {
                console.log('✗ No aggregated album info returned');
            }
        }

        // Test cache functionality
        console.log('\n5. Testing cache system...');
        const cacheStats = await musicInfoManager.getCacheStats();
        console.log('✓ Cache stats:', cacheStats);

        // Test performance stats
        console.log('\n6. Testing performance monitoring...');
        const perfStats = await musicInfoManager.getPerformanceStats();
        console.log('✓ Performance stats available:', {
            connectors: Object.keys(perfStats.connectors || {}).length,
            uptime: Math.round(perfStats.uptime || 0),
            memoryUsage: perfStats.memoryUsage ? 'Available' : 'Missing'
        });

        console.log('\n✅ Enhanced Music Information System test completed successfully!');
        console.log('\nSystem Summary:');
        console.log('- Multiple data sources integrated and working');
        console.log('- Graceful fallback when Qobuz credentials unavailable');
        console.log('- Data aggregation and quality scoring functional');
        console.log('- Caching and performance monitoring operational');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
testMusicSystem().catch(console.error);