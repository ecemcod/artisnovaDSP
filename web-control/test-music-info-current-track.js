const axios = require('axios');

async function testCurrentTrackMusicInfo() {
    try {
        console.log('Testing Music Info for Currently Playing Track...\n');
        
        // First get the current track from Roon
        const nowPlayingResponse = await axios.get('http://localhost:3000/api/now-playing', {
            timeout: 10000
        });
        
        const currentTrack = nowPlayingResponse.data;
        console.log('Current Track from Roon:');
        console.log(`  Artist: ${currentTrack.artist}`);
        console.log(`  Album: ${currentTrack.album}`);
        console.log(`  Track: ${currentTrack.track}`);
        console.log('');
        
        if (!currentTrack.artist || !currentTrack.album) {
            console.log('❌ No current track playing or missing artist/album info');
            return;
        }
        
        // Test the artist-info endpoint with current track
        console.log('Testing /api/media/artist-info endpoint...');
        const artistInfoResponse = await axios.get('http://localhost:3000/api/media/artist-info', {
            params: {
                artist: currentTrack.artist,
                album: currentTrack.album
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
            
            if (musicInfo.album.description) {
                console.log('\n📝 ALBUM DESCRIPTION (TiVo Review):');
                console.log(musicInfo.album.description.substring(0, 200) + '...');
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

testCurrentTrackMusicInfo();