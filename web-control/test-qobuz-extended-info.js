const QobuzConnector = require('./connectors/QobuzConnector');
const axios = require('axios');
const fs = require('fs');

async function testQobuzExtendedInfo() {
    console.log('🔍 INVESTIGANDO INFORMACIÓN EXTENDIDA DE QOBUZ\n');
    console.log('='.repeat(60));

    // Cargar configuración
    let qobuzConfig = {};
    try {
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
        }
    } catch (error) {
        console.log('❌ Error cargando configuración:', error.message);
        return;
    }

    console.log('📋 Configuración cargada:');
    console.log(`   App ID: ${qobuzConfig.appId}`);
    console.log(`   App Secret: ${qobuzConfig.appSecret ? 'Presente' : 'Ausente'}`);

    // Probar diferentes endpoints de Qobuz para obtener más información
    const baseURL = 'https://www.qobuz.com/api.json/0.2';
    
    // 1. Buscar el álbum "Keep Me Singing"
    console.log('\n🔍 1. BUSCANDO ÁLBUM "Keep Me Singing"');
    console.log('-'.repeat(40));
    
    try {
        const albumSearchResponse = await axios.get(`${baseURL}/album/search`, {
            params: {
                query: 'Keep Me Singing Van Morrison',
                app_id: qobuzConfig.appId,
                limit: 3
            },
            timeout: 10000
        });

        if (albumSearchResponse.data && albumSearchResponse.data.albums && albumSearchResponse.data.albums.items) {
            const albums = albumSearchResponse.data.albums.items;
            console.log(`✅ Encontrados ${albums.length} álbumes:`);
            
            albums.forEach((album, index) => {
                console.log(`\n   ${index + 1}. "${album.title}"`);
                console.log(`      ID: ${album.id}`);
                console.log(`      Artista: ${album.artist.name}`);
                console.log(`      Fecha: ${album.released_at ? new Date(album.released_at * 1000).toISOString().split('T')[0] : 'N/A'}`);
                console.log(`      Label: ${album.label ? album.label.name : 'N/A'}`);
                console.log(`      Tracks: ${album.tracks_count}`);
                console.log(`      Duración: ${album.duration ? Math.floor(album.duration / 60) + ' min' : 'N/A'}`);
            });

            // 2. Obtener información detallada del primer álbum
            const mainAlbum = albums[0];
            console.log(`\n🔍 2. INFORMACIÓN DETALLADA DEL ÁLBUM "${mainAlbum.title}"`);
            console.log('-'.repeat(50));

            try {
                const albumDetailResponse = await axios.get(`${baseURL}/album/get`, {
                    params: {
                        album_id: mainAlbum.id,
                        app_id: qobuzConfig.appId
                    },
                    timeout: 10000
                });

                const albumDetails = albumDetailResponse.data;
                console.log('✅ Detalles del álbum obtenidos:');
                console.log(`   Título: ${albumDetails.title}`);
                console.log(`   Artista: ${albumDetails.artist.name}`);
                console.log(`   Fecha lanzamiento: ${albumDetails.released_at ? new Date(albumDetails.released_at * 1000).toISOString().split('T')[0] : 'N/A'}`);
                console.log(`   Label: ${albumDetails.label ? albumDetails.label.name : 'N/A'}`);
                console.log(`   Género: ${albumDetails.genre ? albumDetails.genre.name : 'N/A'}`);
                console.log(`   UPC: ${albumDetails.upc || 'N/A'}`);
                console.log(`   Copyright: ${albumDetails.copyright || 'N/A'}`);
                console.log(`   Descripción: ${albumDetails.description || 'No disponible'}`);
                
                // Buscar campos adicionales que puedan contener reseñas
                console.log('\n📝 Campos adicionales encontrados:');
                Object.keys(albumDetails).forEach(key => {
                    if (typeof albumDetails[key] === 'string' && albumDetails[key].length > 50) {
                        console.log(`   ${key}: ${albumDetails[key].substring(0, 100)}...`);
                    }
                });

                // 3. Probar endpoint de información editorial/reseñas
                console.log(`\n🔍 3. BUSCANDO INFORMACIÓN EDITORIAL`);
                console.log('-'.repeat(40));

                // Probar diferentes endpoints que podrían tener reseñas
                const editorialEndpoints = [
                    'album/getEditorial',
                    'album/getReview',
                    'album/getPress',
                    'editorial/get',
                    'album/getGoodies'
                ];

                for (const endpoint of editorialEndpoints) {
                    try {
                        console.log(`   Probando endpoint: ${endpoint}`);
                        const editorialResponse = await axios.get(`${baseURL}/${endpoint}`, {
                            params: {
                                album_id: mainAlbum.id,
                                app_id: qobuzConfig.appId
                            },
                            timeout: 5000
                        });
                        
                        console.log(`   ✅ ${endpoint} respondió:`, Object.keys(editorialResponse.data));
                        if (editorialResponse.data.text || editorialResponse.data.content || editorialResponse.data.description) {
                            console.log(`   📝 Contenido encontrado en ${endpoint}`);
                        }
                    } catch (error) {
                        console.log(`   ❌ ${endpoint}: ${error.response?.status || error.message}`);
                    }
                }

                // 4. Probar obtener información del artista que podría tener biografía extendida
                console.log(`\n🔍 4. INFORMACIÓN EXTENDIDA DEL ARTISTA`);
                console.log('-'.repeat(40));

                try {
                    const artistResponse = await axios.get(`${baseURL}/artist/get`, {
                        params: {
                            artist_id: albumDetails.artist.id,
                            app_id: qobuzConfig.appId,
                            extra: 'albums,appears_on,similar_artists,biography'
                        },
                        timeout: 10000
                    });

                    const artistDetails = artistResponse.data;
                    console.log('✅ Información del artista:');
                    console.log(`   Nombre: ${artistDetails.name}`);
                    console.log(`   Biografía disponible: ${artistDetails.biography ? 'Sí' : 'No'}`);
                    
                    if (artistDetails.biography) {
                        console.log(`\n📖 Biografía (primeros 300 caracteres):`);
                        console.log(`   ${artistDetails.biography.substring(0, 300)}...`);
                    }

                    // Buscar otros campos que puedan contener información editorial
                    console.log('\n📝 Otros campos del artista:');
                    Object.keys(artistDetails).forEach(key => {
                        if (typeof artistDetails[key] === 'string' && artistDetails[key].length > 50) {
                            console.log(`   ${key}: ${artistDetails[key].substring(0, 100)}...`);
                        }
                    });

                } catch (error) {
                    console.log(`❌ Error obteniendo info del artista: ${error.response?.status || error.message}`);
                }

                // 5. Probar endpoints de metadatos adicionales
                console.log(`\n🔍 5. METADATOS ADICIONALES`);
                console.log('-'.repeat(30));

                const metadataEndpoints = [
                    'catalog/search',
                    'album/getFeatured',
                    'album/getSimilar'
                ];

                for (const endpoint of metadataEndpoints) {
                    try {
                        console.log(`   Probando: ${endpoint}`);
                        const response = await axios.get(`${baseURL}/${endpoint}`, {
                            params: {
                                album_id: mainAlbum.id,
                                query: 'Keep Me Singing',
                                app_id: qobuzConfig.appId
                            },
                            timeout: 5000
                        });
                        console.log(`   ✅ ${endpoint}: ${Object.keys(response.data).join(', ')}`);
                    } catch (error) {
                        console.log(`   ❌ ${endpoint}: ${error.response?.status || error.message}`);
                    }
                }

            } catch (error) {
                console.log(`❌ Error obteniendo detalles del álbum: ${error.response?.status || error.message}`);
            }

        } else {
            console.log('❌ No se encontraron álbumes');
        }

    } catch (error) {
        console.log(`❌ Error en búsqueda de álbum: ${error.response?.status || error.message}`);
    }

    // 6. Investigar si TiVo tiene una API pública
    console.log(`\n🔍 6. INVESTIGANDO FUENTES ALTERNATIVAS (TiVo, etc.)`);
    console.log('-'.repeat(50));
    
    console.log('ℹ️  TiVo parece ser una fuente de metadatos que Qobuz usa internamente.');
    console.log('   Esto podría requerir credenciales especiales o endpoints no públicos.');
    console.log('   Las reseñas detalladas podrían estar en endpoints premium de Qobuz.');

    console.log('\n' + '='.repeat(60));
    console.log('🎯 INVESTIGACIÓN COMPLETADA');
    console.log('='.repeat(60));
}

testQobuzExtendedInfo().catch(console.error);