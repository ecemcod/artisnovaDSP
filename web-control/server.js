const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');

// Node 22+ Roon API Workaround
global.WebSocket = require('ws');

const http = require('http');
const https = require('https');
const DSPManager = require('./dsp-manager');
const RemoteDSPManager = require('./remote-dsp-manager');
const FilterParser = require('./parser');
const LMSController = require('./lms-controller');
const { spawn } = require('child_process');
const db = require('./database'); // History DB


const app = express();
app.use(cors());
app.use(express.json());
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${new Date().toISOString()} ${req.method} ${req.url} ${res.statusCode} ${duration}ms`);
    });
    next();
});

// Roon Integration
const roonController = require('./roon-controller');
// Initialized with callback at bottom of file

// CoreAudio Sample Rate Detection for BlackHole
// Polls the system to detect when Roon changes the sample rate
let lastDetectedSampleRate = null;

function getBlackHoleSampleRate() {
    if (process.platform !== 'darwin') return null;
    try {
        const output = require('child_process').execSync(
            'system_profiler SPAudioDataType 2>/dev/null | grep -A 10 "BlackHole 2ch"',
            { encoding: 'utf8', timeout: 5000 }
        );
        const match = output.match(/Current SampleRate:\s*(\d+)/);
        if (match) {
            return parseInt(match[1], 10);
        }
    } catch (e) {
        // Ignore errors
    }
    return null;
}



// History Tracking State
let historyState = {
    currentTrack: null,
    currentArtist: null,
    currentAlbum: null,
    currentSource: null,
    currentDevice: null,
    startTime: 0, // Unix timestamp when track started
    accumulatedTime: 0, // Seconds played
    isPlaying: false,
    lastCheck: 0,
    metadata: { genre: null, artworkUrl: null }
};

const PORT = 3000;
const CAMILLA_ROOT = path.resolve(__dirname, '..'); // camilla dir
const PRESETS_DIR = path.join(CAMILLA_ROOT, 'presets');
const ZONE_CONFIG_PATH = path.join(__dirname, 'zone-config.json');

const getLocalIP = () => {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return 'localhost';
};

// detect if running on Raspberry Pi
const isRunningOnPi = os.hostname().includes('raspberrypi') || process.platform === 'linux';
const currentHost = getLocalIP();

// LOCAL DSP Manager (Mac Mini or Pi itself)
const dsp = new DSPManager(CAMILLA_ROOT);

// REMOTE DSP Manager (Raspberry Pi)
const remoteDsp = new RemoteDSPManager({
    host: 'raspberrypi.local',
    port: 1234
});

// Available backends registry
const DSP_BACKENDS = {
    local: {
        name: isRunningOnPi ? 'Raspberry Pi (Local)' : 'Mac Mini (Local)',
        manager: dsp,
        wsUrl: `ws://${currentHost}:5005`
    },
    raspi: {
        name: 'Remote Raspberry',
        manager: remoteDsp,
        wsUrl: `ws://raspberrypi.local:1234`
    }
};

// LMS Controller (for Spotify/Qobuz via Lyrion on Pi)
const lmsController = new LMSController({
    host: isRunningOnPi ? 'localhost' : 'raspberrypi.local',
    port: 9000
});

// If we are on the Pi, remoteDsp should probably be disabled or reconfigured, 
// but for now we keep the logic to detect it.

// If we are on the Pi, remove the raspi backend to avoid self-reference
if (isRunningOnPi) {
    delete DSP_BACKENDS.raspi;
}

// Zone configuration (loaded from file)
let zoneConfig = { zones: { Camilla: 'local' }, defaults: { dspBackend: 'local' }, backendSettings: {} };

function loadRaspiCredentials() {
    if (isRunningOnPi) return; // Don't need remote credentials if we are the Pi
    try {
        const raspiTxtPath = path.join(CAMILLA_ROOT, 'raspi.txt');
        if (fs.existsSync(raspiTxtPath)) {
            const content = fs.readFileSync(raspiTxtPath, 'utf8');
            const lines = content.split('\n');
            const creds = {};
            lines.forEach(line => {
                const [key, value] = line.split('=').map(s => s.trim());
                if (key && value) creds[key] = value;
            });
            if (creds.user && creds.host && creds.password) {
                console.log('Server: Loaded Raspberry Pi credentials from raspi.txt');
                remoteDsp.setOptions({
                    host: creds.host,
                    user: creds.user,
                    password: creds.password
                });

                // Add as sync peer
                addPeer(creds.host);
            }
        }
    } catch (err) {
        console.error('Server: Failed to load raspi.txt:', err.message);
    }
}

function loadZoneConfig() {
    try {
        if (fs.existsSync(ZONE_CONFIG_PATH)) {
            const content = fs.readFileSync(ZONE_CONFIG_PATH, 'utf8');
            zoneConfig = JSON.parse(content);
            console.log('Server: Loaded zone config:', JSON.stringify(zoneConfig, null, 2));

            // Apply last active zone if present
            if (zoneConfig.lastActiveZoneId) {
                console.log(`Server: Restoring last active zone ID: ${zoneConfig.lastActiveZoneId}`);
                roonController.activeZoneId = zoneConfig.lastActiveZoneId;
            }
            if (zoneConfig.lastActiveZoneName) {
                console.log(`Server: Restoring last active zone Name: ${zoneConfig.lastActiveZoneName}`);
                // If it looks like we need the remote DSP, connect now to sync state
                if (zoneConfig.lastActiveZoneName === 'Raspberry') {
                    console.log('Server: Auto-connecting to Remote DSP to sync state...');
                    remoteDsp.connect().catch(err => console.error('Server: Initial auto-connect failed:', err.message));
                }
            }
            if (zoneConfig.backendSettings) {
                if (zoneConfig.backendSettings.raspi) {
                    remoteDsp.setOptions(zoneConfig.backendSettings.raspi);
                    if (zoneConfig.backendSettings.raspi.host) {
                        DSP_BACKENDS.raspi.wsUrl = `ws://${zoneConfig.backendSettings.raspi.host}:${zoneConfig.backendSettings.raspi.port || 1234}`;
                    }
                }
            }
        }
    } catch (err) {
        console.error('Server: Failed to load zone config:', err.message);
    }
}

function saveZoneConfig() {
    try {
        fs.writeFileSync(ZONE_CONFIG_PATH, JSON.stringify(zoneConfig, null, 4));
        console.log('Server: Saved zone config');
    } catch (err) {
        console.error('Server: Failed to save zone config:', err.message);
    }
}

// ----------------------------------------------------------------------
// Level Probe (Sonda) - For VU meters when DSP is stopped
// ----------------------------------------------------------------------
class LevelProbe {
    constructor() {
        this.process = null;
        this.analyzer = null;
        this.macWs = null;
        this.macPollInterval = null;
        this.subscribers = new Set();
        this.lastLevels = [-100, -100];

        // Watchdog state
        this.shouldBeRunning = false;
        this.restartTimeout = null;
        this.healthCheckInterval = null;
    }

    start() {
        this.shouldBeRunning = true; // Intent: User wants it running
        if (this.process) return;

        // Start health check interval
        if (this.healthCheckInterval) clearInterval(this.healthCheckInterval);
        this.healthCheckInterval = setInterval(() => this.checkHealth(), 5000);

        console.log('Probe: Starting Level Probe...');

        try {
            if (isRunningOnPi) {
                // Linux: arecord -D plughw:Loopback,1 -f S32_LE -c 2 -r 44100 -t raw
                console.log('Probe: Spawning arecord on plughw:Loopback,1...');
                this.process = spawn('arecord', [
                    '-D', 'plughw:Loopback,1',
                    '-f', 'S32_LE',
                    '-c', '2',
                    '-r', '44100',
                    '-t', 'raw',
                    '-q'
                ]);

                this.analyzer = spawn('node', [path.join(__dirname, 'level-analyzer.js'), 'S32_LE']);
                this.process.stdout.pipe(this.analyzer.stdin);

                const readline = require('readline');
                const rl = readline.createInterface({ input: this.analyzer.stdout });

                rl.on('line', (line) => {
                    try {
                        const levels = JSON.parse(line);
                        this.lastLevels = levels;
                        this.broadcast(levels);
                    } catch (e) { }
                });

                this.process.on('close', (code) => {
                    console.log(`Probe: Process exited with code ${code}`);
                    this.process = null;
                    this.handleProcessExit();
                });
                this.analyzer.on('close', () => {
                    // Analyzer close usually follows process close
                });
            } else {

                // Mac: Use secondary camilladsp instance as a proxy
                const currentRate = getBlackHoleSampleRate() || 44100;
                console.log(`Probe: Spawning camilladsp probe on Mac (BlackHole) on port 5006 using ${currentRate}Hz...`);
                const probeConfigPath = path.join(CAMILLA_ROOT, 'probe-config.yml');
                const probeConfig = {
                    devices: {
                        samplerate: currentRate,
                        chunksize: 1024,
                        capture: {
                            type: 'CoreAudio',
                            channels: 2,
                            device: 'BlackHole 2ch',
                            format: 'FLOAT32LE'
                        },
                        playback: {
                            type: 'File',
                            filename: '/dev/null',
                            channels: 2,
                            format: 'FLOAT32LE'
                        }
                    }
                };
                fs.writeFileSync(probeConfigPath, yaml.dump(probeConfig));

                this.process = spawn(path.join(CAMILLA_ROOT, 'camilladsp'), [
                    '-a', '0.0.0.0',
                    '-p', '5006',
                    probeConfigPath
                ]);

                // Capture child instance to avoid race conditions with restarts
                const child = this.process;
                child.on('close', (code) => {
                    console.log(`Probe: Process exited with code ${code}`);
                    if (this.process === child) {
                        this.process = null;
                        this.handleProcessExit();
                    }
                });

                // Wait 1s for camilladsp to start before connecting to its WS
                setTimeout(() => this.startMacPolling(), 1000);
            }
        } catch (err) {
            console.error('Probe: Failed to start:', err.message);
            this.stop();
        }
    }

