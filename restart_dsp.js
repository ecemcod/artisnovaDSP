#!/usr/bin/env node

/**
 * Manual DSP Restart
 * 
 * Script para reiniciar manualmente el DSP cuando sea necesario
 */

const { execSync } = require('child_process');
const axios = require('axios');

async function restartDSP() {
    try {
        console.log('🔄 Reiniciando DSP...');

        // Llamar al endpoint de restart del servidor
        const response = await axios.post('http://localhost:3000/api/probe/restart');

        if (response.data.success) {
            console.log('✅ DSP reiniciado correctamente');
        } else {
            console.log('❌ Error reiniciando DSP:', response.data.error);
        }

    } catch (error) {
        console.error('❌ Error:', error.message);

        // Fallback: reinicio manual
        console.log('🔄 Intentando reinicio manual...');
        try {
            execSync('pkill -9 camilladsp');
            console.log('✅ Procesos DSP terminados. El watchdog debería reiniciarlo automáticamente.');
        } catch (e) {
            console.log('⚠️  No se encontraron procesos DSP corriendo');
        }
    }
}

restartDSP();
