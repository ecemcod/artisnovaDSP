const axios = require('axios');

async function testAudioDBDirect() {
    try {
        console.log('Testing AudioDB Direct API...\n');
        
        const artist = 'Van Morrison';
        const url = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(artist)}`;
        
        console.log(`Making request to: ${url}`);
        const res = await axios.get(url, { timeout: 4000 });
        
        const adbArtist = res.data?.artists?.[0];
        
        if (adbArtist) {
            console.log('✅ AudioDB Result Found:');
            console.log(`  Name: ${adbArtist.strArtist}`);
            console.log(`  Biography: ${adbArtist.strBiographyEN ? 'YES (' + adbArtist.strBiographyEN.length + ' chars)' : 'NO'}`);
            console.log(`  Formed: ${adbArtist.intFormedYear || 'Unknown'}`);
            console.log(`  Country: ${adbArtist.strCountry || 'Unknown'}`);
            console.log(`  Style: ${adbArtist.strStyle || 'Unknown'}`);
            console.log(`  Genre: ${adbArtist.strGenre || 'Unknown'}`);
            console.log(`  Image: ${adbArtist.strArtistThumb ? 'YES' : 'NO'}`);
            
            if (adbArtist.strBiographyEN) {
                console.log('\n📝 AUDIODB BIOGRAPHY (first 300 chars):');
                console.log(adbArtist.strBiographyEN.substring(0, 300) + '...');
            }
            
            // Test the formatted result
            const formattedResult = {
                name: adbArtist.strArtist || artist,
                biography: adbArtist.strBiographyEN || null,
                formed: adbArtist.intFormedYear || 'Unknown',
                country: adbArtist.strCountry || 'Unknown',
                tags: [adbArtist.strStyle, adbArtist.strGenre]
                    .filter(Boolean)
                    .filter(t => !['music', 'unknown'].includes(t.toLowerCase().trim())),
                image: adbArtist.strArtistThumb || null,
                source: 'TheAudioDB'
            };
            
            console.log('\n🎯 FORMATTED RESULT:');
            console.log(JSON.stringify(formattedResult, null, 2));
            
        } else {
            console.log('❌ No AudioDB results found');
            console.log('Response data:', res.data);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testAudioDBDirect();