    startMacPolling() {
        if (!this.process || this.macWs) return;

        console.log('Probe: Connecting to Mac CamillaDSP probe on WS 5006...');
        this.macWs = new WebSocket('ws://localhost:5006');

        this.macWs.on('open', () => {
            console.log('Probe: Connected to Mac probe WebSocket');
            this.macPollInterval = setInterval(() => {
                if (this.macWs && this.macWs.readyState === WebSocket.OPEN) {
                    this.macWs.send('"GetCaptureSignalPeak"');
                }
            }, 200);
        });

        this.macWs.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                if (msg.GetCaptureSignalPeak) {
                    const levels = msg.GetCaptureSignalPeak.value;
                    this.lastLevels = levels;
                    this.broadcast(levels);
                }
            } catch (e) { }
        });

        this.macWs.on('close', () => {
            if (this.macPollInterval) {
                clearInterval(this.macPollInterval);
                this.macPollInterval = null;
            }
            this.macWs = null;

            // Check if process is actually healthy before trying to reconnect
            if (this.process) {
                try {
                    process.kill(this.process.pid, 0);
                    // If still alive, retry connection
                    setTimeout(() => this.startMacPolling(), 1000);
                } catch (e) {
                    // Process is dead
                    console.log('WS Monitor: Process found dead. Triggering restart.');
                    this.process = null;
                    this.handleProcessExit();
                }
            }
        });

        this.macWs.on('error', () => {
            if (this.macWs) this.macWs.close();
        });
    }

    stop() {
        console.log(`Probe: Stopping... (shouldBeRunning: ${this.shouldBeRunning})`);
        this.shouldBeRunning = false; // Intent: User wants it stopped

        if (this.restartTimeout) {
            console.log('Probe: Clearing pending restart');
            clearTimeout(this.restartTimeout);
            this.restartTimeout = null;
        }

        if (this.process) {
            console.log('Probe: Killing process');
            this.process.kill();
            this.process = null;
        }
        if (this.analyzer) {
            this.analyzer.kill();
            this.analyzer = null;
        }
        if (this.macWs) {
            this.macWs.close();
            this.macWs = null;
        }
        if (this.macPollInterval) {
            clearInterval(this.macPollInterval);
            this.macPollInterval = null;
        }
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
        }
    }

    checkHealth() {
        if (this.shouldBeRunning && this.process) {
            // Check if process is still alive
            try {
                // kill(0) throws if process doesn't exist, returns true if it does
                process.kill(this.process.pid, 0);
            } catch (e) {
                console.log(`Probe: Process ${this.process.pid} is dead (health check). Triggering restart...`);
                this.process = null; // Mark as gone
                this.handleProcessExit();
            }
        } else if (this.shouldBeRunning && !this.process && !this.restartTimeout) {
            // Should be running but no process and no pending restart? Restart.
            console.log('Probe: Should be running but no process. Restarting...');
            this.start();
        }
    }

    handleProcessExit() {
        console.log(`Probe: handleProcessExit called. shouldBeRunning: ${this.shouldBeRunning}`);
        if (this.shouldBeRunning) {
            console.log('Probe: Process died unexpectedly (Crash or Rate Change). Restarting in 2s...');

            // Clean up any lingering resources effectively
            if (this.macWs) { this.macWs.close(); this.macWs = null; }
            if (this.macPollInterval) { clearInterval(this.macPollInterval); this.macPollInterval = null; }

            this.restartTimeout = setTimeout(() => {
                console.log('Probe: Executing restart now...');
                this.start();
            }, 2000);
        } else {
            console.log('Probe: Process stopped intentionally.');
            // We don't call stop() here to avoid infinite loops if stop() called this,
            // but we ensure resources are cleaned up.
            this.stop();
        }
    }

    broadcast(levels) {
        const message = JSON.stringify(levels);
        this.subscribers.forEach(ws => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(message);
            }
        });
    }

    addSubscriber(ws) {
        this.subscribers.add(ws);

        // If there was a pending stop, cancel it
        if (this.stopTimeout) {
            console.log('Probe: New subscriber joined, cancelling pending stop.');
            clearTimeout(this.stopTimeout);
            this.stopTimeout = null;
        }

        if (this.subscribers.size === 1 && !this.isRunning() && !this.shouldBeRunning) {
            this.start();
        } else if (this.shouldBeRunning && !this.process) {
            // Edge case: Should be running but isn't? 
            this.start();
        }
    }

    removeSubscriber(ws) {
        this.subscribers.delete(ws);
        if (this.subscribers.size === 0) {
            console.log('Probe: No subscribers, scheduling stop in 5s...');
            if (this.stopTimeout) clearTimeout(this.stopTimeout);
            this.stopTimeout = setTimeout(() => {
                console.log('Probe: No subscribers for 5s, stopping now.');
                this.stop();
                this.stopTimeout = null;
            }, 5000);
        }
    }

    isRunning() {
        return !!this.process;
    }
}

const levelProbe = new LevelProbe();

// ----------------------------------------------------------------------
// Synchronization Logic
// ----------------------------------------------------------------------
const PEERS = new Set();

function addPeer(host) {
    // Normalize host (remove protocol/port if present for simplicity, though we assume hostnames/IPs)
    PEERS.add(host);
    console.log(`Sync: Added peer ${host}`);
}

async function broadcastZoneChange(zoneId, zoneName) {
    const payload = { zoneId, zoneName, timestamp: Date.now() };
    console.log(`Sync: Broadcasting zone change to ${PEERS.size} peers:`, payload);

    for (const host of PEERS) {
        try {
            // Assume peer runs on same PORT 3000
            const url = `http://${host}:${PORT}/api/sync/zone`;
            await axios.post(url, payload, { timeout: 2000 });
            console.log(`Sync: Sent update to ${host}`);
        } catch (err) {
            console.error(`Sync: Failed to send to ${host}:`, err.message);
        }
    }
}

// Load credentials and config on startup
loadRaspiCredentials();
loadZoneConfig();

/**
 * Get the correct DSP manager based on Roon zone configuration
 * @param {string} zoneName - Name of the Roon zone
 * @returns {DSPManager|RemoteDSPManager} The appropriate DSP manager
 */
function getDspForZone(zoneName) {
    // 1. Try by provided zone name
    let backendId = zoneConfig.zones[zoneName];

    // No fallback implicit to 'local' if it's not in config and doesn't match keywords
    if (!backendId && zoneName) {
        const lowerName = zoneName.toLowerCase();
        if (lowerName.includes('raspberry') || lowerName.includes('pi')) {
            backendId = 'raspi';
        } else if (lowerName.includes('camilla') || lowerName.includes('local')) {
            backendId = 'local';
        }
    }

    const backend = DSP_BACKENDS[backendId];
    if (backend) {
        console.log(`Server: Using ${backend.name} DSPManager (Zone: "${zoneName || 'active'}", Backend: ${backendId})`);
        return backend.manager;
    }

    console.log(`Server: Using local DSPManager (fallback)`);
    return dsp;
}

/**
 * Get backend ID for a zone
 */
function getBackendIdForZone(zoneName) {
    const id = zoneConfig.zones[zoneName];
    if (id) return id;

    if (zoneName) {
        const lower = zoneName.toLowerCase();
        if (lower.includes('raspberry') || lower.includes('pi')) return 'raspi';
        if (lower.includes('camilla') || lower.includes('local')) return 'local';
    }

    return null; // Explicitly null if not a DSP zone
}

/**
 * Get current active zone name from Roon
 */
function getActiveZoneName() {
    if (roonController.activeZoneId) {
        const zone = roonController.zones.get(roonController.activeZoneId);
        if (zone) return zone.display_name;
    }

    // Fallback to persisted name if Roon hasn't loaded zones yet
    if (zoneConfig.lastActiveZoneName) return zoneConfig.lastActiveZoneName;

    return null;
}

// Ensure presets dir exists
if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

// Start sample rate polling for automatic CamillaDSP reconfiguration
// Detects when Roon changes BlackHole's sample rate and restarts DSP to match
let isProcessingSampleRateChange = false;  // Prevent concurrent processing
let lastRestartTime = 0;  // Timestamp of last DSP restart
const MIN_RESTART_INTERVAL = 5000;  // Minimum 5 seconds between restarts

