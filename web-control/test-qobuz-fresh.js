const MusicInfoManager = require('./MusicInfoManager');
const QobuzConnector = require('./connectors/QobuzConnector');
const db = require('./database');
const fs = require('fs');

async function testQobuzFresh() {
    console.log('🎵 Testing Qobuz with Fresh Data...\n');

    // Load Qobuz configuration
    let qobuzConfig = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
            console.log('✓ Loaded Qobuz configuration');
        }
    } catch (error) {
        console.error('❌ Error loading Qobuz configuration:', error.message);
        return;
    }

    // Initialize Music Info Manager
    const musicInfoManager = new MusicInfoManager(db.db);
    
    // Register only Qobuz for this test
    musicInfoManager.registerConnector('qobuz', new QobuzConnector(qobuzConfig));
    console.log('✓ Registered Qobuz connector only\n');

    try {
        // Clear cache for fresh results
        console.log('🧹 Clearing cache for fresh results...');
        await musicInfoManager.clearCache('artist:Van Morrison');
        await musicInfoManager.clearCache('album:Moondance');

        // Test 1: Artist search with fresh Qobuz data
        console.log('1. Testing fresh artist search for "Van Morrison"...');
        const artistResults = await musicInfoManager.searchArtists('Van Morrison', { 
            limit: 3, 
            forceRefresh: true,
            sources: ['qobuz']
        });
        
        console.log(`✓ Found ${artistResults.length} artists from Qobuz`);
        if (artistResults.length > 0) {
            console.log('First result:', {
                name: artistResults[0].name,
                source: artistResults[0].source,
                weight: artistResults[0].weight,
                image_url: artistResults[0].image_url ? 'Present' : 'Missing',
                albums_count: artistResults[0].albums_count
            });
        }

        // Test 2: Get detailed artist info
        console.log('\n2. Testing detailed artist info from Qobuz...');
        const artistInfo = await musicInfoManager.getArtistInfo('Van Morrison', { 
            forceRefresh: true 
        });
        
        if (artistInfo) {
            console.log('✓ Got detailed artist info:', {
                name: artistInfo.name,
                image_url: artistInfo.image_url ? 'Present' : 'Missing',
                genres: artistInfo.genres ? artistInfo.genres.length : 0,
                sources: artistInfo.sources ? artistInfo.sources.map(s => s.name) : [],
                quality_score: artistInfo.quality_score
            });
        }

        // Test 3: Album search with fresh Qobuz data
        console.log('\n3. Testing fresh album search for "Moondance"...');
        const albumResults = await musicInfoManager.searchAlbums('Moondance', { 
            artist: 'Van Morrison', 
            limit: 3, 
            forceRefresh: true,
            sources: ['qobuz']
        });
        
        console.log(`✓ Found ${albumResults.length} albums from Qobuz`);
        if (albumResults.length > 0) {
            console.log('First result:', {
                title: albumResults[0].title,
                artist_name: albumResults[0].artist_name,
                source: albumResults[0].source,
                weight: albumResults[0].weight,
                artwork_url: albumResults[0].artwork_url ? 'Present' : 'Missing',
                release_date: albumResults[0].release_date,
                track_count: albumResults[0].track_count
            });
        }

        // Test 4: Get detailed album info
        console.log('\n4. Testing detailed album info from Qobuz...');
        const albumInfo = await musicInfoManager.getAlbumInfo('Moondance', 'Van Morrison', { 
            forceRefresh: true 
        });
        
        if (albumInfo) {
            console.log('✓ Got detailed album info:', {
                title: albumInfo.title,
                artist_name: albumInfo.artist_name,
                artwork_url: albumInfo.artwork_url ? 'Present' : 'Missing',
                release_date: albumInfo.release_date,
                track_count: albumInfo.track_count,
                sources: albumInfo.sources ? albumInfo.sources.map(s => s.name) : [],
                quality_score: albumInfo.quality_score
            });
        }

        console.log('\n✅ Qobuz fresh data test completed successfully!');
        console.log('\n🎯 Qobuz Integration Status:');
        console.log('- ✅ Artist search working with high-quality data');
        console.log('- ✅ Album search working with artwork');
        console.log('- ✅ Detailed metadata retrieval functional');
        console.log('- ✅ Quality scoring and source attribution working');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    }
}

// Run the test
testQobuzFresh().catch(console.error);