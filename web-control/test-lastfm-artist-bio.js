const LastFmConnector = require('./connectors/LastFmConnector');

async function testLastFmArtistBio() {
    try {
        console.log('Testing Last.fm Artist Biography...\n');
        
        const lastfmConnector = new LastFmConnector();
        
        console.log('Testing Last.fm getArtistInfo for Van Morrison...');
        const artistInfo = await lastfmConnector.getArtistInfo('Van Morrison');
        
        if (artistInfo) {
            console.log('Last.fm result:');
            console.log(`  Name: ${artistInfo.name}`);
            console.log(`  Biography: ${artistInfo.biography ? 'YES (' + artistInfo.biography.length + ' chars)' : 'NO'}`);
            console.log(`  Tags: ${artistInfo.tags ? artistInfo.tags.join(', ') : 'None'}`);
            console.log(`  Similar Artists: ${artistInfo.similar ? artistInfo.similar.length : 0}`);
            console.log(`  Image URL: ${artistInfo.image_url ? 'YES' : 'NO'}`);
            
            if (artistInfo.biography) {
                console.log('\n📝 LAST.FM BIOGRAPHY (first 300 chars):');
                console.log(artistInfo.biography.substring(0, 300) + '...');
            }
            
            if (artistInfo.tags && artistInfo.tags.length > 0) {
                console.log('\n🏷️ TAGS:');
                console.log(artistInfo.tags.slice(0, 5).join(', '));
            }
        } else {
            console.log('❌ No Last.fm results found');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

testLastFmArtistBio();