// ----------------------------------------------------------------------
// Reusable DSP Restart Logic (Shared by Event & Polling)
// ----------------------------------------------------------------------
async function handleSampleRateChange(newRate, source = 'Auto', zone = null) {
    isProcessingSampleRateChange = true;

    // Determine which zone we're dealing with
    let checkZone = zone;
    if (!checkZone && roonController.activeZoneId) {
        checkZone = roonController.zones.get(roonController.activeZoneId);
    }
    const zoneName = checkZone ? checkZone.display_name : null;

    // Skip zones that don't have managed DSP. 
    const backendId = getBackendIdForZone(zoneName);
    if (!backendId) {
        console.log(`Server: [${source}] Zone "${zoneName}" doesn't use managed DSP. Ignoring.`);
        isProcessingSampleRateChange = false;
        return;
    }

    const activeDsp = getDspForZone(zoneName);

    // Ensure DSP is running before checking rate (if not running, currentDSPRate might be stale)
    const isActuallyRunning = activeDsp.isRunning();
    const currentDSPRate = activeDsp.currentState.sampleRate;

    // Allow forced restarts for album changes or playback health checks
    const isForceRecovery = source === 'AlbumChangeRecovery' || source === 'PlaybackHealthCheck';

    if (newRate === currentDSPRate && isActuallyRunning && !isForceRecovery) {
        console.log(`Server: [${source}] Rate triggers match current DSP rate (${currentDSPRate}Hz) and DSP running. Ignoring.`);
        isProcessingSampleRateChange = false;
        return;
    }

    // Robust transition sequence (NO PAUSE - Roon keeps sending audio):
    // 1. Mute immediately (user hears nothing, but Roon keeps streaming to BlackHole)
    // 2. Stop DSP (release audio device)
    // 3. Start DSP at new rate (captures the ongoing stream from BlackHole)
    // 4. Wait for DSP to be fully ready
    // 5. Seek to track start (muted, so user doesn't hear the jump)
    // 6. Unmute (audio now at correct rate from 0:00)

    try {
        // ============ PHASE 1: MUTE ============
        console.log(`Server: [Transition] Phase 1: Muting output...`);
        try {
            await roonController.control('mute');
            await new Promise(r => setTimeout(r, 200));
            console.log(`Server: [Transition] Output muted (Roon still streaming)`);
        } catch (muteErr) {
            console.warn('Server: [Transition] Mute failed, continuing without mute:', muteErr.message || muteErr);
        }

        // ============ PHASE 2: RESTART DSP ============
        console.log(`Server: [Transition] Phase 2: Restarting DSP at ${newRate}Hz (${zoneName === 'Raspberry' ? 'Remote' : 'Local'})...`);

        // Record restart time for debounce
        lastRestartTime = Date.now();

        // Stop current DSP
        await activeDsp.stop();
        activeDsp.shouldBeRunning = true;

        // Wait for audio device to be fully released (only needed for local DSP)
        if (zoneName !== 'Raspberry') {
            await new Promise(r => setTimeout(r, 1000));
        }

        // Check if we were in bypass mode - we need to respect this
        const wasInBypass = activeDsp.currentState.bypass;

        // Start DSP with new rate (respecting bypass mode)
        try {
            if (wasInBypass) {
                // Restart in bypass mode with new sample rate
                await activeDsp.startBypass(newRate);
                console.log(`Server: [Transition] CamillaDSP started in BYPASS mode at ${newRate}Hz`);
            } else {
                // Restart with filters
                let filterData = activeDsp.lastFilterData ? { ...activeDsp.lastFilterData } : null;

                // Fallback: Restore from file if memory is lost but preset is known (Persistence)
                if (!filterData && activeDsp.currentState.presetName) {
                    try {
                        console.log(`Server: [Transition] Restoring preset "${activeDsp.currentState.presetName}" from disk...`);
                        const presetPath = path.join(PRESETS_DIR, activeDsp.currentState.presetName);
                        if (fs.existsSync(presetPath)) {
                            const content = fs.readFileSync(presetPath, 'utf8');
                            filterData = FilterParser.parse(content);
                        }
                    } catch (restoreErr) {
                        console.error('Server: [Transition] Failed to restore preset:', restoreErr);
                    }
                }

                // Final fallback
                if (!filterData) filterData = { filters: [], preamp: -3 };

                const baseOptions = activeDsp.lastOptions ? { ...activeDsp.lastOptions } : { bitDepth: 24, presetName: activeDsp.currentState.presetName };
                const options = {
                    ...baseOptions,
                    sampleRate: newRate
                };
                await activeDsp.start(filterData, options);
                console.log(`Server: [Transition] CamillaDSP started at ${newRate}Hz`);
            }
        } catch (startError) {
            console.error('Server: [Transition] Failed to start CamillaDSP:', startError);
            // Try to unmute even on failure so user isn't stuck muted
            await roonController.control('unmute');
            isProcessingSampleRateChange = false;
            return;
        }

        // ============ PHASE 3: WAIT FOR DSP READY ============
        console.log(`Server: [Transition] Phase 3: Waiting for DSP to capture audio stream...`);
        await new Promise(r => setTimeout(r, 2000));

        // ============ PHASE 4: SEEK TO START ============
        console.log(`Server: [Transition] Phase 4: Seeking to track start...`);
        try {
            await roonController.control('seekToStart');
            await new Promise(r => setTimeout(r, 500));
            console.log(`Server: [Transition] Position reset to 0:00`);
        } catch (seekErr) {
            console.log('Server: [Transition] Seek failed, continuing anyway:', seekErr.message);
        }

        // ============ PHASE 5: UNMUTE ============
        console.log(`Server: [Transition] Phase 5: Unmuting - Enjoy!`);
        try {
            await roonController.control('unmute');
        } catch (unmuteErr) {
            console.warn('Server: [Transition] Unmute failed:', unmuteErr.message || unmuteErr);
        }

    } catch (e) {
        console.error('Server: [Transition] Error during transition:', e);
        // Emergency unmute
        try { await roonController.control('unmute'); } catch (_) { }
    } finally {
        isProcessingSampleRateChange = false;
    }
}

// ----------------------------------------------------------------------
// Playback Health Check (User Request: "Check if everything OK on Play")
// ----------------------------------------------------------------------
roonController.onPlaybackStart = async (zone) => {
    const zoneName = zone.display_name;
    const backendId = getBackendIdForZone(zoneName);

    // If it's a managed zone, perform health check
    if (backendId) {
        console.log(`Server: [PlaybackStart] Zone "${zoneName}" started playing. Performing health check...`);
        const activeDsp = getDspForZone(zoneName);

        // 1. Ensure Running first (starts if stopped)
        await activeDsp.ensureRunning();

        // 2. Force a sample rate consistency check
        // Only local Mac Mini can poll hardware rate via BlackHole
        if (backendId === 'local') {
            const currentRate = getBlackHoleSampleRate();
            if (currentRate) {
                handleSampleRateChange(currentRate, 'PlaybackHealthCheck', zoneName);
            } else {
                console.log('Server: [PlaybackStart] Warning: Could not detect BlackHole rate.');
            }
        } else {
            // For remote, just ensure we're at the expected rate
            const rate = activeDsp.currentState.sampleRate || 44100;
            handleSampleRateChange(rate, 'PlaybackHealthCheck', zoneName);
        }
    }
};

// ----------------------------------------------------------------------
// Event-Driven Switching (Instant)
// ----------------------------------------------------------------------
// Triggered immediately when Roon track metadata changes
roonController.onSampleRateChange = async (newRate, zone) => {
    const zoneName = zone?.display_name || getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    const backendId = getBackendIdForZone(zoneName);

    if (newRate === 'CHECK') {
        // CHECK: Verify if we should even probe hardware
        // If this is an external zone (not managed), probing hardware is useless.
        if (!backendId) {
            console.log(`Server: [ActiveProbe] Zone is "${zoneName}" (External). Skipping hardware probe.`);
            lastDetectedSampleRate = null; // Unknown rate
            return;
        }

        // For remote backends, ActiveProbe (based on BlackHole) is not applicable
        if (backendId !== 'local') {
            console.log(`Server: [ActiveProbe] Zone is remote. Skipping local hardware probe.`);
            return;
        }

        // First, check hardware rate WITHOUT stopping DSP
        const hwRate = getBlackHoleSampleRate();
        console.log(`Server: [ActiveProbe] Pre-check - Hardware: ${hwRate}Hz, DSP: ${activeDsp.currentState.sampleRate}Hz`);

        if (hwRate && hwRate !== activeDsp.currentState.sampleRate) {
            console.log(`Server: [ActiveProbe] Rate mismatch. Unlocking device...`);
            if (activeDsp.isRunning()) await activeDsp.stop();
            await new Promise(r => setTimeout(r, 1500));
            const detected = getBlackHoleSampleRate();
            if (detected) handleSampleRateChange(detected, 'ActiveProbe', zoneName);
        }

    } else if (newRate && newRate !== activeDsp.currentState.sampleRate) {
        console.log(`Server: Roon reported new rate: ${newRate}Hz (current: ${activeDsp.currentState.sampleRate}Hz). Source Zone: "${zoneName || 'unknown'}"`);
        // PASS ZONE TO HANDLER
        handleSampleRateChange(newRate, 'RoonMetadata', zoneName);
    } else {
        // Even if rate is same, we might want to update global state? 
        // handleSampleRateChange handles global state update even if it returns early for DSP.
        // But we need to call it if we want the UI to reflect Roon's rate even if matching.
        handleSampleRateChange(newRate, 'RoonMetadataUpdate', zoneName);
    }
};

// ----------------------------------------------------------------------
// Album Change Handler (Stream Recovery)
// ----------------------------------------------------------------------
// When album changes (different disc) but sample rate is the same,
// the audio stream may need recovery. Force DSP restart.
roonController.onAlbumChange = async (albumName, sameRate) => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);

    console.log(`Server: Album changed to "${albumName}" (sameRate: ${sameRate}) on zone "${zoneName}". Forcing DSP restart for stream recovery...`);

    if (!activeDsp.isRunning() || isProcessingSampleRateChange) {
        console.log('Server: DSP not running or already processing, skipping album change restart');
        return;
    }

    // Get current hardware rate
    // Note: Remote RPi doesn't use BlackHole, so we use their last known sample rate
    const isRemote = getBackendIdForZone(zoneName) === 'raspi';
    const hwRate = isRemote ? activeDsp.currentState.sampleRate : (getBlackHoleSampleRate() || activeDsp.currentState.sampleRate || 44100);

    // Force restart at the same rate to recover the stream
    handleSampleRateChange(hwRate, 'AlbumChangeRecovery', zoneName);
};

