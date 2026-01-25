const QobuzConnector = require('./connectors/QobuzConnector');
const fs = require('fs');

async function testAlbumDescription() {
    console.log('🎯 TEST ESPECÍFICO - DESCRIPCIÓN DEL ÁLBUM\n');
    
    // Load Qobuz config
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
    
    // Search for the current album
    console.log('🔍 Buscando álbum "Keep Me Singing" de Van Morrison...');
    
    try {
        const albumResults = await qobuz.searchAlbum('Keep Me Singing', 'Van Morrison', 5);
        
        if (albumResults && albumResults.length > 0) {
            const album = albumResults[0];
            console.log(`✅ Álbum encontrado: "${album.title}"`);
            console.log(`   Qobuz ID: ${album.qobuz_id}`);
            console.log(`   Artwork: ${album.artwork_url}`);
            
            // Try to get detailed album info
            console.log('\n🔍 Intentando obtener información detallada...');
            
            try {
                const albumDetails = await qobuz.getAlbum(album.qobuz_id);
                
                if (albumDetails) {
                    console.log('✅ Detalles del álbum obtenidos:');
                    console.log(`   Título: ${albumDetails.title}`);
                    console.log(`   Artista: ${albumDetails.artist_name}`);
                    console.log(`   Fecha: ${albumDetails.release_date}`);
                    console.log(`   Label: ${albumDetails.label_name}`);
                    console.log(`   Tracks: ${albumDetails.track_count}`);
                    console.log(`   Descripción disponible: ${albumDetails.description ? 'SÍ' : 'NO'}`);
                    
                    if (albumDetails.description) {
                        console.log('\n📝 DESCRIPCIÓN/RESEÑA DEL ÁLBUM:');
                        console.log('='.repeat(60));
                        console.log(albumDetails.description);
                        console.log('='.repeat(60));
                        
                        // Check if it contains TiVo attribution
                        if (albumDetails.description.toLowerCase().includes('tivo')) {
                            console.log('\n✅ La descripción contiene información de TiVo');
                        } else {
                            console.log('\n⚠️  La descripción no parece contener información de TiVo');
                        }
                    } else {
                        console.log('\n❌ No hay descripción disponible para este álbum');
                    }
                    
                    // Show other metadata
                    console.log('\n📊 OTROS METADATOS:');
                    console.log(`   Copyright: ${albumDetails.copyright || 'No disponible'}`);
                    console.log(`   Código de barras: ${albumDetails.barcode || 'No disponible'}`);
                    console.log(`   Géneros: ${albumDetails.genres ? albumDetails.genres.join(', ') : 'No disponible'}`);
                    
                } else {
                    console.log('❌ No se pudieron obtener detalles del álbum');
                }
                
            } catch (detailError) {
                console.log(`❌ Error obteniendo detalles: ${detailError.message}`);
                
                // Try alternative approach - use search result data
                console.log('\n🔄 Intentando con datos de búsqueda...');
                console.log(`   Título: ${album.title}`);
                console.log(`   Artista: ${album.artist_name}`);
                console.log(`   Fecha: ${album.release_date}`);
                console.log(`   Label: ${album.label}`);
                console.log(`   Tracks: ${album.track_count}`);
                console.log(`   Artwork: ${album.artwork_url}`);
            }
            
        } else {
            console.log('❌ No se encontró el álbum en Qobuz');
        }
        
    } catch (searchError) {
        console.log(`❌ Error en búsqueda: ${searchError.message}`);
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 TEST COMPLETADO');
}

testAlbumDescription().catch(console.error);