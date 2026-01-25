const axios = require('axios');

async function debugQobuzEndpoint() {
    try {
        console.log('=== DEBUGGING QOBUZ ENDPOINT ===\n');
        
        // First check if server is running
        console.log('1. Checking server status...');
        const statusResponse = await axios.get('http://localhost:3000/api/status');
        console.log('Server is running:', statusResponse.status === 200);
        
        // Test the artist-info endpoint with detailed logging
        console.log('\n2. Testing artist-info endpoint...');
        const testArtist = 'Miles Davis';
        const testAlbum = 'Kind of Blue';
        
        console.log(`Making request for: ${testArtist} - ${testAlbum}`);
        
        const response = await axios.get('http://localhost:3000/api/media/artist-info', {
            params: { artist: testArtist, album: testAlbum },
            timeout: 15000
        });
        
        console.log('\n3. Response Analysis:');
        console.log('Status:', response.status);
        console.log('Source:', response.data.source);
        
        console.log('\n4. Artist Data:');
        if (response.data.artist) {
            console.log('- Name:', response.data.artist.name);
            console.log('- Has Biography:', !!response.data.artist.biography);
            console.log('- Biography length:', response.data.artist.biography ? response.data.artist.biography.length : 0);
            console.log('- Source:', response.data.artist.source || 'Not specified');
            console.log('- Qobuz ID:', response.data.artist.qobuz_id || 'Not found');
        } else {
            console.log('- No artist data found');
        }
        
        console.log('\n5. Album Data:');
        if (response.data.album) {
            console.log('- Title:', response.data.album.title);
            console.log('- Has Description:', !!response.data.album.description);
            console.log('- Description length:', response.data.album.description ? response.data.album.description.length : 0);
            console.log('- Credits count:', response.data.album.credits ? response.data.album.credits.length : 0);
            console.log('- Source:', response.data.album.source || 'Not specified');
            console.log('- Qobuz ID:', response.data.album.qobuz_id || 'Not found');
            
            if (response.data.album.description) {
                console.log('- Description preview:', response.data.album.description.substring(0, 150) + '...');
            }
        } else {
            console.log('- No album data found');
        }
        
        // Test direct Qobuz search
        console.log('\n6. Testing direct Qobuz search...');
        try {
            const qobuzResponse = await axios.get('http://localhost:3000/api/test-qobuz-direct', {
                params: { artist: testArtist, album: testAlbum },
                timeout: 10000
            });
            console.log('Direct Qobuz test result:', qobuzResponse.data);
        } catch (qobuzError) {
            console.log('Direct Qobuz test failed:', qobuzError.message);
        }
        
    } catch (error) {
        console.error('Debug failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

debugQobuzEndpoint();