// ----------------------------------------------------------------------
// Fallback Polling (Legacy/Safety)
// ----------------------------------------------------------------------
setInterval(async () => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    const backendId = getBackendIdForZone(zoneName);
    const isRemote = backendId === 'raspi';

    // Hardware rate polling ONLY makes sense for the local Mac Mini (BlackHole)
    if (!isRemote) {
        const currentRate = getBlackHoleSampleRate();
        if (currentRate) {
            const dspRate = activeDsp.currentState.sampleRate;

            if (currentRate !== dspRate && activeDsp.isRunning() && !isProcessingSampleRateChange) {
                // Hardware rate differs from DSP - need to restart
                console.log(`Server: [Poll] Rate mismatch detected! Hardware: ${currentRate}Hz, DSP: ${dspRate}Hz. Restarting...`);
                handleSampleRateChange(currentRate, 'RateMismatchRecovery', zoneName);
            }
        }
    }

    // Crash recovery case (for both local and remote)
    if (activeDsp.shouldBeRunning && !activeDsp.isRunning() && !isProcessingSampleRateChange) {
        console.log(`Server: [Poll] ${isRemote ? 'Remote' : 'Local'} DSP Crash or Disconnect detected. Recovering...`);
        const rate = isRemote ? (activeDsp.currentState.sampleRate || 44100) : (getBlackHoleSampleRate() || 44100);
        handleSampleRateChange(rate, 'CrashRecovery', zoneName);
    }

    // Stop inactive managers (to avoid multiple instances/conflicts)
    for (const id in DSP_BACKENDS) {
        const mgr = DSP_BACKENDS[id].manager;
        if (mgr !== activeDsp && mgr.shouldBeRunning) {
            console.log(`Server: [Poll] Stopping inactive DSP backend: ${DSP_BACKENDS[id].name}`);
            mgr.stop().catch(e => { });
        }
    }

    // HISTORY CHECK
    const now = Date.now();
    const roonState = roonController.getNowPlaying();
    let currentTrack = null;
    let currentArtist = null;
    let currentAlbum = null;
    let isPlaying = false;
    let source = null;
    let device = null;

    if (roonState && roonController.activeZoneId) {
        // Roon is active
        source = 'roon';
        if (roonState.state === 'playing' || roonState.state === 'paused') {
            isPlaying = roonState.state === 'playing';
            currentTrack = roonState.track;
            currentArtist = roonState.artist;
            currentAlbum = roonState.album;
            const zone = roonController.zones.get(roonController.activeZoneId);
            device = zone ? zone.display_name : 'Unknown Zone';
        }
    } else {
        // Check Apple Music / System via media_keys (Simplified: assume if not Roon, check request could happen here but it's async)
        // For now, tracking Apple Music is harder in a sync loop. 
        // We will skip async Apple Music check in this sync loop to avoid blocking, 
        // or implement it if polling becomes async (it is async lambda).
        // Let's rely on Roon for now as primary, but if Roon isn't valid, we could try media_keys if we want full coverage.
    }

    // Logic:
    if (currentTrack && currentTrack !== historyState.currentTrack) {
        // Track Changed
        // Save previous if valid
        if (historyState.currentTrack && historyState.accumulatedTime > 30) {
            console.log(`History: Saving "${historyState.currentTrack}" (Listened ${historyState.accumulatedTime}s)`);
            db.saveTrack({
                title: historyState.currentTrack,
                artist: historyState.currentArtist,
                album: historyState.currentAlbum,
                style: historyState.metadata.genre || 'Unknown',
                source: historyState.currentSource,
                device: historyState.currentDevice,
                artworkUrl: historyState.metadata.artworkUrl,
                timestamp: Math.floor(historyState.startTime / 1000),
                durationListened: historyState.accumulatedTime
            }).catch(e => console.error('History Error:', e));
        }

        // New Track
        historyState.currentTrack = currentTrack;
        historyState.currentArtist = currentArtist;
        historyState.currentAlbum = currentAlbum;
        historyState.currentSource = source || 'apple'; // Default to Apple if not Roon (approx)
        historyState.currentDevice = device || 'Local / Mac';
        historyState.startTime = now;
        historyState.accumulatedTime = 0;
        historyState.isPlaying = isPlaying;

        // Initial metadata might already have Roon artwork
        historyState.metadata = {
            genre: null,
            artworkUrl: (source === 'roon' && roonState) ? roonState.artworkUrl : null
        };

        // Fetch Metadata (Genre / Fallback Artwork)
        getMetadataFromiTunes(currentTrack, currentArtist, currentAlbum).then(meta => {
            if (historyState.currentTrack === currentTrack) { // Ensure still same track
                // Keep Roon artwork if we have it, otherwise use iTunes
                historyState.metadata.genre = meta.genre;
                if (!historyState.metadata.artworkUrl && meta.artworkUrl) {
                    historyState.metadata.artworkUrl = meta.artworkUrl;
                }
                if (meta.genre) console.log(`History: Found genre for "${currentTrack}": ${meta.genre}`);
            }
        });

    } else if (currentTrack && currentTrack === historyState.currentTrack) {
        // Same Track, accumulate time
        if (isPlaying) {
            const delta = (now - historyState.lastCheck) / 1000;
            if (delta > 0 && delta < 10) { // prevent huge jumps on sleep/wake
                historyState.accumulatedTime += delta;
            }
        }
    } else if (!currentTrack && historyState.currentTrack) {
        // Stopped / Cleared
        if (historyState.accumulatedTime > 30) {
            console.log(`History: Saving "${historyState.currentTrack}" (Listened ${historyState.accumulatedTime}s) - Stopped`);
            db.saveTrack({
                title: historyState.currentTrack,
                artist: historyState.currentArtist,
                album: historyState.currentAlbum,
                style: historyState.metadata.genre || 'Unknown',
                source: historyState.currentSource,
                device: historyState.currentDevice,
                artworkUrl: historyState.metadata.artworkUrl,
                timestamp: Math.floor(historyState.startTime / 1000),
                durationListened: historyState.accumulatedTime
            }).catch(e => console.error('History Error:', e));
        }
        historyState.currentTrack = null;
        historyState.accumulatedTime = 0;
    }

    historyState.lastCheck = now;

}, 5000);

