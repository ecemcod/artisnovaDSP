#!/usr/bin/env node

/**
 * Monitor DSP Status
 * 
 * Script para monitorear el estado del DSP sin reiniciarlo automáticamente
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkDSPStatus() {
    try {
        // Verificar si el proceso camilladsp está corriendo
        const result = spawn('pgrep', ['-x', 'camilladsp'], { encoding: 'utf8' });

        result.stdout.on('data', (data) => {
            const pids = data.toString().trim().split('\n').filter(pid => pid);
            console.log(`✅ DSP corriendo - PIDs: ${pids.join(', ')}`);
        });

        result.stderr.on('data', (data) => {
            console.log('⚠️  DSP no está corriendo');
        });

        result.on('close', (code) => {
            if (code !== 0) {
                console.log('❌ DSP detenido - Usa el botón restart en la interfaz web');
            }
        });

    } catch (error) {
        console.error('Error verificando DSP:', error.message);
    }
}

console.log('🔍 Monitor DSP iniciado - Verificando cada 30 segundos...');
console.log('💡 Este monitor NO reinicia automáticamente el DSP');
console.log('💡 Si el DSP se detiene, usa el botón restart en la interfaz web\n');

// Verificar inmediatamente
checkDSPStatus();

// Verificar cada 30 segundos
setInterval(checkDSPStatus, 30000);
