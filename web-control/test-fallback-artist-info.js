const MusicInfoManager = require('./MusicInfoManager');
const db = require('./database');

async function testFallbackArtistInfo() {
    try {
        console.log('Testing Fallback Artist Info Sources...\n');
        
        // Initialize MusicInfoManager
        const musicInfoManager = new MusicInfoManager(db.db);
        
        // Test MusicInfoManager
        console.log('1. Testing MusicInfoManager.getArtistInfo...');
        try {
            const artistInfo = await musicInfoManager.getArtistInfo('Van Morrison');
            console.log('MusicInfoManager result:');
            console.log(`  Name: ${artistInfo?.name || 'N/A'}`);
            console.log(`  Biography: ${artistInfo?.biography || artistInfo?.bio ? 'YES (' + (artistInfo.biography || artistInfo.bio).length + ' chars)' : 'NO'}`);
            console.log(`  Country: ${artistInfo?.country || 'N/A'}`);
            console.log(`  Active Years: ${artistInfo?.activeYears || artistInfo?.formed || 'N/A'}`);
            console.log(`  Tags: ${artistInfo?.tags || 'N/A'}`);
            console.log(`  Artist URL: ${artistInfo?.artistUrl ? 'YES' : 'NO'}`);
        } catch (error) {
            console.log('MusicInfoManager failed:', error.message);
        }
        
        console.log('\n2. Testing direct getArtistInfo function...');
        
        // We need to import the getArtistInfo function from server.js
        // Since it's not exported, let's test the components it uses
        
        // Test MusicBrainz directly
        const MusicBrainzConnector = require('./connectors/MusicBrainzConnector');
        const mbConnector = new MusicBrainzConnector();
        
        console.log('Testing MusicBrainz connector...');
        try {
            const mbResult = await mbConnector.searchArtist('Van Morrison', 1);
            if (mbResult.length > 0) {
                const artist = mbResult[0];
                console.log('MusicBrainz result:');
                console.log(`  Name: ${artist.name}`);
                console.log(`  Country: ${artist.country || 'N/A'}`);
                console.log(`  Active Years: ${artist.activeYears || artist.formed || 'N/A'}`);
                console.log(`  Tags: ${artist.tags || 'N/A'}`);
                console.log(`  MBID: ${artist.mbid || 'N/A'}`);
            } else {
                console.log('No MusicBrainz results found');
            }
        } catch (error) {
            console.log('MusicBrainz failed:', error.message);
        }
        
        // Test Wikipedia connector
        console.log('\n3. Testing Wikipedia connector...');
        const WikipediaConnector = require('./connectors/WikipediaConnector');
        const wikiConnector = new WikipediaConnector();
        
        try {
            const wikiResult = await wikiConnector.getArtistInfo('Van Morrison');
            if (wikiResult) {
                console.log('Wikipedia result:');
                console.log(`  Name: ${wikiResult.name}`);
                console.log(`  Biography: ${wikiResult.biography ? 'YES (' + wikiResult.biography.length + ' chars)' : 'NO'}`);
                console.log(`  Artist URL: ${wikiResult.artistUrl ? 'YES' : 'NO'}`);
                
                if (wikiResult.biography) {
                    console.log('\n📝 WIKIPEDIA BIOGRAPHY (first 200 chars):');
                    console.log(wikiResult.biography.substring(0, 200) + '...');
                }
            } else {
                console.log('No Wikipedia results found');
            }
        } catch (error) {
            console.log('Wikipedia failed:', error.message);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testFallbackArtistInfo();