// History API
app.get('/api/history/stats', async (req, res) => {
    try {
        const range = req.query.range || 'all';
        const stats = await db.getStats(range);
        res.json(stats);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history/list', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const offset = (page - 1) * limit;

        const history = await db.getHistory(limit, offset);
        res.json({ items: history, page, limit });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});


// Routes
// 1. List Presets
app.get('/api/presets', (req, res) => {
    try {
        const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.txt'));
        res.json(files);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Get Preset Details
app.get('/api/presets/:name', (req, res) => {
    try {
        const filePath = path.join(PRESETS_DIR, req.params.name);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Not found' });

        const content = fs.readFileSync(filePath, 'utf8');
        const data = FilterParser.parse(content);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Save Preset (New!)
app.post('/api/presets', (req, res) => {
    try {
        const { name, filters, preamp } = req.body;
        // Basic validation
        if (!name || !filters) return res.status(400).json({ error: 'Missing data' });

        const textContent = FilterParser.toText({ filters, preamp: preamp || 0 });
        const filePath = path.join(PRESETS_DIR, name.endsWith('.txt') ? name : `${name}.txt`);

        fs.writeFileSync(filePath, textContent);
        res.json({ success: true, path: filePath });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Start DSP
app.post('/api/start', async (req, res) => {
    try {
        const { presetName, directConfig, sampleRate, bitDepth } = req.body;
        let filterData;

        if (directConfig) {
            // User sent manual config (Previewing unsaved)
            filterData = directConfig;
        } else if (presetName) {
            // Load from file
            const filePath = path.join(PRESETS_DIR, presetName);
            const content = fs.readFileSync(filePath, 'utf8');
            filterData = FilterParser.parse(content);
        } else {
            return res.status(400).json({ error: 'No preset specified' });
        }

        // Determine which DSP to use
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);

        console.log(`API [v6]: Start called for zone "${zoneName}". Selected DSP: ${activeDsp.constructor.name}`);

        // Auto-detect sample rate from BlackHole if not specified or use BlackHole's current rate
        const detectedRate = getBlackHoleSampleRate();
        const options = {
            sampleRate: parseInt(sampleRate) || detectedRate || 96000,
            bitDepth: parseInt(bitDepth) || 24,
            presetName: presetName
        };
        console.log(`Starting ${zoneName || 'Local'} DSP with sample rate: ${options.sampleRate}Hz`);

        await activeDsp.start(filterData, options);
        res.json({ success: true, state: 'running', sampleRate: options.sampleRate, bitDepth: options.bitDepth, backend: getBackendIdForZone(zoneName) });
    } catch (err) {
        console.error('API Start Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Stop DSP
app.post('/api/stop', async (req, res) => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    await activeDsp.stop();
    res.json({ success: true, state: 'stopped' });
});

// 5b. Bypass Mode (no DSP processing, direct audio)
app.post('/api/bypass', async (req, res) => {
    try {
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        const rate = getBlackHoleSampleRate() || 96000;
        await activeDsp.startBypass(rate);
        res.json({ success: true, state: 'bypass', sampleRate: rate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Status (includes current sample rate for dynamic UI updates)
// Cache status for 300ms to prevent repeated expensive calls
let cachedStatus = { data: null, timestamp: 0 };
const STATUS_CACHE_MS = 300;  // Cache for 300ms

app.get('/api/status', (req, res) => {
    const now = Date.now();

    // Return cached status if recent enough
    if (cachedStatus.data && now - cachedStatus.timestamp < STATUS_CACHE_MS) {
        return res.json(cachedStatus.data);
    }

    // Determine which DSP to query based on active zone
    const zoneName = getActiveZoneName();
    const backendId = getBackendIdForZone(zoneName);
    const activeDsp = getDspForZone(zoneName);
    const isRemote = backendId === 'raspi';

    // Get actual hardware sample rate for real-time accuracy (only for local DSP)
    const hardwareRate = isRemote ? null : getBlackHoleSampleRate();
    const dspRate = activeDsp.currentState.sampleRate || 0;

    // Use hardware rate if available, otherwise use DSP reported rate
    const currentSampleRate = hardwareRate || dspRate;

    // Determine source bit depth (prefer Roon's actual source if available)
    let currentBitDepth = activeDsp.currentState.bitDepth || 24;

    // If Roon is active/playing, try to get the real source bit depth
    const roonState = roonController.getNowPlaying();
    if (roonState && roonState.bitDepth) {
        currentBitDepth = roonState.bitDepth;
    }

    // If Roon provides sample rate info, use that
    if (roonState && roonState.sampleRate) {
        // This would come from signal_path if available
    }

    const status = {
        running: activeDsp.isRunning(),
        bypass: activeDsp.currentState.bypass || false,
        sampleRate: currentSampleRate,
        bitDepth: currentBitDepth,
        presetName: activeDsp.currentState.presetName || null,
        filtersCount: activeDsp.currentState.filtersCount || 0,
        preamp: activeDsp.currentState.preamp || 0,
        // Diagnostic: rate mismatch detection
        rateMismatch: hardwareRate && dspRate && hardwareRate !== dspRate,
        roonSampleRate: lastDetectedSampleRate,
        // Zone and backend info for frontend sync
        backend: backendId,
        isDspManaged: !!backendId,
        zone: zoneName || null,
        activeZoneId: roonController.activeZoneId || null,
        isAutoSelected: !!zoneName // Signal to frontend that this was a zone-based selection
    };

    // Cache the result
    cachedStatus = { data: status, timestamp: now };

    res.json(status);
});

// 6a. Health Status (comprehensive watchdog report)
app.get('/api/health', (req, res) => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);

    // Check if dsp-manager has the getHealthReport method
    if (typeof activeDsp.getHealthReport === 'function') {
        res.json(activeDsp.getHealthReport());
    } else {
        // Fallback for remote DSP or older versions
        res.json({
            dsp: {
                running: activeDsp.isRunning(),
                uptime: 0,
                restartCount: 0,
                bypass: activeDsp.currentState?.bypass || false
            },
            devices: {
                capture: { name: 'unknown', status: 'unknown' },
                playback: { name: activeDsp.currentState?.device || 'unknown', status: 'unknown' }
            },
            signal: {
                present: false,
                levels: { left: -1000, right: -1000 },
                silenceDuration: 0
            },
            lastError: null,
            lastCheck: null
        });
    }
});

// 6b. Sync Endpoint (Receive updates from peers)
app.post('/api/sync/zone', (req, res) => {
    const { zoneId, zoneName } = req.body;
    console.log(`Sync: Received zone update: "${zoneName}" (${zoneId})`);

    if (zoneId && zoneId !== roonController.activeZoneId) {
        roonController.activeZoneId = zoneId;
        zoneConfig.lastActiveZoneId = zoneId;
        zoneConfig.lastActiveZoneName = zoneName;
        saveZoneConfig();

        // If the new zone is remote/local specific, we might need to connect/ensure running
        const activeDsp = getDspForZone(zoneName);
        activeDsp.ensureRunning().catch(e => console.error('Sync: Failed to ensure DSP running:', e));
    }

    res.json({ success: true });
});

// 6c. Reboot Endpoint
app.post('/api/system/reboot', (req, res) => {
    console.log('System: Reboot requested via API');

    // Check if running on Pi (linux + specific user or hostname?)
    // Or just try sudo reboot

    exec('sudo reboot', (error, stdout, stderr) => {
        if (error) {
            console.error('Reboot failed:', stderr || error.message);
            return res.status(500).json({ error: 'Reboot failed' });
        }
        res.json({ success: true, message: 'Rebooting...' });
    });
});

// 7. macOS Media Controls (via Python script)
const { exec } = require('child_process');

const MEDIA_SCRIPT = path.join(__dirname, 'media_keys.py');

const runMediaCommand = (action, args = []) => {
    return new Promise((resolve, reject) => {
        const argsStr = args.length > 0 ? ' ' + args.join(' ') : '';
        exec(`python3 "${MEDIA_SCRIPT}" ${action}${argsStr}`, (error, stdout, stderr) => {
            if (error) {
                console.error('Media key error:', stderr || error.message);
                reject(error);
            } else {
                console.log('Media key:', stdout.trim());
                // Broadcast for reactive UI if it's a control command (not info/queue)
                if (['play', 'pause', 'next', 'prev', 'stop', 'play_queue_item'].includes(action)) {
                    broadcast('metadata_update', { source: 'apple', action });
                }
                resolve(stdout.trim());
            }
        });
    });
};

async function getArtworkFromiTunes(track, artist, album) {
    if (!artist && !track && !album) return { artworkUrl: null, genre: null };

    const query = encodeURIComponent(`${track || ''} ${artist || ''} ${album || ''}`.trim());
    const url = `https://itunes.apple.com/search?term=${query}&entity=song&limit=1&country=ES`;
    console.log(`iTunes: Searching for artwork: ${url}`);

    try {
        const response = await axios.get(url, { timeout: 4000 });
        if (response.data.results && response.data.results[0]) {
            const result = response.data.results[0];
            let artworkUrl = result.artworkUrl100 || null;
            if (artworkUrl) {
                artworkUrl = artworkUrl.replace('100x100bb.jpg', '600x600bb.jpg');
            }
            const genre = result.primaryGenreName;
            console.log(`iTunes: SUCCESS for "${track}". Artwork: ${artworkUrl}`);
            return { artworkUrl, genre };
        }
        console.log(`iTunes: No results for "${track}" by "${artist}"`);
    } catch (e) {
        console.error(`iTunes Search ERROR for "${track}":`, e.message);
    }
    return { artworkUrl: null, genre: null };
}

async function getMetadataFromiTunes(track, artist, album) {
    return getArtworkFromiTunes(track, artist, album);
}

async function getArtistInfo(artist, album) {
    if (!artist) return { bio: null, albumInfo: null };

    const cleanArtist = artist
        .split(/[,&/]/)[0]
        .replace(/\s*\(feat\..*?\)/gi, '')
        .replace(/\s*\(ft\..*?\)/gi, '')
        .replace(/\s*feat\..*?$/gi, '')
        .trim();

    const cleanAlbum = album ? album
        .replace(/\s*\(.*?\)/g, '')
        .replace(/\s*\[.*?\]/g, '')
        .trim() : null;

    const headers = {
        'User-Agent': 'ArtisNovaDSP/1.2.6 (https://github.com/ecemcod/artisnovaDSP)',
        'Accept': 'application/json'
    };

    console.log(`MusicBrainz: Searching for Artist: "${cleanArtist}" and Album: "${cleanAlbum}"`);

    try {
        // 1. Search Artist in MusicBrainz
        const artistSearchUrl = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(cleanArtist)}&fmt=json`;
        const artistRes = await axios.get(artistSearchUrl, { headers, timeout: 5000 });

        const mbArtist = artistRes.data.artists?.[0];
        if (!mbArtist) {
            console.log(`MusicBrainz: No artist found for "${cleanArtist}"`);
            return { bio: "No se encontró información en MusicBrainz.", source: 'MusicBrainz' };
        }

        const mbid = mbArtist.id;
        const country = mbArtist.country || mbArtist.area?.name || 'Unknown';
        const type = mbArtist.type || 'Individual';
        const lifeSpan = mbArtist['life-span'] || {};
        const activeYears = lifeSpan.begin ? `${lifeSpan.begin}${lifeSpan.end ? ' - ' + lifeSpan.end : ' - Present'}` : 'Unknown';
        const tags = mbArtist.tags ? mbArtist.tags.slice(0, 5).map(t => t.name).join(', ') : 'Music';

        // 2. Search Release (Album) in MusicBrainz - SURGICAL SEARCH WITH ALIASES
        let mbRelease = null;
        if (cleanAlbum) {
            // Try multiple title variations for better matching
            const titleVariations = [cleanAlbum];

            // Known album title variations (some albums have symbol names)
            if (cleanAlbum.toLowerCase() === 'blackstar') {
                titleVariations.push('★'); // David Bowie's album
            }

            let allCandidates = [];

            for (const variation of titleVariations) {
                const albumQuery = `release:"${variation}" AND arid:${mbid}`;
                const releaseSearchUrl = `https://musicbrainz.org/ws/2/release/?query=${encodeURIComponent(albumQuery)}&fmt=json`;
                try {
                    const releaseRes = await axios.get(releaseSearchUrl, { headers, timeout: 5000 });
                    allCandidates = allCandidates.concat(releaseRes.data.releases || []);
                } catch (e) {
                    console.warn(`MusicBrainz search failed for variation "${variation}":`, e.message);
                }
            }

            // Deduplicate by release ID
            const uniqueCandidates = allCandidates.filter((r, i, arr) =>
                arr.findIndex(x => x.id === r.id) === i
            );

            // Priority logic: 
            // 1. Prefer releases with release-group type "Album" over "Single", "EP", etc.
            // 2. Among same type, prefer higher track count (more complete release)
            // 3. Exact title match gets bonus priority
            const scored = uniqueCandidates.map(r => {
                let score = 0;
                const rgType = r['release-group']?.['primary-type'] || '';

                if (rgType === 'Album') score += 100;
                else if (rgType === 'EP') score += 50;
                else if (rgType === 'Single') score += 10;

                // Track count scoring: prefer standard album length (7-15 tracks)
                // Penalize releases with unusually high track counts (deluxe/compilations may have duplicates)
                const trackCountNum = r['track-count'] || 0;
                if (trackCountNum >= 7 && trackCountNum <= 15) {
                    score += 30; // Sweet spot for standard albums
                } else if (trackCountNum > 0) {
                    score += Math.min(trackCountNum, 20); // Less bonus for unusual track counts
                }

                // Exact title match bonus (check against all variations)
                const titleLower = (r.title || '').toLowerCase();
                if (titleVariations.some(v => v.toLowerCase() === titleLower)) {
                    score += 200;
                }

                return { release: r, score };
            });

            // Sort by score descending
            scored.sort((a, b) => b.score - a.score);

            mbRelease = scored[0]?.release || null;
            console.log(`MusicBrainz: Selected release "${mbRelease?.title}" (type: ${mbRelease?.['release-group']?.['primary-type']}, tracks: ${mbRelease?.['track-count']})`);
        }

        // 3. Get Wikipedia Bio via MB Relations
        const artistDetailsUrl = `https://musicbrainz.org/ws/2/artist/${mbid}?inc=url-rels&fmt=json`;
        const detailsRes = await axios.get(artistDetailsUrl, { headers, timeout: 5000 });

        let wikiTitle = null;
        let richBio = null;
        let wikiUrl = null;

        // Try direct Wikipedia relation first
        const wikiRel = detailsRes.data.relations?.find(r => r.type === 'wikipedia');
        if (wikiRel && wikiRel.url?.resource) {
            wikiTitle = wikiRel.url.resource.split('/').pop();
        } else {
            // Fallback: Try Wikidata bridge
            const wdRel = detailsRes.data.relations?.find(r => r.type === 'wikidata');
            if (wdRel && wdRel.url?.resource) {
                const wdId = wdRel.url.resource.split('/').pop();
                try {
                    const wdUrl = `https://www.wikidata.org/wiki/Special:EntityData/${wdId}.json`;
                    const wdRes = await axios.get(wdUrl, { headers, timeout: 3000 });
                    const enWiki = wdRes.data.entities[wdId].sitelinks?.enwiki;
                    if (enWiki) {
                        wikiTitle = enWiki.title.replace(/ /g, '_');
                    }
                } catch (e) {
                    console.warn(`Wikidata bridge failed for ${wdId}`);
                }
            }
        }

        if (wikiTitle) {
            try {
                const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${wikiTitle}&format=json&origin=*`;
                const extractRes = await axios.get(extractUrl, { headers, timeout: 3000 });
                const pages = extractRes.data.query.pages;
                const pageId = Object.keys(pages)[0];
                richBio = pages[pageId].extract;
                wikiUrl = `https://en.wikipedia.org/wiki/${wikiTitle}`;
            } catch (e) {
                console.warn('Wikipedia extractor failed for', wikiTitle);
            }
        }

        const bio = richBio || `${mbArtist.name} is a ${type.toLowerCase()} from ${country}, active during ${activeYears}. Genre tags: ${tags}.`;

        // 4. ENRICHED ALBUM DATA: Fetch tracklist and credits
        let albumData = null;
        if (mbRelease) {
            const releaseId = mbRelease.id;
            const releaseDate = mbRelease.date || 'Unknown';
            const label = mbRelease['label-info']?.[0]?.label?.name || 'Independent';
            const trackCount = mbRelease['track-count'] || 0;
            const releaseType = mbRelease['release-group']?.['primary-type'] || 'Album';

            // Fetch detailed release info with recordings and artist relations
            let tracklist = [];
            let credits = [];

            try {
                const detailUrl = `https://musicbrainz.org/ws/2/release/${releaseId}?inc=recordings+artist-rels+label-rels&fmt=json`;
                const detailRes = await axios.get(detailUrl, { headers, timeout: 6000 });

                // Extract tracklist from media and collect recording IDs
                const recordingIds = [];
                if (detailRes.data.media) {
                    detailRes.data.media.forEach((medium, discIndex) => {
                        if (medium.tracks) {
                            medium.tracks.forEach(track => {
                                const durationMs = track.length || track.recording?.length || 0;
                                const mins = Math.floor(durationMs / 60000);
                                const secs = Math.floor((durationMs % 60000) / 1000);
                                tracklist.push({
                                    disc: discIndex + 1,
                                    number: track.position,
                                    title: track.title || track.recording?.title || 'Unknown',
                                    duration: durationMs > 0 ? `${mins}:${secs.toString().padStart(2, '0')}` : '',
                                    recordingId: track.recording?.id
                                });
                                if (track.recording?.id) {
                                    recordingIds.push(track.recording.id);
                                }
                            });
                        }
                    });
                }

                // Extract credits from release-level relations first
                if (detailRes.data.relations) {
                    detailRes.data.relations.forEach(rel => {
                        if (rel.artist) {
                            // Use specific instrument attributes if available, otherwise fall back to type
                            let role = rel.type?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Contributor';
                            if (rel.attributes && rel.attributes.length > 0) {
                                role = rel.attributes.join(', ').replace(/\b\w/g, c => c.toUpperCase());
                            }
                            credits.push({ name: rel.artist.name, role });
                        }
                    });
                }

                // If no release-level credits, fetch from FIRST recording only (for speed)
                if (credits.length === 0 && recordingIds.length > 0) {
                    try {
                        const recUrl = `https://musicbrainz.org/ws/2/recording/${recordingIds[0]}?inc=artist-rels&fmt=json`;
                        const recRes = await axios.get(recUrl, { headers, timeout: 5000 });
                        if (recRes.data.relations) {
                            recRes.data.relations.forEach(rel => {
                                if (rel.artist) {
                                    // Use specific instrument attributes if available
                                    let role = rel.type?.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) || 'Contributor';
                                    if (rel.attributes && rel.attributes.length > 0) {
                                        role = rel.attributes.join(', ').replace(/\b\w/g, c => c.toUpperCase());
                                    }

                                    // Deduplicate by NAME only (same person may have multiple roles, show once)
                                    if (!credits.some(c => c.name === rel.artist.name)) {
                                        credits.push({ name: rel.artist.name, role });
                                    }
                                }
                            });
                        }
                        console.log(`MusicBrainz: Extracted ${credits.length} credits from recording for ${mbRelease.title}`);
                    } catch (e) {
                        console.warn(`Failed to fetch credits for recording:`, e.message);
                    }
                }
            } catch (e) {
                console.warn('MusicBrainz release details fetch failed:', e.message);
            }

            albumData = {
                title: mbRelease.title,
                date: releaseDate,
                label: label,
                type: releaseType,
                trackCount: trackCount,
                tracklist: tracklist.slice(0, 100), // Limit to 100 tracks for performance
                credits: credits,
                albumUrl: `https://musicbrainz.org/release/${releaseId}`
            };
        }

        return {
            artist: {
                name: mbArtist.name,
                bio: bio,
                artistUrl: wikiUrl || `https://musicbrainz.org/artist/${mbid}`,
                country: country,
                activeYears: activeYears,
                tags: tags
            },
            album: albumData,
            source: richBio ? 'MusicBrainz + Wikipedia' : 'MusicBrainz'
        };

    } catch (e) {
        console.error('MusicBrainz API Error:', e.message);
        return { artist: { bio: "Error al conectar con MusicBrainz." }, album: null, source: 'MusicBrainz' };
    }
}

const getLyricsFromLrcLib = async (track, artist) => {
    if (!artist || !track) return null;

    // 1. Less aggressive cleaning
    let cleanTrack = track
        .replace(/\s*\([^)]*(Version|Remaster|Explicit|Deluxe|Edition|Live|Recorded|Remix|Single|EP|Anniversary|Demo|Take|Alternate|Acoustic|Edit|Mix)[^)]*\)/gi, '')
        .replace(/\s*\[[^\]]*(Version|Remaster|Explicit|Deluxe|Edition|Live|Recorded|Remix|Single|EP|Anniversary|Demo|Take|Alternate|Acoustic|Edit|Mix)[^\]]*\]/gi, '')
        .replace(/\s*- (Live|Remaster|Remix|Single|EP|Anniversary|Demo|Take|Alternate|Acoustic|Edit|Mix)$/gi, '')
        .split(' - ')[0] // Take first part if there's a dash like "Song Name - Live"
        .trim();

    let cleanArtist = artist
        .split(/[,&/]/)[0] // Take first artist if multiple (comma, ampersand, slash)
        .replace(/\s*\(feat\..*?\)/gi, '')
        .replace(/\s*\(ft\..*?\)/gi, '')
        .replace(/\s*feat\..*?$/gi, '')
        .trim();

    const fetchLyrics = async (url, params = {}) => {
        const MAX_RETRIES = 1;  // Reduced from 2 for faster response
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await axios.get(url, {
                    params,
                    timeout: 1500,  // Drastically reduced for fast failure
                    headers: { 'User-Agent': 'ArtisNovaDSP/1.2.6 (https://github.com/ecemcod/artisnovaDSP)' }
                });
                return response.data;
            } catch (e) {
                if (e.response && e.response.status === 404) return { status: 404 };
                console.error(`Lyrics API Error [${url}]:`, e.message);
                return null;  // Fail fast, no retries
            }
        }
    };

    // Helper to check valid result
    const isValid = (item) => item && (item.plainLyrics || item.syncedLyrics || item.instrumental);

    // Strategy A: Direct Get (Artist + Track)
    console.log(`Lyrics: [Strategy A] Trying Get for "${cleanArtist}" - "${cleanTrack}"`);
    let data = await fetchLyrics('https://lrclib.net/api/get', {
        artist_name: cleanArtist,
        track_name: cleanTrack
    });

    if (isValid(data)) {
        console.log(`Lyrics: Strategy A Success`);
        return { plain: data.plainLyrics, synced: data.syncedLyrics, instrumental: data.instrumental };
    }
    console.log(`Lyrics: Strategy A Failed`);

    // Strategy B: Search Fallback
    const searchQuery = `${cleanArtist} ${cleanTrack}`.replace(/[&/]/g, ' ').replace(/\s+/g, ' ').trim();
    console.log(`Lyrics: [Strategy B] Trying Search for "${searchQuery}"`);
    let searchData = await fetchLyrics('https://lrclib.net/api/search', {
        q: searchQuery
    });

    if (Array.isArray(searchData) && searchData.length > 0) {
        // Find best match (ignoring case)
        const bestMatch = searchData.find(item =>
            item.trackName.toLowerCase().includes(cleanTrack.toLowerCase()) ||
            cleanTrack.toLowerCase().includes(item.trackName.toLowerCase())
        ) || searchData[0];

        if (isValid(bestMatch)) {
            console.log(`Lyrics: Strategy B Success (Best Match: ${bestMatch.artistName} - ${bestMatch.trackName})`);
            return { plain: bestMatch.plainLyrics, synced: bestMatch.syncedLyrics, instrumental: bestMatch.instrumental };
        }
    }
    console.log(`Lyrics: Strategy B Failed`);

    // Strategies C, D, E disabled for performance - max 3s for lyrics
    console.log(`Lyrics: Giving up after A+B for "${artist}" - "${track}"`);
    return null;
};

app.post('/api/media/playpause', async (req, res) => {
    const source = req.query.source || req.body.source;
    console.log(`Server: Received playpause request. Source=${source}`);
    try {
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);

        if (source === 'roon' && roonController.activeZoneId) {
            console.log(`Server: Sending 'playpause' to Roon Zone ${roonController.activeZoneId}`);
            await roonController.control('playpause');
        } else if (source === 'lms') {
            console.log('Server: Sending playpause to LMS');
            await lmsController.control('playpause');
        } else {
            console.log('Server: Sending media key play command');
            await runMediaCommand('play');
        }

        // Ensure DSP is running in the background for responsiveness
        activeDsp.ensureRunning().catch(e => console.error('Background ensureRunning failed:', e));

        res.json({ success: true, action: 'playpause' });
    } catch (e) {
        console.error('Play/pause CRITICAL ERROR:', e);
        res.status(500).json({ error: 'Failed to toggle play/pause' });
    }
});

app.post('/api/media/next', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);

        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('next');
        } else if (source === 'lms') {
            await lmsController.control('next');
        } else {
            await runMediaCommand('next');
        }

        activeDsp.ensureRunning().catch(e => console.error('Background ensureRunning failed:', e));
        res.json({ success: true, action: 'next' });
    } catch (e) {
        console.error('Next track error:', e);
        res.status(500).json({ error: 'Failed to skip to next track' });
    }
});

