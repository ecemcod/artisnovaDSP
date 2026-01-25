const axios = require('axios');
const QobuzConnector = require('./connectors/QobuzConnector');
const fs = require('fs');

async function showCompleteQobuzInfo() {
    console.log('🎵 INFORMACIÓN COMPLETA DE QOBUZ - TRACK ACTUAL\n');
    console.log('='.repeat(60));

    // 1. Obtener track actual
    console.log('\n📻 1. TRACK ACTUAL');
    console.log('-'.repeat(30));
    
    let currentTrack = {};
    try {
        const mediaResponse = await axios.get('http://localhost:3000/api/media/info?source=roon');
        if (mediaResponse.data && mediaResponse.data.track) {
            currentTrack = {
                track: mediaResponse.data.track,
                artist: mediaResponse.data.artist,
                album: mediaResponse.data.album,
                year: mediaResponse.data.year,
                duration: mediaResponse.data.duration,
                position: mediaResponse.data.position,
                state: mediaResponse.data.state
            };
            
            console.log(`🎵 Track: "${currentTrack.track}"`);
            console.log(`👤 Artist: "${currentTrack.artist}"`);
            console.log(`💿 Album: "${currentTrack.album}"`);
            console.log(`📅 Year: ${currentTrack.year || 'Unknown'}`);
            console.log(`⏱️  Duration: ${currentTrack.duration || 'Unknown'}`);
            console.log(`▶️  State: ${currentTrack.state || 'Unknown'}`);
        } else {
            console.log('❌ No hay track sonando actualmente');
            return;
        }
    } catch (error) {
        console.log('❌ Error obteniendo track actual:', error.message);
        return;
    }

    // 2. Cargar configuración de Qobuz
    let qobuzConfig = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
        }
    } catch (error) {
        console.log('❌ Error cargando configuración Qobuz:', error.message);
        return;
    }

    const qobuz = new QobuzConnector(qobuzConfig);

    // 3. Información del ARTISTA desde Qobuz
    console.log('\n👤 2. INFORMACIÓN DEL ARTISTA (QOBUZ)');
    console.log('-'.repeat(40));
    
    try {
        const artistResults = await qobuz.searchArtist(currentTrack.artist, 5);
        
        if (artistResults && artistResults.length > 0) {
            const mainArtist = artistResults[0];
            console.log(`✅ Artista encontrado en Qobuz:`);
            console.log(`   Nombre: ${mainArtist.name}`);
            console.log(`   Qobuz ID: ${mainArtist.qobuz_id}`);
            console.log(`   Álbumes en catálogo: ${mainArtist.albums_count}`);
            console.log(`   Imagen: ${mainArtist.image_url || 'No disponible'}`);
            console.log(`   Fuente: ${mainArtist.source}`);
            
            // Otros artistas similares encontrados
            if (artistResults.length > 1) {
                console.log(`\n   📋 Otros artistas encontrados:`);
                artistResults.slice(1).forEach((artist, index) => {
                    console.log(`   ${index + 2}. ${artist.name} (${artist.albums_count} álbumes)`);
                });
            }

            // Intentar obtener información detallada del artista
            console.log(`\n   🔍 Información detallada del artista:`);
            try {
                const artistDetails = await qobuz.getArtist(mainArtist.qobuz_id);
                if (artistDetails) {
                    console.log(`   ✅ Detalles obtenidos:`);
                    console.log(`      Biografía: ${artistDetails.biography ? 'Disponible' : 'No disponible'}`);
                    console.log(`      Géneros: ${artistDetails.genres ? artistDetails.genres.map(g => g.name).join(', ') : 'No disponible'}`);
                    console.log(`      Artistas similares: ${artistDetails.similar_artists ? artistDetails.similar_artists.length : 0}`);
                    
                    if (artistDetails.biography) {
                        console.log(`\n   📖 Biografía (primeras 200 caracteres):`);
                        console.log(`      ${artistDetails.biography.substring(0, 200)}...`);
                    }
                } else {
                    console.log(`   ⚠️  No se pudieron obtener detalles adicionales`);
                }
            } catch (error) {
                console.log(`   ⚠️  Error obteniendo detalles: ${error.message}`);
            }

        } else {
            console.log(`❌ Artista "${currentTrack.artist}" no encontrado en Qobuz`);
        }
    } catch (error) {
        console.log(`❌ Error buscando artista: ${error.message}`);
    }

    // 4. Información del ÁLBUM desde Qobuz
    console.log('\n💿 3. INFORMACIÓN DEL ÁLBUM (QOBUZ)');
    console.log('-'.repeat(40));
    
    if (currentTrack.album) {
        try {
            const albumResults = await qobuz.searchAlbum(currentTrack.album, currentTrack.artist, 5);
            
            if (albumResults && albumResults.length > 0) {
                console.log(`✅ Álbum encontrado en Qobuz:`);
                
                albumResults.forEach((album, index) => {
                    console.log(`\n   ${index + 1}. "${album.title}"`);
                    console.log(`      Artista: ${album.artist_name}`);
                    console.log(`      Qobuz ID: ${album.qobuz_id}`);
                    console.log(`      Fecha lanzamiento: ${album.release_date}`);
                    console.log(`      Número de tracks: ${album.track_count}`);
                    console.log(`      Duración: ${album.duration ? Math.floor(album.duration / 60) + ' min' : 'No disponible'}`);
                    console.log(`      Label: ${album.label || 'No disponible'}`);
                    console.log(`      Género: ${album.genre || 'No disponible'}`);
                    console.log(`      Artwork: ${album.artwork_url || 'No disponible'}`);
                    console.log(`      Fuente: ${album.source}`);
                });

                // Obtener información detallada del primer álbum
                const mainAlbum = albumResults[0];
                console.log(`\n   🔍 Información detallada del álbum principal:`);
                try {
                    const albumDetails = await qobuz.getAlbum(mainAlbum.qobuz_id);
                    if (albumDetails) {
                        console.log(`   ✅ Detalles obtenidos:`);
                        console.log(`      Tipo de lanzamiento: ${albumDetails.release_type || 'No disponible'}`);
                        console.log(`      Número de catálogo: ${albumDetails.catalog_number || 'No disponible'}`);
                        console.log(`      Código de barras: ${albumDetails.barcode || 'No disponible'}`);
                        console.log(`      Copyright: ${albumDetails.copyright || 'No disponible'}`);
                        console.log(`      Descripción: ${albumDetails.description ? 'Disponible' : 'No disponible'}`);
                        
                        if (albumDetails.tracks && albumDetails.tracks.length > 0) {
                            console.log(`\n   🎵 Lista de tracks (primeros 5):`);
                            albumDetails.tracks.slice(0, 5).forEach((track, index) => {
                                console.log(`      ${track.track_number || index + 1}. ${track.title} (${track.duration ? Math.floor(track.duration / 60) + ':' + (track.duration % 60).toString().padStart(2, '0') : 'N/A'})`);
                            });
                            if (albumDetails.tracks.length > 5) {
                                console.log(`      ... y ${albumDetails.tracks.length - 5} tracks más`);
                            }
                        }

                        if (albumDetails.credits && albumDetails.credits.length > 0) {
                            console.log(`\n   👥 Créditos:`);
                            albumDetails.credits.forEach(credit => {
                                console.log(`      ${credit.person_name}: ${credit.role}`);
                            });
                        }
                    } else {
                        console.log(`   ⚠️  No se pudieron obtener detalles adicionales del álbum`);
                    }
                } catch (error) {
                    console.log(`   ⚠️  Error obteniendo detalles del álbum: ${error.message}`);
                }

            } else {
                console.log(`❌ Álbum "${currentTrack.album}" no encontrado en Qobuz`);
            }
        } catch (error) {
            console.log(`❌ Error buscando álbum: ${error.message}`);
        }
    } else {
        console.log('ℹ️  No hay información de álbum disponible');
    }

    // 5. Información del TRACK desde Qobuz
    console.log('\n🎵 4. INFORMACIÓN DEL TRACK (QOBUZ)');
    console.log('-'.repeat(40));
    
    try {
        const trackResults = await qobuz.searchTrack(currentTrack.track, currentTrack.artist, currentTrack.album, 5);
        
        if (trackResults && trackResults.length > 0) {
            console.log(`✅ Track encontrado en Qobuz:`);
            
            trackResults.forEach((track, index) => {
                console.log(`\n   ${index + 1}. "${track.title}"`);
                console.log(`      Artista: ${track.artist_name}`);
                console.log(`      Álbum: ${track.album_title}`);
                console.log(`      Qobuz ID: ${track.qobuz_id}`);
                console.log(`      Track número: ${track.track_number}`);
                console.log(`      Disco número: ${track.disc_number}`);
                console.log(`      Duración: ${track.duration ? Math.floor(track.duration / 60) + ':' + (track.duration % 60).toString().padStart(2, '0') : 'No disponible'}`);
                console.log(`      Fuente: ${track.source}`);
            });

            // Obtener información detallada del primer track
            const mainTrack = trackResults[0];
            console.log(`\n   🔍 Información detallada del track:`);
            try {
                const trackDetails = await qobuz.getTrack(mainTrack.qobuz_id);
                if (trackDetails) {
                    console.log(`   ✅ Detalles obtenidos:`);
                    console.log(`      Compositor: ${trackDetails.composer || 'No disponible'}`);
                    console.log(`      ISRC: ${trackDetails.isrc || 'No disponible'}`);
                    console.log(`      Copyright: ${trackDetails.copyright || 'No disponible'}`);
                } else {
                    console.log(`   ⚠️  No se pudieron obtener detalles adicionales del track`);
                }
            } catch (error) {
                console.log(`   ⚠️  Error obteniendo detalles del track: ${error.message}`);
            }

        } else {
            console.log(`❌ Track "${currentTrack.track}" no encontrado en Qobuz`);
        }
    } catch (error) {
        console.log(`❌ Error buscando track: ${error.message}`);
    }

    // 6. Resumen de calidad de datos
    console.log('\n📊 5. RESUMEN DE CALIDAD DE DATOS');
    console.log('-'.repeat(40));
    
    try {
        const apiResponse = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: currentTrack.artist,
                type: 'artist',
                forceRefresh: false
            }
        });
        
        if (apiResponse.data.artists && apiResponse.data.artists.length > 0) {
            const artist = apiResponse.data.artists[0];
            console.log(`✅ Datos integrados en nuestro sistema:`);
            console.log(`   Fuente principal: ${artist.source}`);
            console.log(`   Peso de calidad: ${artist.weight}`);
            console.log(`   Imagen disponible: ${artist.image_url ? 'Sí' : 'No'}`);
            
            if (artist.image_url) {
                console.log(`   URL de imagen: ${artist.image_url}`);
            }
        }
    } catch (error) {
        console.log(`⚠️  Error verificando integración: ${error.message}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log('🎯 INFORMACIÓN COMPLETA MOSTRADA');
    console.log('='.repeat(60));
}

showCompleteQobuzInfo().catch(console.error);