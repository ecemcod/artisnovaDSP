#!/usr/bin/env node

const axios = require('axios');

async function diagnoseNowPlaying() {
    console.log('🎵 Artis Nova - Diagnóstico de "Now Playing"');
    console.log('=' .repeat(50));
    
    try {
        // 1. Verificar estado del servidor
        console.log('1. Verificando estado del servidor...');
        const statusResponse = await axios.get('http://localhost:3000/api/status');
        console.log(`   ✅ Servidor funcionando - DSP: ${statusResponse.data.running ? 'ACTIVO' : 'INACTIVO'}`);
        console.log(`   📊 Sample Rate: ${statusResponse.data.sampleRate}Hz`);
        console.log(`   🎛️  Backend: ${statusResponse.data.backend}`);
        
        // 2. Verificar información de medios
        console.log('\n2. Verificando información de medios...');
        const mediaResponse = await axios.get('http://localhost:3000/api/media/info');
        const media = mediaResponse.data;
        
        console.log(`   🎵 Estado: ${media.state.toUpperCase()}`);
        console.log(`   🎤 Artista: ${media.artist || 'No disponible'}`);
        console.log(`   🎧 Canción: ${media.track || 'No disponible'}`);
        console.log(`   💿 Álbum: ${media.album || 'No disponible'}`);
        console.log(`   📅 Año: ${media.year || 'No disponible'}`);
        console.log(`   🖼️  Artwork: ${media.artworkUrl ? 'Disponible' : 'No disponible'}`);
        console.log(`   📱 Dispositivo: ${media.device || 'No disponible'}`);
        console.log(`   🔗 Fuente: ${media.source || 'No disponible'}`);
        
        // 3. Verificar progreso de reproducción
        if (media.state === 'playing') {
            console.log(`   ⏱️  Posición: ${formatTime(media.position)} / ${formatTime(media.duration)}`);
            console.log(`   📈 Progreso: ${((media.position / media.duration) * 100).toFixed(1)}%`);
        }
        
        // 4. Verificar zonas disponibles
        console.log('\n3. Verificando zonas de audio...');
        try {
            const zonesResponse = await axios.get('http://localhost:3000/api/media/zones');
            console.log(`   🔊 Zonas disponibles: ${zonesResponse.data.length}`);
            zonesResponse.data.forEach(zone => {
                console.log(`      - ${zone.name} (${zone.source}) ${zone.active ? '🟢 ACTIVA' : '⚪'}`);
            });
        } catch (error) {
            console.log('   ⚠️  No se pudieron obtener las zonas');
        }
        
        // 5. Verificar WebSocket
        console.log('\n4. Verificando conectividad WebSocket...');
        const WebSocket = require('ws');
        const ws = new WebSocket('ws://localhost:3000');
        
        ws.on('open', () => {
            console.log('   ✅ WebSocket conectado correctamente');
            ws.close();
        });
        
        ws.on('error', (error) => {
            console.log('   ❌ Error de WebSocket:', error.message);
        });
        
        // 6. Resumen
        console.log('\n' + '=' .repeat(50));
        if (media.state === 'playing') {
            console.log('🎉 TODO FUNCIONANDO CORRECTAMENTE');
            console.log(`🎵 Reproduciendo: "${media.track}" de ${media.artist}`);
        } else if (media.state === 'paused') {
            console.log('⏸️  MÚSICA PAUSADA');
            console.log('💡 Usa los controles de reproducción para continuar');
        } else {
            console.log('⏹️  NO HAY REPRODUCCIÓN ACTIVA');
            console.log('💡 Inicia la reproducción desde tu aplicación de música');
        }
        
    } catch (error) {
        console.error('❌ Error durante el diagnóstico:', error.message);
        
        if (error.code === 'ECONNREFUSED') {
            console.log('\n💡 Soluciones posibles:');
            console.log('   1. Verificar que el servidor esté ejecutándose: node server.js');
            console.log('   2. Verificar que el puerto 3000 esté disponible');
            console.log('   3. Reiniciar el servidor si es necesario');
        }
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Ejecutar diagnóstico
diagnoseNowPlaying();