app.post('/api/media/stop', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('playpause');
        } else if (source === 'lms') {
            await lmsController.control('stop');
        } else {
            await runMediaCommand('stop');
        }
        res.json({ success: true, action: 'stop' });
    } catch (e) {
        console.error('Stop error:', e);
        res.status(500).json({ error: 'Failed to stop' });
    }
});

app.post('/api/media/prev', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);

        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('prev');
        } else if (source === 'lms') {
            await lmsController.control('previous');
        } else {
            await runMediaCommand('prev');
        }

        activeDsp.ensureRunning().catch(e => console.error('Background ensureRunning failed:', e));
        res.json({ success: true, action: 'prev' });
    } catch (e) {
        console.error('Prev track error:', e);
        res.status(500).json({ error: 'Failed to go to previous track' });
    }
});

app.post('/api/media/seek', async (req, res) => {
    const { position, source } = req.body;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('seek', position);
        } else if (source === 'lms') {
            await lmsController.seek(position);
        } else {
            await runMediaCommand(`seek ${position}`);
        }
        res.json({ success: true, position });
    } catch (e) {
        console.error('Seek error:', e);
        res.status(500).json({ error: 'Failed to seek' });
    }
});

app.post('/api/media/playqueue', async (req, res) => {
    const { id, source, index } = req.body;
    console.log(`Server: PlayQueue request Source=${source} ID=${id} Index=${index}`);

    try {
        if (source === 'roon' && roonController.activeZoneId) {
            roonController.playQueueItem(id);
            res.json({ success: true });
        } else if (source === 'apple') {
            if (index === undefined || index === null) {
                return res.status(400).json({ error: 'Index required for Apple Music' });
            }
            // Use media_keys.py to play by relative index
            const result = await runMediaCommand('play_queue_item', [index]);
            console.log('Apple Play Queue Result:', result);
            res.json({ success: true, result });
        } else {
            res.json({ success: false, error: 'Not supported for this source' });
        }
    } catch (e) {
        console.error('Play queue item error:', e);
        res.status(500).json({ error: 'Failed to play queue item' });
    }
});


