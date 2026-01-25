const axios = require('axios');

async function debugAlbumSearch() {
    console.log('🔍 DEBUG ALBUM SEARCH - QOBUZ vs ITUNES\n');
    
    const albumName = 'Keep Me Singing';
    const artistName = 'Van Morrison';
    
    console.log(`Buscando álbum: "${albumName}" por "${artistName}"`);
    
    try {
        // Test 1: Album search without artist parameter
        console.log('\n1. Búsqueda SIN parámetro artist:');
        const searchWithoutArtist = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: albumName,
                type: 'album',
                limit: 3
            }
        });
        
        if (searchWithoutArtist.data.albums && searchWithoutArtist.data.albums.length > 0) {
            searchWithoutArtist.data.albums.forEach((album, index) => {
                console.log(`   ${index + 1}. "${album.title || 'undefined'}" - ${album.artist_name || 'undefined'} (${album.source})`);
            });
        } else {
            console.log('   No se encontraron álbumes');
        }
        
        // Test 2: Album search WITH artist parameter
        console.log('\n2. Búsqueda CON parámetro artist:');
        const searchWithArtist = await axios.get('http://localhost:3000/api/music/search', {
            params: {
                q: albumName,
                type: 'album',
                artist: artistName,
                limit: 3
            }
        });
        
        if (searchWithArtist.data.albums && searchWithArtist.data.albums.length > 0) {
            searchWithArtist.data.albums.forEach((album, index) => {
                console.log(`   ${index + 1}. "${album.title || 'undefined'}" - ${album.artist_name || 'undefined'} (${album.source})`);
            });
        } else {
            console.log('   No se encontraron álbumes');
        }
        
        // Test 3: Direct Qobuz search
        console.log('\n3. Búsqueda DIRECTA en Qobuz:');
        const QobuzConnector = require('./connectors/QobuzConnector');
        const fs = require('fs');
        
        let qobuzConfig = {};
        if (fs.existsSync('./qobuz-config.json')) {
            qobuzConfig = JSON.parse(fs.readFileSync('./qobuz-config.json', 'utf8'));
        }
        
        const qobuz = new QobuzConnector(qobuzConfig);
        const directQobuzResults = await qobuz.searchAlbum(albumName, artistName, 3);
        
        if (directQobuzResults && directQobuzResults.length > 0) {
            directQobuzResults.forEach((album, index) => {
                console.log(`   ${index + 1}. "${album.title}" - ${album.artist_name} (qobuz)`);
            });
        } else {
            console.log('   No se encontraron álbumes en Qobuz directamente');
        }
        
        // Test 4: Check source priorities
        console.log('\n4. Verificación de prioridades de fuentes:');
        const MusicInfoManager = require('./MusicInfoManager');
        const db = require('./database');
        const musicInfoManager = new MusicInfoManager(db.db);
        
        console.log('   Pesos de fuentes configurados:');
        Object.entries(musicInfoManager.sourceWeights).forEach(([source, weight]) => {
            console.log(`      ${source}: ${weight}`);
        });
        
        console.log('\n   Conectores registrados:');
        for (const [name, connector] of musicInfoManager.connectors) {
            console.log(`      ${name}: ${connector.constructor.name}`);
        }
        
    } catch (error) {
        console.error('Error en debug:', error.message);
    }
}

debugAlbumSearch().catch(console.error);