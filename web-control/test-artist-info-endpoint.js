const axios = require('axios');

async function testArtistInfoEndpoint() {
    try {
        console.log('Testing /api/media/artist-info endpoint...\n');
        
        // Test with a known artist/album
        const testCases = [
            { artist: 'Miles Davis', album: 'Kind of Blue' },
            { artist: 'The Beatles', album: 'Abbey Road' }
        ];
        
        for (const testCase of testCases) {
            console.log(`\n=== Testing: ${testCase.artist} - ${testCase.album} ===`);
            
            try {
                const response = await axios.get('http://localhost:3000/api/media/artist-info', {
                    params: testCase,
                    timeout: 15000
                });
                
                console.log('Response status:', response.status);
                console.log('Response source:', response.data.source);
                
                if (response.data.artist) {
                    console.log('Artist data found:', {
                        name: response.data.artist.name,
                        biography: response.data.artist.biography ? 'Yes' : 'No',
                        source: response.data.artist.source || 'Unknown'
                    });
                }
                
                if (response.data.album) {
                    console.log('Album data found:', {
                        title: response.data.album.title,
                        description: response.data.album.description ? 'Yes (TiVo review)' : 'No',
                        credits: response.data.album.credits ? response.data.album.credits.length : 0,
                        source: response.data.album.source || 'Unknown'
                    });
                    
                    if (response.data.album.description) {
                        console.log('Album description preview:', response.data.album.description.substring(0, 200) + '...');
                    }
                }
                
            } catch (error) {
                console.error('Request failed:', error.message);
                if (error.response) {
                    console.error('Response status:', error.response.status);
                    console.error('Response data:', error.response.data);
                }
            }
        }
        
    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

testArtistInfoEndpoint();