app.get('/api/media/queue', async (req, res) => {
    const source = req.query.source || 'apple';
    console.log(`Server: Fetching queue for source: ${source}`);

    try {
        if (source === 'roon') {
            const queue = roonController.getQueue();
            return res.json({ queue });
        }

        const output = await runMediaCommand('queue');
        const queueData = JSON.parse(output);

        if (queueData && queueData.queue && queueData.queue.length > 0) {
            // Batched artwork lookup for the first 50 tracks (only for non-Roon to avoid overhead)
            const enhancedQueue = await Promise.all(queueData.queue.slice(0, 50).map(async (item) => {
                try {
                    const query = encodeURIComponent(`${item.track} ${item.artist}`);
                    const itunesRes = await axios.get(`https://itunes.apple.com/search?term=${query}&entity=song&limit=1`, { timeout: 1000 });
                    if (itunesRes.data.results && itunesRes.data.results[0]) {
                        return {
                            ...item,
                            artworkUrl: itunesRes.data.results[0].artworkUrl100.replace('100x100', '300x300')
                        };
                    }
                } catch (e) { }
                return item;
            }));
            res.json({ queue: enhancedQueue });
        } else {
            res.json(queueData);
        }
    } catch (e) {
        console.error('Media queue error:', e);
        res.json({ queue: [] });
    }
});

