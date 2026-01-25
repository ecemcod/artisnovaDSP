const axios = require('axios');

async function testVanMorrisonQobuz() {
    try {
        console.log('Testing Qobuz Integration with Van Morrison - Moondance...\n');
        
        // Test the artist-info endpoint with Van Morrison - Moondance
        console.log('Testing /api/media/artist-info endpoint...');
        const artistInfoResponse = await axios.get('http://localhost:3000/api/media/artist-info', {
            params: {
                artist: 'Van Morrison',
                album: 'Moondance'
            },
            timeout: 15000
        });
        
        const musicInfo = artistInfoResponse.data;
        console.log('\n=== MUSIC INFO RESPONSE ===');
        console.log(`Source: ${musicInfo.source}`);
        console.log('');
        
        // Artist Info
        if (musicInfo.artist) {
            console.log('🎤 ARTIST INFO:');
            console.log(`  Name: ${musicInfo.artist.name}`);
            console.log(`  Biography: ${musicInfo.artist.biography ? 'YES (' + musicInfo.artist.biography.length + ' chars)' : 'NO'}`);
            console.log(`  Image URL: ${musicInfo.artist.image_url ? 'YES' : 'NO'}`);
            console.log(`  Genres: ${musicInfo.artist.genres ? musicInfo.artist.genres.join(', ') : 'None'}`);
            console.log(`  Albums Count: ${musicInfo.artist.albums_count || 'Unknown'}`);
            console.log(`  Qobuz ID: ${musicInfo.artist.qobuz_id || 'None'}`);
            console.log(`  Source: ${musicInfo.artist.source || 'Unknown'}`);
        } else {
            console.log('🎤 ARTIST INFO: None');
        }
        console.log('');
        
        // Album Info
        if (musicInfo.album) {
            console.log('💿 ALBUM INFO:');
            console.log(`  Title: ${musicInfo.album.title}`);
            console.log(`  Artist: ${musicInfo.album.artist_name}`);
            console.log(`  Release Date: ${musicInfo.album.release_date || 'Unknown'}`);
            console.log(`  Label: ${musicInfo.album.label_name || 'Unknown'}`);
            console.log(`  Track Count: ${musicInfo.album.track_count || 'Unknown'}`);
            console.log(`  Artwork URL: ${musicInfo.album.artwork_url ? 'YES' : 'NO'}`);
            console.log(`  Description (TiVo Review): ${musicInfo.album.description ? 'YES (' + musicInfo.album.description.length + ' chars)' : 'NO'}`);
            console.log(`  Credits: ${musicInfo.album.credits ? musicInfo.album.credits.length + ' entries' : 'None'}`);
            console.log(`  Tracks: ${musicInfo.album.tracks ? musicInfo.album.tracks.length + ' entries' : 'None'}`);
            console.log(`  Qobuz ID: ${musicInfo.album.qobuz_id || 'None'}`);
            console.log(`  Source: ${musicInfo.album.source || 'Unknown'}`);
            
            if (musicInfo.album.description) {
                console.log('\n📝 ALBUM DESCRIPTION (TiVo Review):');
                console.log(musicInfo.album.description.substring(0, 300) + '...');
            }
            
            if (musicInfo.album.credits && musicInfo.album.credits.length > 0) {
                console.log('\n🎵 ALBUM CREDITS:');
                musicInfo.album.credits.slice(0, 5).forEach(credit => {
                    console.log(`  ${credit.person_name || credit.name}: ${credit.role}`);
                });
                if (musicInfo.album.credits.length > 5) {
                    console.log(`  ... and ${musicInfo.album.credits.length - 5} more`);
                }
            }
            
            if (musicInfo.album.tracks && musicInfo.album.tracks.length > 0) {
                console.log('\n🎵 TRACK LISTING (first 5):');
                musicInfo.album.tracks.slice(0, 5).forEach(track => {
                    console.log(`  ${track.track_number || track.number}. ${track.title} (${track.duration})`);
                });
                if (musicInfo.album.tracks.length > 5) {
                    console.log(`  ... and ${musicInfo.album.tracks.length - 5} more tracks`);
                }
            }
        } else {
            console.log('💿 ALBUM INFO: None');
        }
        
        console.log('\n=== SUMMARY ===');
        if (musicInfo.source === 'Qobuz Enhanced') {
            console.log('✅ SUCCESS: Rich Qobuz data retrieved');
            console.log(`✅ Artist data: ${musicInfo.artist ? 'YES' : 'NO'}`);
            console.log(`✅ Album data: ${musicInfo.album ? 'YES' : 'NO'}`);
            console.log(`✅ TiVo review: ${musicInfo.album?.description ? 'YES' : 'NO'}`);
            console.log(`✅ Album credits: ${musicInfo.album?.credits?.length > 0 ? 'YES' : 'NO'}`);
            console.log(`✅ Track listing: ${musicInfo.album?.tracks?.length > 0 ? 'YES' : 'NO'}`);
        } else {
            console.log('⚠️  WARNING: Using fallback data source');
            console.log(`   Source: ${musicInfo.source}`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testVanMorrisonQobuz();