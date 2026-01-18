#!/usr/bin/env node

/**
 * Fix DSP Auto-Stop Issue
 * 
 * Este script modifica la lógica del servidor para evitar que CamillaDSP
 * se detenga automáticamente cuando no hay señal de audio.
 */

const fs = require('fs');
const path = require('path');

console.log('🔧 Arreglando el problema de parada automática del DSP...\n');

// 1. Modificar el servidor para desactivar el Silence Watchdog agresivo
const serverPath = path.join(__dirname, 'web-control/server.js');
let serverContent = fs.readFileSync(serverPath, 'utf8');

console.log('📝 Modificando web-control/server.js...');

// Comentar el Silence Watchdog que es demasiado agresivo
const silenceWatchdogRegex = /\/\/ Silence Watchdog: If Roon is playing but no signal reaches Camilla\nsetInterval\(async \(\) => \{[\s\S]*?\}, 2000\);/;

if (serverContent.match(silenceWatchdogRegex)) {
    serverContent = serverContent.replace(
        silenceWatchdogRegex,
        `// Silence Watchdog: DISABLED - Was causing auto-stop issues
// Original watchdog was too aggressive and stopped DSP during normal pauses
// setInterval(async () => {
//     const activeZone = roonController.getActiveZone();
//     if (activeZone && activeZone.state === 'playing') {
//         const health = dsp.getHealthReport();
//         // If DSP is running but silent for > 5s while Roon is playing
//         if (health.dsp.running && !health.signal.present && health.signal.silenceDuration >= 6) {
//             console.warn(\`Server: Silence Watchdog triggered! Roon is playing but Camilla is silent (\${health.signal.silenceDuration}s). Restarting...\`);
//             const activeDsp = getDspForZone(activeZone.display_name);
//             const filters = activeDsp.lastFilterData || { filters: [], preamp: 0 };
//             const options = activeDsp.lastOptions || { sampleRate: 96000 };
//             await activeDsp.start(filters, options);
//         }
//     }
// }, 2000);`
    );
    console.log('✅ Silence Watchdog desactivado');
} else {
    console.log('⚠️  Silence Watchdog no encontrado o ya modificado');
}

// Escribir el archivo modificado
fs.writeFileSync(serverPath, serverContent);

// 2. Modificar el DSP Manager para ser menos agresivo con los reinicios
const dspManagerPath = path.join(__dirname, 'web-control/dsp-manager.js');
let dspContent = fs.readFileSync(dspManagerPath, 'utf8');

console.log('📝 Modificando web-control/dsp-manager.js...');

// Aumentar el tiempo de silencio antes de considerar que hay un problema
dspContent = dspContent.replace(
    /this\.healthState\.silenceDuration \+= 2;/g,
    'this.healthState.silenceDuration += 2;'
);

dspContent = dspContent.replace(
    /if \(this\.healthState\.silenceDuration >= 5\) \{/g,
    'if (this.healthState.silenceDuration >= 30) { // Aumentado de 5 a 30 segundos'
);

dspContent = dspContent.replace(
    /if \(this\.healthState\.silenceDuration === 6\) \{/g,
    'if (this.healthState.silenceDuration === 32) { // Aumentado de 6 a 32 segundos'
);

// Hacer el watchdog menos agresivo - aumentar intervalo y tolerancia
dspContent = dspContent.replace(
    /this\.watchdogInterval = setInterval\(\(\) => \{/g,
    'this.watchdogInterval = setInterval(() => {'
);

dspContent = dspContent.replace(
    /\}, 2000\); \/\/ Process health check/g,
    '}, 5000); // Process health check - Aumentado de 2s a 5s para ser menos agresivo'
);

// Aumentar el tiempo antes de considerar que el proceso debe reiniciarse
dspContent = dspContent.replace(
    /if \(this\.healthState\.restartCount >= 10\) \{/g,
    'if (this.healthState.restartCount >= 3) { // Reducido de 10 a 3 para evitar loops'
);

dspContent = dspContent.replace(
    /const backoff = 15000; \/\/ 15s backoff/g,
    'const backoff = 60000; // 60s backoff - Aumentado para dar más tiempo'
);

fs.writeFileSync(dspManagerPath, dspContent);
console.log('✅ DSP Manager modificado para ser menos agresivo');

// 3. Crear un script de monitoreo manual
const monitorScript = `#!/usr/bin/env node

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
            const pids = data.trim().split('\\n').filter(pid => pid);
            console.log(\`✅ DSP corriendo - PIDs: \${pids.join(', ')}\`);
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
console.log('💡 Si el DSP se detiene, usa el botón restart en la interfaz web\\n');

// Verificar inmediatamente
checkDSPStatus();

// Verificar cada 30 segundos
setInterval(checkDSPStatus, 30000);
`;

fs.writeFileSync(path.join(__dirname, 'monitor_dsp.js'), monitorScript);
fs.chmodSync(path.join(__dirname, 'monitor_dsp.js'), '755');
console.log('✅ Script de monitoreo creado: monitor_dsp.js');

// 4. Modificar el estado persistente para asegurar que el DSP se mantenga corriendo
const statePath = path.join(__dirname, 'state.json');
if (fs.existsSync(statePath)) {
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    state.running = true;
    state.autoRestart = false; // Nueva bandera para evitar reinicios automáticos
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
    console.log('✅ Estado persistente actualizado');
}

// 5. Crear un script de reinicio manual mejorado
const restartScript = `#!/usr/bin/env node

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
`;

fs.writeFileSync(path.join(__dirname, 'restart_dsp.js'), restartScript);
fs.chmodSync(path.join(__dirname, 'restart_dsp.js'), '755');
console.log('✅ Script de reinicio manual creado: restart_dsp.js');

console.log('\n🎉 Arreglo completado!\n');
console.log('📋 Cambios realizados:');
console.log('   • Silence Watchdog desactivado (era demasiado agresivo)');
console.log('   • DSP Manager menos agresivo con reinicios');
console.log('   • Tiempos de silencio aumentados de 5s a 30s');
console.log('   • Intervalo de watchdog aumentado de 2s a 5s');
console.log('   • Scripts de monitoreo y reinicio manual creados\n');

console.log('🚀 Próximos pasos:');
console.log('   1. Reinicia el servidor: cd web-control && npm start');
console.log('   2. Si el DSP se detiene, usa: node restart_dsp.js');
console.log('   3. Para monitorear: node monitor_dsp.js');
console.log('   4. O usa el botón restart en la interfaz web\n');

console.log('💡 El DSP ahora debería mantenerse corriendo incluso durante pausas largas');