// Get now playing info
app.get('/api/media/info', async (req, res) => {
    const source = req.query.source;
    try {
        if (source === 'roon') {
            const raw = roonController.getNowPlaying() || { state: 'unknown' };
            const info = { ...raw };

            const zone = roonController.zones.get(roonController.activeZoneId);
            info.device = zone ? zone.display_name : 'Unknown Zone';
            if (info.track === historyState.currentTrack) {
                info.style = historyState.metadata.genre;
            }

            // Dynamic Signal Path Generation from Roon Metadata
            // Dynamic Signal Path Generation from Roon Metadata
            let uiNodes = [];
            let pathQuality = 'lossless';

            if (info.signalPath && Array.isArray(info.signalPath)) {
                // Map Roon's native signal path to our UI format
                uiNodes = info.signalPath.map(node => {
                    let type = 'processing';
                    if (node.type === 'source') type = 'source';
                    if (node.type === 'output') type = 'output';

                    // Build details string from quality info
                    let details = '';
                    if (node.quality?.sample_rate) details += `${node.quality.sample_rate / 1000}kHz `;
                    if (node.quality?.bits_per_sample) details += `${node.quality.bits_per_sample}-bit `;
                    if (node.format) details += `• ${node.format} `;

                    return {
                        type: type,
                        description: node.name || node.type,
                        details: details.trim() || 'Processing',
                        status: 'lossless' // Simplified status mapping
                    };
                });
            } else {
                // Fallback if no detailed signal path available
                const zoneName = info.device;
                const backendId = getBackendIdForZone(zoneName);
                const activeDsp = getDspForZone(zoneName);

                // Use detected sample rate if available
                const sr = activeDsp.currentState.sampleRate || 0;
                const rateStr = sr ? `${sr / 1000}kHz` : 'Unknown';
                const isHiRes = sr > 48000;
                pathQuality = isHiRes ? 'enhanced' : 'lossless';

                uiNodes = [
                    {
                        type: 'source',
                        description: isHiRes ? 'High Resolution Audio' : 'Standard Resolution',
                        details: `${rateStr} • PCM • ${backendId ? '(Processing)' : '(Direct)'}`,
                        status: pathQuality
                    }
                ];
            }

            // Always Add DSP and Final Output nodes if DSP is running (Chain: Roon -> DSP -> Hardware)
            // BUT only if we are actually playing through a managed zone
            const zoneName = info.device;
            const activeDsp = getDspForZone(zoneName);
            const backendId = getBackendIdForZone(zoneName);
            const isRemote = backendId === 'raspi';

            if (activeDsp.isRunning() && backendId) {
                uiNodes.push(
                    {
                        type: 'dsp',
                        description: isRemote ? 'CamillaDSP (Remote)' : 'CamillaDSP',
                        details: `64-bit Processing • ${activeDsp.currentState.presetName || 'Custom'}`,
                        status: 'enhanced'
                    },
                    {
                        type: 'output',
                        description: isRemote ? 'Raspberry Pi DAC' : (activeDsp.currentState.device || 'D50 III'),
                        details: `${activeDsp.currentState.sampleRate / 1000}kHz Output`,
                        status: 'enhanced'
                    }
                );
            }

            info.signalPath = {
                quality: pathQuality,
                nodes: uiNodes
            };

            return res.json(info);
        } else if (source === 'lms') {
            const data = await lmsController.getStatus();
            const info = { ...data };
            info.device = 'Raspberry Pi (Streaming)';

            // Add Signal Path for LMS
            info.signalPath = {
                quality: 'lossless',
                nodes: [
                    {
                        type: 'source',
                        description: 'Lyrion Music Server',
                        details: `${info.format || 'PCM'} • ${info.bitrate || ''}`,
                        status: 'lossless'
                    },
                    {
                        type: 'dsp',
                        description: 'CamillaDSP (Remote)',
                        details: '64-bit Processing',
                        status: 'enhanced'
                    },
                    {
                        type: 'output',
                        description: 'Raspberry Pi DAC',
                        details: 'Hardware Output',
                        status: 'enhanced'
                    }
                ]
            };
            if (info.artworkUrl) {
                const trackId = info.artworkUrl.split('/music/')[1]?.split('/')[0];
                if (trackId) info.artworkUrl = `/api/media/lms/artwork/${trackId}?id=${trackId}`;
            }
            return res.json(info);
        }

        // Default: Apple Music / System
        if (isRunningOnPi) {
            // On Pi, we don't have Apple Music local control
            return res.json({
                state: 'stopped',
                track: '',
                artist: '',
                album: '',
                artworkUrl: null,
                position: 0,
                duration: 0,
                device: 'Apple Music (Remote)',
                signalPath: { quality: 'lossless', nodes: [] }
            });
        }


        const zoneName = source === 'apple' ? 'Camilla' : getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        const output = await runMediaCommand('info');
        const info = JSON.parse(output);
        info.device = 'Local / Mac';
        if (info.track === historyState.currentTrack) {
            info.style = historyState.metadata.genre;
        }

        // Try iTunes if local artwork failed or is missing
        if (!info.artwork && (info.track || info.album) && info.artist) {
            const meta = await getArtworkFromiTunes(info.track, info.artist, info.album);
            info.artworkUrl = meta.artworkUrl;
        } else if (info.artwork) {
            // Use a stable hash based on track/artist to provide a stable URL and avoid flickering
            const crypto = require('crypto');
            const trackHash = crypto.createHash('md5').update(`${info.track}-${info.artist}`).digest('hex').substring(0, 8);
            info.artworkUrl = `/api/media/artwork?h=${trackHash}`;
        }

        // Add Signal Path for local source (Apple Music / System)
        // CRITICAL: We use a fixed zoneName 'Camilla' and avoid any dependency on Roon active zone
        // to prevent "flapping" UI when Roon is playing in the background.
        const staticZone = 'Camilla';
        const staticDsp = getDspForZone(staticZone);

        info.signalPath = {
            quality: 'lossless',
            nodes: [
                {
                    type: 'source',
                    description: 'Apple Music / System',
                    details: 'CoreAudio Local Stream (Lossless)',
                    status: 'lossless'
                },
                {
                    type: 'dsp',
                    description: 'CamillaDSP (Local)',
                    details: staticDsp.currentState?.presetName ? `64-bit • ${staticDsp.currentState.presetName}` : '64-bit Processing',
                    status: 'enhanced'
                },
                {
                    type: 'output',
                    description: staticDsp.currentState?.device || 'D50 III',
                    details: staticDsp.currentState?.sampleRate ? `${staticDsp.currentState.sampleRate / 1000}kHz Output` : 'High Res Output',
                    status: 'enhanced'
                }
            ]
        };

        return res.json(info);
    } catch (e) {
        console.error('Media Info Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Get Artist Bio / Info
app.get('/api/media/artist-info', async (req, res) => {
    const { artist, album } = req.query;
    try {
        const info = await getArtistInfo(artist, album);
        res.json(info);
    } catch (e) {
        console.error('Artist Info API Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Remote Dashboard Config
app.get('/api/config/remote', (req, res) => {
    res.json({
        remoteUrl: isRunningOnPi ? null : 'http://raspberrypi.local:3000'
    });
});

// Unified Zones (Apple Music + Roon + LMS)
app.get('/api/media/zones', async (req, res) => {
    const list = [];

    // 1. Add Apple Music / System - ONLY ON MAC
    if (!isRunningOnPi) {
        list.push({
            id: 'apple',
            name: 'Apple Music / System',
            state: 'ready',
            active: true,
            source: 'apple'
        });
    }

    // 2. Add Roon Zones
    const roonZones = roonController.getZones();
    roonZones.forEach(z => list.push({ ...z, source: 'roon' }));

    // 3. Add LMS Players - FILTERED TO ONLY SHOW THE PI
    try {
        const lmsPlayers = await lmsController.getPlayers();
        // Only show the player that matches our configured playerId (the Pi itself)
        const localPiPlayer = lmsPlayers.find(p => p.id === lmsController.playerId);
        if (localPiPlayer) {
            list.push(localPiPlayer);
        }
    } catch (e) {
        console.error('Failed to fetch LMS players for zones list:', e);
    }

    res.json(list);
});

// Legacy/Specific routes
app.get('/api/media/roon/zones', (req, res) => {
    res.json(roonController.getZones());
});

app.post('/api/media/lms/select', (req, res) => {
    const { playerId } = req.body;
    if (!playerId) return res.status(400).json({ error: 'Missing playerId' });

    lmsController.playerId = playerId;
    res.json({ success: true, playerId });
});

app.post('/api/media/roon/select', (req, res) => {
    const { zoneId } = req.body;
    if (!zoneId) return res.status(400).json({ error: 'Missing zoneId' });

    roonController.setActiveZone(zoneId);

    // Persist selection
    zoneConfig.lastActiveZoneId = zoneId;

    // Also persist name if we can find it
    const zone = roonController.getZone(zoneId);
    if (zone) {
        zoneConfig.lastActiveZoneName = zone.display_name;
    }

    saveZoneConfig();

    // Broadcast change to peers
    if (zone) {
        broadcastZoneChange(zoneId, zone.display_name).catch(e => console.error('Sync: Broadcast failed', e.message));
    }

    res.json({ success: true, activeZoneId: zoneId });
});

app.get('/api/media/roon/image/:imageKey', (req, res) => {
    const key = req.params.imageKey;
    console.log(`Server: Artwork request for key: ${key}`);
    roonController.getImage(key, res);
});


// Serve artwork from fixed location
// Media Artwork Proxy (L LMS)
app.get('/api/media/lms/artwork/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        // Internal communication with LMS (usually localhost on Pi)
        const lmsUrl = `http://${lmsController.host}:${lmsController.port}/music/${trackId}/cover.jpg`;
        const response = await axios.get(lmsUrl, { responseType: 'stream' });
        response.data.pipe(res);
    } catch (e) {
        res.status(404).end();
    }
});

app.get('/api/media/artwork', async (req, res) => {
    const artworkPath = '/tmp/artisnova_artwork.jpg';

    // Wait for file if missing (up to 2 seconds)
    let checks = 0;
    while (!fs.existsSync(artworkPath) && checks < 10) {
        await new Promise(resolve => setTimeout(resolve, 200));
        checks++;
    }

    if (fs.existsSync(artworkPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.sendFile(artworkPath);
    } else {
        console.warn('API: Artwork request failed - /tmp/artisnova_artwork.jpg not found after wait');
        res.status(404).send('No artwork');
    }
});

// Volume Control
app.get('/api/hostname', (req, res) => {
    res.json({ hostname: os.hostname() });
});

// Get lyrics
app.get('/api/media/lyrics', async (req, res) => {
    const { track, artist } = req.query;
    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    // Improved cleaner: removes (feat. ...), [feat. ...], (ft. ...), etc.
    const cleanTrack = track
        .replace(/\s*[\(\[]\s*(feat|ft|featuring|with)\.?\s+[^)\]]+[\)\]]/gi, '') // Remove (feat. X)
        .replace(/\s*[\(\[]\s*remix\s*[\)\]]/gi, '') // Remove (Remix)
        .replace(/\s*[\(\[]\s*live\s*[\)\]]/gi, '') // Remove (Live)
        .replace(/\s*-\s*.*remix.*/gi, '') // Remove " - X Remix"
        .trim();

    const cleanArtist = artist.split(',')[0].trim();

    try {
        const lyrics = await getLyricsFromLrcLib(cleanTrack, cleanArtist);
        res.json(lyrics || { error: 'Lyrics not found' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});

// Volume Control - with caching to prevent osascript bottleneck
let cachedVolume = { value: 50, timestamp: 0 };
const VOLUME_CACHE_MS = 2000;  // Cache for 2 seconds

app.get('/api/volume', (req, res) => {
    const now = Date.now();
    // Return cached value if recent
    if (now - cachedVolume.timestamp < VOLUME_CACHE_MS) {
        return res.json({ volume: cachedVolume.value });
    }

    exec('osascript -e "output volume of (get volume settings)"', { timeout: 2000 }, (error, stdout, stderr) => {
        if (error) {
            console.error('Get volume error:', stderr);
            return res.json({ volume: cachedVolume.value || 50 });  // Return cached or default
        }
        cachedVolume = { value: parseInt(stdout.trim()), timestamp: now };
        res.json({ volume: cachedVolume.value });
    });
});

app.post('/api/volume', (req, res) => {
    const { volume, source } = req.body;
    if (volume === undefined || volume < 0 || volume > 100) {
        return res.status(400).json({ error: 'Invalid volume level' });
    }

    if (source === 'roon' && roonController.activeZoneId) {
        roonController.control('volume', volume);
        return res.json({ success: true, volume });
    }

    exec(`osascript -e "set volume output volume ${volume}"`, (error, stdout, stderr) => {
        if (error) {
            console.error('Set volume error:', stderr);
            return res.status(500).json({ error: 'Failed to set volume' });
        }
        res.json({ success: true, volume });
    });
});

// ========== ZONE CONFIGURATION API ==========

// Get zone configuration and available backends
app.get('/api/zones/config', (req, res) => {
    // Return current config plus list of available backends
    const backends = Object.entries(DSP_BACKENDS).map(([id, backend]) => ({
        id,
        name: backend.name,
        wsUrl: backend.wsUrl
    }));

    res.json({
        zones: zoneConfig.zones,
        defaults: zoneConfig.defaults,
        backends
    });
});

// Update zone configuration (set which backend a zone uses)
app.post('/api/zones/config', (req, res) => {
    const { zoneId, backend } = req.body;

    if (!zoneId) {
        return res.status(400).json({ error: 'zoneId is required' });
    }

    // Validate backend exists
    if (backend && !DSP_BACKENDS[backend]) {
        return res.status(400).json({
            error: `Invalid backend. Available: ${Object.keys(DSP_BACKENDS).join(', ')}`
        });
    }

    // Update or remove zone config
    if (backend) {
        zoneConfig.zones[zoneId] = backend;
        console.log(`Server: Zone "${zoneId}" configured to use backend "${backend}"`);
    } else {
        // If backend is null/undefined, remove the zone config (use default)
        delete zoneConfig.zones[zoneId];
        console.log(`Server: Zone "${zoneId}" reset to default backend`);
    }

    saveZoneConfig();
    res.json({ success: true, zones: zoneConfig.zones });
});

// Set default backend
app.post('/api/zones/default', (req, res) => {
    const { backend } = req.body;

    if (!DSP_BACKENDS[backend]) {
        return res.status(400).json({
            error: `Invalid backend. Available: ${Object.keys(DSP_BACKENDS).join(', ')}`
        });
    }

    zoneConfig.defaults.dspBackend = backend;
    saveZoneConfig();
    console.log(`Server: Default backend set to "${backend}"`);
    res.json({ success: true, defaults: zoneConfig.defaults });
});


// Update backend settings
app.post('/api/zones/backend-settings', (req, res) => {
    const { backendId, settings } = req.body;

    if (!backendId || !settings) {
        return res.status(400).json({ error: 'backendId and settings are required' });
    }

    if (!zoneConfig.backendSettings) zoneConfig.backendSettings = {};
    zoneConfig.backendSettings[backendId] = { ...zoneConfig.backendSettings[backendId], ...settings };

    // Apply to manager if it's raspi
    if (backendId === 'raspi') {
        remoteDsp.setOptions(settings);
        if (settings.host) {
            DSP_BACKENDS.raspi.wsUrl = `ws://${settings.host}:${settings.port || 5005}`;
        }
    }

    saveZoneConfig();
    res.json({ success: true, backendSettings: zoneConfig.backendSettings });
});


// Serve Frontend with anti-cache headers
const FRONTEND_DIST = path.join(__dirname, 'public');
if (fs.existsSync(FRONTEND_DIST)) {
    // Disable caching for all requests
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        next();
    });

    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) => {
        res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
    });
}



const server = http.createServer(app);

// Main WebSocket server for metadata and state
const wss = new WebSocket.Server({ noServer: true });
// Specialized WebSocket for real-time levels
const levelWss = new WebSocket.Server({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;

    if (pathname === '/ws/levels') {
        levelWss.handleUpgrade(request, socket, head, (ws) => {
            levelWss.emit('connection', ws, request);
        });
    } else {
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
});

levelWss.on('connection', (ws) => {
    console.log('WS: Level subscriber connected');
    levelProbe.addSubscriber(ws);
    ws.on('close', () => {
        console.log('WS: Level subscriber disconnected');
        levelProbe.removeSubscriber(ws);
    });
});

function broadcast(type, data) {
    const message = JSON.stringify({ type, data });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Auto-Mute Logic for Hybrid Groups (Direct + DSP)
let isAutoMuted = false;

function checkHybridGroupMute() {
    try {
        const zone = roonController.getActiveZone();
        if (!zone || !zone.outputs) return;

        // definition: Group (>1 output) containing a "Camilla/Probe" output (BlackHole)
        const outputs = zone.outputs;
        const hasCamilla = outputs.some(o =>
            o.display_name.toLowerCase().includes('camilla') ||
            o.display_name.toLowerCase().includes('probe') ||
            o.display_name.toLowerCase().includes('analyzer')
        );
        const isGroup = outputs.length > 1;

        // Get the DSP responsible for this zone or the default local one
        const activeDsp = getDspForZone(zone.display_name);

        if (isGroup && hasCamilla) {
            // Only mute if running and not already muted
            if (activeDsp && typeof activeDsp.isRunning === 'function' && activeDsp.isRunning()) {
                const isMuted = activeDsp.currentState?.mute || false;
                if (!isMuted) {
                    console.log('Server: Detected Hybrid Group (Direct + DSP). Auto-muting DSP output to prevent double audio.');
                    if (typeof activeDsp.setMute === 'function') {
                        activeDsp.setMute(true);
                        isAutoMuted = true;
                    } else {
                        console.warn('Server: activeDsp does not support setMute');
                    }
                }
            }
        } else {
            // If we previously auto-muted, and now the condition is gone (or group dissolved), UNMUTE.
            if (isAutoMuted) {
                console.log('Server: Hybrid Group ended. Auto-unmuting DSP output.');
                if (activeDsp && typeof activeDsp.setMute === 'function') {
                    activeDsp.setMute(false);
                }
                isAutoMuted = false;
            }
        }
    } catch (e) {
        console.error('Server: Error in checkHybridGroupMute:', e.message);
    }
}

// Global broadcast for Roon changes
roonController.init((info) => {
    // Check for hybrid group conditions on every update
    checkHybridGroupMute();

    // We can't easily calculate the full UI info (signalPath etc) here without 
    // duplicating logic from /api/media/info. For now, we'll signal a REFRESH
    // or send the raw info so the frontend can choose to fetch full details or use raw.
    // Better yet: send a 'metadata_update' type.
    broadcast('metadata_update', { source: 'roon', info });
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access via local IP: http://${getLocalIP()}:${PORT}`);
    console.log(`Managing DSP at: ${CAMILLA_ROOT}`);
    console.log(`Presets at: ${PRESETS_DIR}`);
});
