const axios = require('axios');

async function testEnhancedArtistInfo() {
    console.log('🎵 TESTING ENHANCED ARTIST-INFO ENDPOINT');
    console.log('============================================\n');

    try {
        // Test with current playing track
        const artist = 'Van Morrison';
        const album = 'Three Chords And The Truth';
        
        console.log(`📻 Testing with: "${album}" by "${artist}"`);
        console.log('-------------------------------------------\n');

        const response = await axios.get('http://localhost:3000/api/media/artist-info', {
            params: { artist, album },
            timeout: 15000
        });

        const data = response.data;
        
        console.log('✅ RESPONSE RECEIVED');
        console.log(`📊 Source: ${data.source}`);
        console.log('');

        // Test Artist Data
        if (data.artist) {
            console.log('👤 ARTIST DATA:');
            console.log(`   Name: ${data.artist.name || 'N/A'}`);
            console.log(`   Source: ${data.artist.source || 'N/A'}`);
            console.log(`   Biography: ${data.artist.biography ? 'Available (' + data.artist.biography.length + ' chars)' : 'Not available'}`);
            console.log(`   Image URL: ${data.artist.image_url ? 'Available' : 'Not available'}`);
            console.log(`   Albums Count: ${data.artist.albums_count || 'N/A'}`);
            console.log(`   Genres: ${data.artist.genres ? data.artist.genres.join(', ') : 'N/A'}`);
            console.log('');
        } else {
            console.log('❌ No artist data found');
        }

        // Test Album Data
        if (data.album) {
            console.log('💿 ALBUM DATA:');
            console.log(`   Title: ${data.album.title || 'N/A'}`);
            console.log(`   Artist: ${data.album.artist_name || 'N/A'}`);
            console.log(`   Source: ${data.album.source || 'N/A'}`);
            console.log(`   Release Date: ${data.album.release_date || 'N/A'}`);
            console.log(`   Label: ${data.album.label_name || data.album.label || 'N/A'}`);
            console.log(`   Track Count: ${data.album.track_count || data.album.trackCount || 'N/A'}`);
            console.log(`   Artwork URL: ${data.album.artwork_url ? 'Available' : 'Not available'}`);
            console.log(`   Genres: ${data.album.genres ? data.album.genres.join(', ') : 'N/A'}`);
            console.log('');
            
            // Check for TiVo description
            if (data.album.description) {
                console.log('📝 ALBUM DESCRIPTION (TiVo):');
                console.log(`   Length: ${data.album.description.length} characters`);
                console.log(`   Preview: ${data.album.description.substring(0, 200)}...`);
                console.log('   ✅ TiVo review available!');
                console.log('');
            } else {
                console.log('❌ No album description/review found');
            }
            
            // Check for credits
            if (data.album.credits && data.album.credits.length > 0) {
                console.log('👥 ALBUM CREDITS:');
                data.album.credits.forEach((credit, index) => {
                    console.log(`   ${index + 1}. ${credit.person_name || credit.name}: ${credit.role}`);
                });
                console.log('   ✅ Credits available!');
                console.log('');
            } else {
                console.log('❌ No album credits found');
            }
            
            // Check for tracklist
            if (data.album.tracks && data.album.tracks.length > 0) {
                console.log('🎵 TRACKLIST:');
                console.log(`   Total tracks: ${data.album.tracks.length}`);
                data.album.tracks.slice(0, 5).forEach((track, index) => {
                    console.log(`   ${track.track_number || index + 1}. ${track.title} (${track.duration ? Math.floor(track.duration / 60) + ':' + (track.duration % 60).toString().padStart(2, '0') : 'N/A'})`);
                });
                if (data.album.tracks.length > 5) {
                    console.log(`   ... and ${data.album.tracks.length - 5} more tracks`);
                }
                console.log('   ✅ Tracklist available!');
                console.log('');
            } else if (data.album.tracklist && data.album.tracklist.length > 0) {
                console.log('🎵 TRACKLIST (Legacy format):');
                console.log(`   Total tracks: ${data.album.tracklist.length}`);
                data.album.tracklist.slice(0, 5).forEach((track, index) => {
                    console.log(`   ${track.number || index + 1}. ${track.title} (${track.duration || 'N/A'})`);
                });
                if (data.album.tracklist.length > 5) {
                    console.log(`   ... and ${data.album.tracklist.length - 5} more tracks`);
                }
                console.log('   ✅ Tracklist available!');
                console.log('');
            } else {
                console.log('❌ No tracklist found');
            }
        } else {
            console.log('❌ No album data found');
        }

        console.log('============================================');
        console.log('🎯 TEST COMPLETED SUCCESSFULLY');
        
        // Summary
        const hasDescription = data.album?.description;
        const hasCredits = data.album?.credits && data.album.credits.length > 0;
        const hasQobuzSource = data.album?.source === 'qobuz' || data.artist?.source === 'qobuz';
        
        console.log('\n📊 SUMMARY:');
        console.log(`   Qobuz Integration: ${hasQobuzSource ? '✅' : '❌'}`);
        console.log(`   TiVo Description: ${hasDescription ? '✅' : '❌'}`);
        console.log(`   Album Credits: ${hasCredits ? '✅' : '❌'}`);
        
        if (hasQobuzSource && hasDescription && hasCredits) {
            console.log('\n🎉 ALL FEATURES WORKING CORRECTLY!');
        } else {
            console.log('\n⚠️  Some features may need attention');
        }

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testEnhancedArtistInfo();