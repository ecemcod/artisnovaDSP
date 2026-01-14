const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Node 22+ Roon API Workaround
global.WebSocket = require('ws');

const http = require('http');
const https = require('https');
const DSPManager = require('./dsp-manager');
const RemoteDSPManager = require('./remote-dsp-manager');
const FilterParser = require('./parser');
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
roonController.init();

// CoreAudio Sample Rate Detection for BlackHole
// Polls the system to detect when Roon changes the sample rate
let lastDetectedSampleRate = null;

function getBlackHoleSampleRate() {
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

// LOCAL DSP Manager (Mac Mini)
const dsp = new DSPManager(CAMILLA_ROOT);

// REMOTE DSP Manager (Raspberry Pi)
const remoteDsp = new RemoteDSPManager({
    host: 'raspberrypi.local',
    port: 1234
});

// Available backends registry
const DSP_BACKENDS = {
    local: { name: 'Local', manager: dsp, wsUrl: 'ws://localhost:5005' },
    raspi: { name: 'Raspberry Pi', manager: remoteDsp, wsUrl: 'ws://raspberrypi.local:1234' }
};

// Zone configuration (loaded from file)
let zoneConfig = { zones: {}, defaults: { dspBackend: 'local' }, backendSettings: {} };

function loadRaspiCredentials() {
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

    // 2. If not found, try using keywords in the zone name (robustness)
    if (!backendId && zoneName) {
        const lowerName = zoneName.toLowerCase();
        if (lowerName.includes('raspberry') || lowerName.includes('pi')) {
            backendId = 'raspi';
        } else if (lowerName.includes('camilla') || lowerName.includes('local')) {
            backendId = 'local';
        }
    }

    backendId = backendId || zoneConfig.defaults.dspBackend || 'local';

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
    return zoneConfig.zones[zoneName] || zoneConfig.defaults.dspBackend || 'local';
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

    // Get the appropriate DSP manager for this zone
    const activeDsp = getDspForZone(zoneName);

    // Skip zones that don't have managed DSP. 
    // If the backendId for this zone is 'local' or 'raspi', we process it.
    const backendId = getBackendIdForZone(zoneName);
    if (!backendId) {
        console.log(`Server: [${source}] Zone "${zoneName}" doesn't use managed DSP. Ignoring.`);
        isProcessingSampleRateChange = false;
        return;
    }

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
        await roonController.control('mute');
        await new Promise(r => setTimeout(r, 200));
        console.log(`Server: [Transition] Output muted (Roon still streaming)`);

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
        await roonController.control('unmute');

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
        historyState.metadata = { genre: null, artworkUrl: null };

        // Fetch Metadata (Genre)
        getMetadataFromiTunes(currentTrack, currentArtist, currentAlbum).then(meta => {
            if (historyState.currentTrack === currentTrack) { // Ensure still same track
                historyState.metadata = meta;
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
app.get('/api/status', (req, res) => {
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

    res.json({
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
        zone: zoneName || null,
        isAutoSelected: !!zoneName // Signal to frontend that this was a zone-based selection
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
                resolve(stdout.trim());
            }
        });
    });
};

const getMetadataFromiTunes = (track, artist, album) => {
    return new Promise((resolve) => {
        if (!artist && !track && !album) return resolve({ artworkUrl: null, genre: null });

        const searches = [];
        if (album && artist) searches.push({ term: `${album} ${artist}`, entity: 'album' });
        if (track && artist) searches.push({ term: `${track} ${artist}`, entity: 'song' });
        if (artist) searches.push({ term: artist, entity: 'album' });

        const trySearch = (index) => {
            if (index >= searches.length) return resolve({ artworkUrl: null, genre: null });

            const item = searches[index];
            const query = encodeURIComponent(item.term);
            const url = `https://itunes.apple.com/search?term=${query}&entity=${item.entity}&limit=1&country=ES`;

            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.results && json.results.length > 0) {
                            const result = json.results[0];
                            const artworkUrl = result.artworkUrl100 || null;
                            const genre = result.primaryGenreName;
                            resolve({ artworkUrl, genre });
                        } else {
                            trySearch(index + 1);
                        }
                    } catch (e) {
                        trySearch(index + 1);
                    }
                });
            }).on('error', () => trySearch(index + 1));
        };

        trySearch(0);
    });
};

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
        const MAX_RETRIES = 2;
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const response = await axios.get(url, {
                    params,
                    timeout: 10000,
                    headers: { 'User-Agent': 'ArtisNovaDSP/1.2.6 (https://github.com/ecemcod/artisnovaDSP)' }
                });
                return response.data;
            } catch (e) {
                const isRetryable = e.code === 'ECONNABORTED' || e.code === 'ECONNRESET' || !e.response;
                if (isRetryable && attempt < MAX_RETRIES) {
                    console.log(`Lyrics API Attempt ${attempt} failed, retrying... (${e.message})`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    continue;
                }
                if (e.response && e.response.status === 404) return { status: 404 };
                console.error(`Lyrics API Error [${url}] after ${attempt} attempts:`, e.message);
                return null;
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

    // Strategy C: Original Raw Search (No Cleaning)
    console.log(`Lyrics: Strategy C (Raw Search) for "${artist} ${track}"`);
    let rawData = await fetchLyrics('https://lrclib.net/api/search', {
        q: `${artist} ${track}`
    });
    if (Array.isArray(rawData) && rawData.length > 0) {
        const match = rawData[0];
        if (isValid(match)) {
            console.log(`Lyrics: Strategy C Success`);
            return { plain: match.plainLyrics, synced: match.syncedLyrics, instrumental: match.instrumental };
        }
    }
    console.log(`Lyrics: Strategy C Failed`);

    // Strategy D: Fuzzy Word Search
    const trackWords = cleanTrack.split(/\s+/);
    if (trackWords.length > 1) {
        const fuzzyTrack = trackWords[0]; // Just the first word if it's failing
        console.log(`Lyrics: Strategy D (Fuzzy Word Search) for "${cleanArtist} ${fuzzyTrack}"`);
        let fuzzyData = await fetchLyrics('https://lrclib.net/api/search', {
            q: `${cleanArtist} ${fuzzyTrack}`
        });
        if (Array.isArray(fuzzyData) && fuzzyData.length > 0) {
            // Find a match that actually contains our original name
            const match = fuzzyData.find(item =>
                item.trackName.toLowerCase().includes(trackWords[0].toLowerCase())
            );
            if (isValid(match)) {
                console.log(`Lyrics: Strategy D Success`);
                return { plain: match.plainLyrics, synced: match.syncedLyrics, instrumental: match.instrumental };
            }
        }
    }

    console.log(`Lyrics: Strategy D Failed`);

    // Strategy E: Aggressive Clean (Remove ALL content in parentheses/brackets)
    // Use this only as last resort to handle "Song Name (20th Anniversary Deluxe)" where keywords might be missed
    const aggressivelyCleanTrack = cleanTrack.replace(/\s*\(.*?\)/g, '').replace(/\s*\[.*?\]/g, '').trim();
    if (aggressivelyCleanTrack !== cleanTrack && aggressivelyCleanTrack.length > 2) {
        console.log(`Lyrics: Strategy E (Aggressive Strip) for "${cleanArtist} ${aggressivelyCleanTrack}"`);
        let aggressiveData = await fetchLyrics('https://lrclib.net/api/search', {
            q: `${cleanArtist} ${aggressivelyCleanTrack}`
        });

        if (Array.isArray(aggressiveData) && aggressiveData.length > 0) {
            const match = aggressiveData.find(item =>
                item.trackName.toLowerCase().includes(aggressivelyCleanTrack.toLowerCase())
            );
            if (isValid(match)) {
                console.log(`Lyrics: Strategy E Success`);
                return { plain: match.plainLyrics, synced: match.syncedLyrics, instrumental: match.instrumental };
            }
        }
    }

    console.log(`Lyrics: All strategies failed for "${artist}" - "${track}"`);
    return null;
};

app.post('/api/media/playpause', async (req, res) => {
    const source = req.query.source || req.body.source;
    console.log(`Server: Received playpause request. Source=${source}`);
    try {
        // Ensure DSP is running before any playback action
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        console.log(`Server: Ensuring ${zoneName || 'Local'} DSP is running...`);
        await activeDsp.ensureRunning();

        if (source === 'roon' && roonController.activeZoneId) {
            console.log(`Server: Sending 'playpause' to Roon Zone ${roonController.activeZoneId}`);
            await roonController.control('playpause');
        } else {
            console.log('Server: Sending media key play command');
            await runMediaCommand('play');
        }
        res.json({ success: true, action: 'playpause' });
    } catch (e) {
        console.error('Play/pause CRITICAL ERROR:', e);
        res.status(500).json({ error: 'Failed to toggle play/pause' });
    }
});

app.post('/api/media/next', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('next');
        } else {
            await runMediaCommand('next');
        }
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
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('prev');
        } else {
            await runMediaCommand('prev');
        }
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
                        details: `${rateStr} • PCM • (Fallback)`,
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
                        description: isRemote ? 'Raspberry Pi DAC' : 'D50 III',
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
        }

        const output = await runMediaCommand('info');
        const info = JSON.parse(output);

        info.device = 'Local / Mac';
        if (info.track === historyState.currentTrack) {
            info.style = historyState.metadata.genre;
        }

        // Try iTunes if local artwork failed or is missing
        if (!info.artwork && (info.track || info.album) && info.artist) {
            info.artworkUrl = await getArtworkFromiTunes(info.track, info.artist, info.album);
        } else if (info.artwork) {
            info.artworkUrl = '/api/media/artwork?' + Date.now();
        }

        // Add Signal Path for local source (Apple Music / System)
        if (info && !info.signalPath) {
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
                        type: 'output',
                        description: 'BlackHole Bridge',
                        details: 'System Output Loopback',
                        status: 'lossless'
                    }
                ]
            };

            // For non-Roon sources (Apple Music / Airplay), we check the active zone (usually 'Camilla' local)
            const zoneName = getActiveZoneName();
            const activeDsp = getDspForZone(zoneName);
            const isRemote = getBackendIdForZone(zoneName) === 'raspi';

            if (activeDsp.isRunning()) {
                info.signalPath.nodes.push(
                    {
                        type: 'dsp',
                        description: isRemote ? 'CamillaDSP (Remote)' : 'CamillaDSP',
                        details: `64-bit Processing • ${activeDsp.currentState.presetName || 'Custom'} (${activeDsp.currentState.filtersCount || 0} filters) • Gain: ${activeDsp.currentState.preamp || 0}dB`,
                        status: 'enhanced'
                    },
                    {
                        type: 'output',
                        description: isRemote ? 'Raspberry Pi DAC' : 'D50 III',
                        details: `${activeDsp.currentState.sampleRate / 1000}kHz • ${activeDsp.currentState.bitDepth}-bit Hardware Output`,
                        status: 'enhanced'
                    }
                );
            }
        }

        res.json(info);
    } catch (e) {
        console.error('Media info error:', e);
        res.json({ state: 'unknown', track: '', artist: '', album: '', artwork: '' });
    }
});

// Roon helper routes
app.get('/api/media/roon/zones', (req, res) => {
    res.json(roonController.getZones());
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

    res.json({ success: true, activeZoneId: zoneId });
});

app.get('/api/media/roon/image/:imageKey', (req, res) => {
    roonController.getImage(req.params.imageKey, res);
});


// Serve artwork from fixed location
app.get('/api/media/artwork', (req, res) => {
    const artworkPath = '/tmp/artisnova_artwork.jpg';
    if (fs.existsSync(artworkPath)) {
        res.setHeader('Cache-Control', 'no-cache');
        res.sendFile(artworkPath);
    } else {
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

// Volume Control
app.get('/api/volume', (req, res) => {
    exec('osascript -e "output volume of (get volume settings)"', (error, stdout, stderr) => {
        if (error) {
            console.error('Get volume error:', stderr);
            return res.status(500).json({ error: 'Failed to get volume' });
        }
        res.json({ volume: parseInt(stdout.trim()) });
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

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Access via local IP: http://${getLocalIP()}:${PORT}`);
    console.log(`Managing DSP at: ${CAMILLA_ROOT}`);
    console.log(`Presets at: ${PRESETS_DIR}`);
});
