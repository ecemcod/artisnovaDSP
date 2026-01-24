const express = require('express');

// Global Error Handlers - EARLY REGISTRATION
process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err.stack || err);
    // On Mac, some CoreAudio crashes might be non-fatal but noisy
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason.stack || reason);
});
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');
const yaml = require('js-yaml');

// Node 22 workaround
// Node 22 workaround: Force 'ws' package for Roon API compatibility
global.WebSocket = require('ws');
console.log('Server: Forced use of "ws" package for Roon API compatibility.');
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
let lastDetectedSampleRate = 96000;

// SIMPLIFIED: Assume 96kHz fixed rate as per user instruction
function getBlackHoleSampleRate() {
    return Promise.resolve(96000);
}

// Initialize with hardware rate
(async () => {
    console.log(`Server: Initialized FIXED hardware sample rate: 96000Hz`);
})();



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
    lastCheck: Date.now(),
    metadata: { genre: null, artworkUrl: null }
};

async function updatePlaybackHistory() {
    try {
        let activeInfo = null;
        let source = null;

        // 1. Check Roon First (highest priority)
        const roonInfo = roonController.getNowPlaying();
        if (roonInfo && roonInfo.state === 'playing') {
            activeInfo = roonInfo;
            source = 'roon';
        }

        // 2. Check LMS if Roon is idle
        if (!activeInfo) {
            const lmsInfo = await lmsController.getStatus();
            if (lmsInfo && lmsInfo.state === 'playing') {
                activeInfo = lmsInfo;
                source = 'lms';
            }
        }

        // 3. Fallback to Apple Music / System (Mac only)
        if (!activeInfo && !isRunningOnPi) {
            try {
                const output = await runMediaCommand('info');
                const systemInfo = JSON.parse(output);
                if (systemInfo && systemInfo.state === 'playing') {
                    activeInfo = systemInfo;
                    source = 'apple';
                }
            } catch (e) { }
        }

        const now = Date.now();
        const delta = (now - historyState.lastCheck) / 1000;
        historyState.lastCheck = now;

        if (activeInfo) {
            const isSameTrack = activeInfo.track === historyState.currentTrack &&
                activeInfo.artist === historyState.currentArtist;

            if (isSameTrack) {
                // Increment time if playing
                historyState.accumulatedTime += delta;
            } else {
                // TRACK CHANGED: Save old track if it met the duration requirement
                if (historyState.currentTrack && historyState.accumulatedTime >= 30) {
                    await db.saveTrack({
                        title: historyState.currentTrack,
                        artist: historyState.currentArtist,
                        album: historyState.currentAlbum,
                        style: historyState.metadata.genre || null,
                        source: historyState.currentSource,
                        device: historyState.currentDevice,
                        artworkUrl: historyState.metadata.artworkUrl,
                        timestamp: Math.floor(historyState.startTime / 1000),
                        durationListened: Math.floor(historyState.accumulatedTime)
                    });
                }

                // Initialize new track
                historyState.currentTrack = activeInfo.track;
                historyState.currentArtist = activeInfo.artist;
                historyState.currentAlbum = activeInfo.album;
                historyState.currentSource = source;
                historyState.currentDevice = activeInfo.device || (source === 'roon' ? getActiveZoneName() : 'System');
                historyState.startTime = now;
                historyState.accumulatedTime = 0;
                historyState.isPlaying = true;
                historyState.metadata = {
                    genre: activeInfo.style || (metadataCache.get(`${activeInfo.artist}-${activeInfo.album}`)?.style) || null,
                    artworkUrl: activeInfo.artworkUrl || null
                };
            }
        } else {
            // STOPPED: If it was playing, we might want to save it now or wait for next start.
            // Decided: Save on stop if duration met.
            if (historyState.isPlaying && historyState.currentTrack && historyState.accumulatedTime >= 30) {
                await db.saveTrack({
                    title: historyState.currentTrack,
                    artist: historyState.currentArtist,
                    album: historyState.currentAlbum,
                    style: historyState.metadata.genre || null,
                    source: historyState.currentSource,
                    device: historyState.currentDevice,
                    artworkUrl: historyState.metadata.artworkUrl,
                    timestamp: Math.floor(historyState.startTime / 1000),
                    durationListened: Math.floor(historyState.accumulatedTime)
                });

                // Clear state so we don't save again
                historyState.currentTrack = null;
                historyState.isPlaying = false;
                historyState.accumulatedTime = 0;
            }
            historyState.isPlaying = false;
        }
    } catch (err) {
        console.error('History: Update Loop Error:', err);
    }
}

// Start history tracking loop (every 5 seconds)
setInterval(updatePlaybackHistory, 5000);

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

// Forward Remote DSP Levels to Frontend
remoteDsp.on('levels', (levels) => {
    // Only broadcast if the active zone is actually using the Raspberry Pi backend
    // This prevents stale/default levels from overwriting valid local DSP levels
    const zoneName = getActiveZoneName ? getActiveZoneName() : null;
    const backendId = getBackendIdForZone ? getBackendIdForZone(zoneName) : null;

    // Skip if not a remote zone or if levels are invalid defaults
    if (backendId !== 'raspi') {
        return; // Not using remote DSP, don't overwrite local levels
    }

    // Skip invalid/default levels
    if (!levels || !Array.isArray(levels) || levels.length < 2) {
        return;
    }
    if (levels[0] <= -1000 && levels[1] <= -1000) {
        return; // Skip default/error values
    }

    // Direct broadcast for remote levels
    broadcast('levels', levels);
    // Also drive the RTA generation from remote levels
    updateSpectrum(levels);
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
                roonController.activeZoneName = zoneConfig.lastActiveZoneName;
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
// ALWAYS-ON DSP LOGIC (Replaces LevelProbe)
// ----------------------------------------------------------------------

// Ensure DSP is running on boot (Always On) - ONLY if persisted state is true
if (!isRunningOnPi) {
    // Initial start delay to allow system to settle
    setTimeout(async () => {
        if (dsp.persistedState && dsp.persistedState.running) {
            console.log('Server: Ensuring Main DSP is running (Persisted=true)...');
            if (!dsp.isRunning()) {
                try {
                    // Determine initial filters (from empty/default)
                    const filters = dsp.lastFilterData || { filters: [], preamp: 0 };
                    const preamp = 0;

                    // Use FIXED 96kHz sample rate
                    const options = dsp.lastOptions || { sampleRate: 96000 };
                    await dsp.start(filters, options);
                    console.log('Server: Main DSP started successfully.');
                } catch (e) {
                    console.error('Server: Failed to start Main DSP on boot:', e);
                }
            }
        } else {
            console.log('Server: Main DSP start skipped (Persisted=false). Waiting for manual start.');
        }
    }, 2000);
}

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

    PEERS.forEach(host => {
        const url = `http://${host}:3000/api/internal/sync-zone`;
        axios.post(url, payload)
            .then(() => console.log(`Sync: Sent zone update to ${host}`))
            .catch(e => console.error(`Sync: Failed to send to ${host}:`, e.message));
    });
}

app.post('/api/internal/sync-zone', (req, res) => {
    const { zoneId, zoneName } = req.body;
    console.log(`Sync: Received zone update: ${zoneName} (${zoneId})`);

    // Update local state without re-broadcasting
    roonController.activeZoneId = zoneId;
    roonController.activeZoneName = zoneName;
    zoneConfig.lastActiveZoneId = zoneId;
    zoneConfig.lastActiveZoneName = zoneName;
    saveZoneConfig();

    res.json({ success: true });
});



// Helper: Find DSP for a given zone
function getDspForZone(zoneName) {
    let backendId = 'local'; // default

    // Check manual override first
    const zoneConfigBackend = Object.entries(zoneConfig.zones).find(([zName, _]) => zName === zoneName)?.[1];
    if (zoneConfigBackend) {
        backendId = zoneConfigBackend;
    } else {
        // Fallback logic
        if (zoneName === 'Raspberry' || (zoneName && zoneName.includes('Pi'))) {
            backendId = 'raspi';
        } else {
            backendId = zoneConfig.defaults.dspBackend || 'local';
        }
    }

    const backend = DSP_BACKENDS[backendId];
    if (backend) {
        return backend.manager;
    }
    // Final fallback
    return dsp;
}

function getBackendIdForZone(zoneName) {
    // Check manual override first
    const zoneConfigBackend = Object.entries(zoneConfig.zones).find(([zName, _]) => zName === zoneName)?.[1];
    if (zoneConfigBackend) {
        return zoneConfigBackend;
    }
    // Fallback logic
    if (zoneName === 'Raspberry' || (zoneName && zoneName.includes('Pi'))) {
        return 'raspi';
    }
    return zoneConfig.defaults.dspBackend || 'local';
}

function getActiveZoneName() {
    return roonController.activeZoneName || 'Camilla';
}


// Shared Helper for Media Keys (Mac Only)
async function runMediaCommand(command, args = []) {
    if (process.platform !== 'darwin') return '{"error": "Not supported on Linux"}';

    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, 'media_keys.py');
        const pythonProcess = spawn('python3', [scriptPath, command, ...args]);

        let output = '';
        let errorOutput = '';

        pythonProcess.stdout.on('data', (data) => output += data.toString());
        pythonProcess.stderr.on('data', (data) => errorOutput += data.toString());

        pythonProcess.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(errorOutput || `Process exited with code ${code}`));
            } else {
                resolve(output.trim());
            }
        });
    });
}



// API Endpoints
app.get('/api/status', async (req, res) => {
    // Determine active DSP based on Roon Zone (or manual selection)
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    const backendId = getBackendIdForZone(zoneName);

    // If we're targeting a remote DSP (Raspberry Pi), we return its status if available,
    // otherwise fallback to "unknown/connecting"
    if (backendId === 'raspi') {
        const remoteState = activeDsp.currentState || {};
        return res.json({
            running: remoteState.running || false,
            sampleRate: remoteState.sampleRate || 0,
            capturing: remoteState.capturing || false,
            bypass: remoteState.bypass || false,
            configPath: 'REMOTE',
            activeZoneId: roonController.activeZoneId,
            activeZoneName: roonController.activeZoneName,
            zone: zoneName,
            backend: backendId,
            isDspManaged: true
        });
    }

    // Local DSP Status
    const nowPlaying = roonController.getNowPlaying() || {};
    const currentBitDepth = nowPlaying.bitDepth || 24;

    res.json({
        running: activeDsp.isRunning(),
        sampleRate: activeDsp.currentState.sampleRate,
        capturing: true,
        bypass: activeDsp.currentState.bypass,
        configPath: activeDsp.currentConfig,
        roonSampleRate: 96000, // Fixed
        activeZoneId: roonController.activeZoneId,
        activeZoneName: roonController.activeZoneName,
        zone: zoneName,
        backend: backendId,
        isDspManaged: true, // Always managed in "Always-On" mode
        isAutoSelected: false,
        bitDepth: currentBitDepth
    });
});

app.get('/api/filters', async (req, res) => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);

    if (activeDsp.lastFilterData) {
        res.json(activeDsp.lastFilterData);
    } else {
        res.json({ filters: [], preamp: 0 }); // Return empty default
    }
});

app.post('/api/filters', async (req, res) => {
    const filterData = req.body;
    console.log('Received updated filters:', JSON.stringify(filterData));

    // In Always-On mode, we apply filters immediately to the running instance
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    const backendId = getBackendIdForZone(zoneName);

    try {
        // ALWAYS use 96000
        const options = {
            sampleRate: 96000,
            bitDepth: 24,
            presetName: filterData.selectedPreset || 'Manual',
            backend: backendId // Inform manager of backend context
        };

        await activeDsp.start(filterData, options);

        // Update history in DB if playing
        if (historyState.isPlaying && historyState.currentTrack) {
            // record event?
        }

        res.json({ success: true, state: 'running' });
    } catch (err) {
        console.error('Filter Update Error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/presets', (req, res) => {
    try {
        if (!fs.existsSync(PRESETS_DIR)) fs.mkdirSync(PRESETS_DIR, { recursive: true });
        const files = fs.readdirSync(PRESETS_DIR).filter(f => f.endsWith('.json'));
        const presets = files.map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, f), 'utf8'));
            return { id: f.replace('.json', ''), name: content.name, description: content.description };
        });
        res.json(presets);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/presets/:id', (req, res) => {
    try {
        const filePath = path.join(PRESETS_DIR, `${req.params.id}.json`);
        if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Preset not found' });
        const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        res.json(content);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/presets', (req, res) => {
    try {
        const { name, description, filters, preamp } = req.body;
        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const filePath = path.join(PRESETS_DIR, `${id}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ name, description, filters, preamp }, null, 2));
        res.json({ success: true, id });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/presets/:id', (req, res) => {
    try {
        const filePath = path.join(PRESETS_DIR, `${req.params.id}.json`);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 4. Start DSP Manually (now typically just updates settings)
app.post('/api/start', async (req, res) => {
    const { directConfig, sampleRate, bitDepth, presetName } = req.body;

    // Ignore sampleRate passed from frontend/roon, enforce 96000
    const fixedRate = 96000;

    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    const backendId = getBackendIdForZone(zoneName);

    try {
        // Build filter object
        let filterData = directConfig || { filters: [], preamp: 0 };
        const options = {
            sampleRate: fixedRate,
            bitDepth: parseInt(bitDepth) || 24,
            presetName: presetName,
            backend: backendId
        };
        console.log(`Starting ${zoneName || 'Local'} DSP with FORCED sample rate: ${fixedRate}Hz`);

        await activeDsp.start(filterData, options);
        res.json({ success: true, state: 'running', sampleRate: fixedRate, bitDepth: options.bitDepth, backend: backendId });
    } catch (err) {
        console.error('API Start Error:', err);
        res.status(500).json({ error: err.message });
    }
});

// 5. Stop DSP (Explicit User Stop)
app.post('/api/stop', async (req, res) => {
    const zoneName = getActiveZoneName();
    const activeDsp = getDspForZone(zoneName);
    await activeDsp.stop();
    res.json({ success: true, state: 'stopped' });
});

// 5b. Bypass Mode
app.post('/api/bypass', async (req, res) => {
    try {
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        const rate = 96000; // Fixed
        await activeDsp.startBypass(rate);
        res.json({ success: true, state: 'bypass', sampleRate: rate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5c. Manual Probe Restart (Decommissioned mostly, but maps to simple start)
app.post('/api/probe/restart', async (req, res) => {
    try {
        console.log('API: Manual restart requested. Restarting Main DSP...');
        const zoneName = getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);

        // Restart with last known settings or defaults
        const filterData = activeDsp.lastFilterData || { filters: [], preamp: 0 };
        const options = activeDsp.lastOptions || { sampleRate: 96000 };

        await activeDsp.start(filterData, options);

        res.json({
            success: true,
            message: 'Main DSP restarted'
        });
    } catch (e) {
        console.error('Restart failed:', e);
        res.status(500).json({ error: e.message });
    }
});


// Helper functions for Artwork
async function getArtworkFromiTunes(track, artist, album) {
    try {
        let term = `${track} ${artist}`;
        if (album) term += ` ${album}`;
        const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=1`;
        const response = await axios.get(url, { timeout: 2000 });
        if (response.data.results && response.data.results.length > 0) {
            const art = response.data.results[0].artworkUrl100;
            return {
                artworkUrl: art ? art.replace('100x100', '600x600') : null
            };
        }
    } catch (e) {
        console.error('iTunes Artwork Error:', e.message);
    }
    return { artworkUrl: null };
}

// Helper: Artist Info from Last.fm or similar (Mock for now or simple Wikipedia fetch via library)
// Logic for getting artist info... (omitted detailed implementation for brevity as it remains unchanged)
async function getArtistInfo(artist, album) {
    if (!artist) return { bio: null, formed: null, tags: [] };

    // Helper to fetch from AudioDB
    const fetchAudioDB = async (name) => {
        try {
            const url = `https://www.theaudiodb.com/api/v1/json/2/search.php?s=${encodeURIComponent(name)}`;
            const res = await axios.get(url, { timeout: 4000 });
            return res.data?.artists?.[0];
        } catch { return null; }
    };

    // Helper to fetch from MusicBrainz
    const fetchMusicBrainz = async (name) => {
        try {
            const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(name)}&fmt=json`;
            const res = await axios.get(url, {
                headers: { 'User-Agent': 'ArtisNova/1.0.0 ( contact@example.com )' },
                timeout: 5000
            });
            return res.data.artists?.[0];
        } catch { return null; }
    };

    // Helper to fetch bio from Wikipedia
    const fetchWikipediaBio = async (name) => {
        try {
            // First search for the exact page title
            const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name + ' (musician)')}&format=json&origin=*`;
            const searchRes = await axios.get(searchUrl, { timeout: 4000 });
            let title = searchRes.data?.query?.search?.[0]?.title;

            if (!title) {
                // Try without (musician) if search fails
                const searchUrlSimple = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(name)}&format=json&origin=*`;
                const searchResSimple = await axios.get(searchUrlSimple, { timeout: 4000 });
                title = searchResSimple.data?.query?.search?.[0]?.title;
            }

            if (title) {
                const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(title)}&format=json&origin=*`;
                const extractRes = await axios.get(extractUrl, { timeout: 4000 });
                const pages = extractRes.data?.query?.pages;
                const pageId = Object.keys(pages)[0];
                return pages[pageId]?.extract || null;
            }
        } catch (e) {
            console.warn('Wikipedia Bio Fetch failed:', e.message);
        }
        return null;
    };

    try {
        console.log(`Artist Info: Searching for "${artist}"...`);
        let adbArtist = await fetchAudioDB(artist);

        // Retry with variants if failed
        if (!adbArtist) {
            const parts = artist.split(/[;\/&]| and | feat\. /i).map(p => p.trim());
            for (const part of parts) {
                if (part === artist) continue;
                console.log(`Artist Info: Retrying with part "${part}"...`);
                adbArtist = await fetchAudioDB(part);
                if (adbArtist) break;
            }
        }

        if (adbArtist) {
            console.log(`Artist Info: Found on AudioDB: ${adbArtist.strArtist}`);
            const res = {
                name: adbArtist.strArtist || artist,
                bio: adbArtist.strBiographyEN || null,
                formed: adbArtist.intFormedYear || 'Unknown',
                origin: adbArtist.strCountry || 'Unknown',
                tags: [adbArtist.strStyle, adbArtist.strGenre]
                    .filter(Boolean)
                    .filter(t => !['music', 'unknown'].includes(t.toLowerCase().trim())),
                image: adbArtist.strArtistThumb || null,
                source: 'TheAudioDB'
            };
            console.log('Artist Info: Returning Result:', JSON.stringify(res).substring(0, 200));
            return res;
        }

        // 2. Wikipedia Fallback for Bio
        console.log(`Artist Info: AudioDB FAILED for "${artist}". Trying Wikipedia...`);
        const wikiBio = await fetchWikipediaBio(artist);
        if (wikiBio) {
            // Still need to get origin/formed from MusicBrainz or similar if we want a complete record
            const mbArtist = await fetchMusicBrainz(artist);
            const res = {
                name: mbArtist?.name || artist,
                bio: wikiBio,
                formed: mbArtist ? (mbArtist['life-span']?.begin || 'Unknown') : 'Unknown',
                origin: mbArtist ? (mbArtist.country || 'Unknown') : 'Unknown',
                tags: mbArtist?.tags?.map(t => t.name).slice(0, 5) || [],
                image: null,
                source: 'Wikipedia'
            };
            console.log('Artist Info: Returning Wikipedia Result:', JSON.stringify(res).substring(0, 200));
            return res;
        }

        // 3. Fallback: MusicBrainz (Metadata only, synthetic bio)
        let mbArtist = await fetchMusicBrainz(artist);
        if (!mbArtist && (artist.includes('/') || artist.includes(',') || artist.toLowerCase().includes('feat.'))) {
            const firstArtist = artist.split(/(?:\/|,|feat\.)/i)[0].trim();
            mbArtist = await fetchMusicBrainz(firstArtist);
        }

        if (mbArtist) {
            const tags = mbArtist.tags
                ? mbArtist.tags.map(t => t.name).filter(t => !['music', 'unknown'].includes(t.toLowerCase().trim())).slice(0, 5)
                : [];
            const formed = mbArtist['life-span'] ? (mbArtist['life-span'].begin || 'Unknown') : 'Unknown';

            const res = {
                name: mbArtist.name || artist,
                // Synthetic Bio to force frontend display
                bio: `${mbArtist.name || artist} is an artist from ${mbArtist.country || 'Unknown'} formed in ${formed}. Genres: ${tags.join(', ')}.`,
                formed: formed,
                origin: mbArtist.country || 'Unknown',
                tags: tags,
                image: null,
                source: 'MusicBrainz'
            };
            console.log('Artist Info: Returning MusicBrainz Result:', JSON.stringify(res).substring(0, 200));
            return res;
        }
    } catch (e) {
        console.warn(`Artist Info: API fetch failed for "${artist}":`, e.message);
    }

    return {
        name: artist,
        bio: null,
        formed: '-',
        origin: '-',
        tags: [],
        source: 'Local'
    };
}

// Helper: Get Album Info (AudioDB)
async function getAlbumInfo(artist, album) {
    if (!artist || !album) return null;

    // Normalize names to improve AudioDB matching
    const cleanStr = (s) => s ? s.replace(/\s+/g, ' ').trim() : '';
    const normalizeArtistName = (name) => {
        if (!name) return [];
        // Handle "Artist A / Artist B" or "Artist A & Artist B"
        const parts = name.split(/[;\/&]| and /i);
        return parts.map(p => cleanStr(p));
    };
    const normalizeAlbumName = (name) => {
        if (!name) return '';
        return cleanStr(name
            .replace(/\s*\(\d{4}\)\s*$/g, '') // Strip trailing year in parentheses (e.g. "(1973)")
            .replace(/\s*\((Live|Remastered|Deluxe|Deluxe Edition|Special Edition|Expanded|Anniversary|Remaster|Bonus Track Version|Radio Edit|Edit|Gold Edition|Remix|Remixes|EP|Single)\)\s*$/i, '')
            .replace(/\s*\[(Live|Remastered|Deluxe|Special Edition|EP|Single)\]\s*$/i, '')
            .split(' - ')[0] // Optional: take only part before dash if it's long? No, usually dash is part of title.
        );
    };

    const artistVariants = [artist, ...normalizeArtistName(artist)];
    const albumVariants = [album];
    const normalizedA = normalizeAlbumName(album);
    if (normalizedA !== album) albumVariants.push(normalizedA);

    console.log(`AlbumInfo: Searching variants for "${album}" by "${artist}": Artists=[${artistVariants.join(', ')}], Albums=[${albumVariants.join(', ')}]`);

    for (const searchArtist of artistVariants) {
        for (const searchAlbum of albumVariants) {
            try {
                console.log(`AlbumInfo: Trying "${searchAlbum}" by "${searchArtist}"...`);
                const adbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(searchArtist)}&a=${encodeURIComponent(searchAlbum)}`;
                const adbRes = await axios.get(adbUrl, { timeout: 4000 });
                console.log(`AlbumInfo: AudioDB response for "${searchAlbum}":`, JSON.stringify(adbRes.data).substring(0, 500));
                const adbAlbum = adbRes.data?.album?.[0];

                if (adbAlbum) {
                    console.log(`AlbumInfo: Found "${adbAlbum.strAlbum}" (${adbAlbum.intYearReleased}) for query "${searchAlbum}"`);
                    let tracklist = [];
                    if (adbAlbum.idAlbum) {
                        try {
                            const tracksUrl = `https://www.theaudiodb.com/api/v1/json/2/track.php?m=${adbAlbum.idAlbum}`;
                            const tracksRes = await axios.get(tracksUrl, { timeout: 3000 });
                            if (tracksRes.data?.track) {
                                tracklist = tracksRes.data.track.map(t => ({
                                    number: parseInt(t.intTrackNumber),
                                    title: t.strTrack,
                                    duration: t.intDuration ? `${Math.floor(t.intDuration / 60000)}:${Math.floor((t.intDuration % 60000) / 1000).toString().padStart(2, '0')}` : '--:--',
                                    disc: 1
                                })).sort((a, b) => a.number - b.number);
                            }
                        } catch (err) { console.warn('AudioDB Tracks failed', err.message); }
                    }

                    return {
                        title: adbAlbum.strAlbum,
                        date: adbAlbum.intYearReleased,
                        label: adbAlbum.strLabel || 'Unknown Label',
                        type: adbAlbum.strReleaseFormat || 'Album',
                        trackCount: tracklist.length || 0,
                        tracklist: tracklist,
                        credits: [],
                        artwork: adbAlbum.strAlbumThumb || null
                    };
                }
            } catch (e) {
                console.warn(`Album Info: AudioDB failed for "${searchArtist}" - "${searchAlbum}"`, e.message);
            }
        }
    }

    // NEW: Search for album name only if artist-specific search failed
    console.log(`AlbumInfo: Trying album-only search for "${album}" on AudioDB...`);
    try {
        const adbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?a=${encodeURIComponent(album)}`;
        const adbRes = await axios.get(adbUrl, { timeout: 4000 });
        const albums = adbRes.data?.album;
        if (albums && albums.length > 0) {
            // Find the best match if multiple
            const adbAlbum = albums.find(a => a.strArtist.includes(artist) || artist.includes(a.strArtist)) || albums[0];
            console.log(`AlbumInfo: Found via album-only search: "${adbAlbum.strAlbum}" by "${adbAlbum.strArtist}" (${adbAlbum.intYearReleased})`);
            return {
                title: adbAlbum.strAlbum,
                date: adbAlbum.intYearReleased,
                label: adbAlbum.strLabel || 'Unknown Label',
                type: adbAlbum.strReleaseFormat || 'Album',
                trackCount: 0,
                tracklist: [],
                artwork: adbAlbum.strAlbumThumb || null
            };
        }
    } catch (e) {
        console.warn(`Album Info: Album-only AudioDB search failed for "${album}"`, e.message);
    }

    console.log(`AlbumInfo: TheAudioDB FAILED for "${artist}" - "${album}". Trying Discogs fallback...`);
    const discogsResult = await getAlbumInfoFromDiscogs(artist, album);
    if (discogsResult) return discogsResult;

    console.log(`AlbumInfo: Discogs FAILED for "${artist}" - "${album}". Trying MusicBrainz fallback...`);
    const mbResult = await getAlbumInfoFromMusicBrainz(artist, album);
    if (mbResult) return mbResult;

    console.log(`AlbumInfo: All sources FAILED for "${artist}" - "${album}" (normalized: "${normalizedA}")`);
    return null;
}

// Helper: Get Album Info (Discogs)
async function getAlbumInfoFromDiscogs(artist, album) {
    try {
        console.log(`Discogs: Searching for "${album}" by "${artist}"...`);
        // Use release_title and artist for more targeted search
        const searchUrl = `https://api.discogs.com/database/search?release_title=${encodeURIComponent(album)}&artist=${encodeURIComponent(artist)}&type=release&per_page=1`;

        // Note: Discogs requires a User-Agent and ideally an API key, but simple search might work or we use a generic one
        const searchRes = await axios.get(searchUrl, {
            headers: { 'User-Agent': 'ArtisNova/1.2.1 +https://github.com/mcouceiro/artisnova' },
            timeout: 5000
        });

        console.log(`Discogs: Search response status: ${searchRes.status}, Results count: ${searchRes.data?.results?.length}`);
        const release = searchRes.data?.results?.[0];
        if (release) {
            console.log(`AlbumInfo: Discogs found match "${release.title}" (ID: ${release.id})`);

            // Get full release details for tracklist
            const detailsUrl = `https://api.discogs.com/releases/${release.id}`;
            const detailsRes = await axios.get(detailsUrl, {
                headers: { 'User-Agent': 'ArtisNova/1.2.1' },
                timeout: 5000
            });

            const data = detailsRes.data;
            if (data) {
                const tracklist = data.tracklist?.map((t, idx) => ({
                    number: idx + 1,
                    title: t.title,
                    duration: t.duration || '--:--',
                    disc: 1
                })) || [];

                return {
                    title: data.title,
                    date: data.year || data.released?.substring(0, 4) || release.year || 'Unknown',
                    label: data.labels?.[0]?.name || 'Unknown Label',
                    type: 'Album',
                    trackCount: tracklist.length,
                    tracklist: tracklist,
                    artwork: data.images?.[0]?.resource_url || release.thumb || null,
                    source: 'Discogs'
                };
            }
        }
    } catch (err) {
        console.warn('Discogs Album Fetch failed:', err.message);
    }
    return null;
}

// Helper: Get Album Info (MusicBrainz Fallback)
async function getAlbumInfoFromMusicBrainz(artist, album) {
    if (!artist || !album) return null;

    const cleanStr = (s) => s.replace(/\s+/g, ' ').trim();
    const normalizeArtistName = (name) => {
        const parts = name.split(/[;\/&]| and | feat\. /i);
        return parts.map(p => cleanStr(p));
    };

    const artistVariants = [artist, ...normalizeArtistName(artist)];

    for (const searchArtist of artistVariants) {
        try {
            console.log(`MusicBrainz: Searching for "${album}" by "${searchArtist}"...`);
            const query = `artist:"${searchArtist}" AND release:"${album}"`;
            const searchUrl = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(query)}&fmt=json`;

            const searchRes = await axios.get(searchUrl, {
                timeout: 6000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }
            });

            const release = searchRes.data?.releases?.[0];
            if (release && release.score >= 75) {
                console.log(`AlbumInfo: MusicBrainz found match "${release.title}" (Score: ${release.score})`);

                const detailsUrl = `https://musicbrainz.org/ws/2/release/${release.id}?inc=recordings+labels+release-groups&fmt=json`;
                const detailsRes = await axios.get(detailsUrl, {
                    timeout: 6000,
                    headers: { 'User-Agent': 'ArtisNova/1.2.1 (contact: artisnova@example.com)' }
                });

                const data = detailsRes.data;
                if (data) {
                    const tracklist = data.media?.[0]?.tracks?.map(t => ({
                        number: parseInt(t.number) || t.position,
                        title: t.title,
                        duration: t.length ? `${Math.floor(t.length / 60000)}:${Math.floor((t.length % 60000) / 1000).toString().padStart(2, '0')}` : '--:--',
                        disc: 1
                    })) || [];

                    const year = data['release-group']?.['first-release-date'] ? data['release-group']['first-release-date'].substring(0, 4) : (data.date ? data.date.substring(0, 4) : 'Unknown');

                    return {
                        title: data.title,
                        date: year,
                        label: data['label-info']?.[0]?.label?.name || 'Unknown Label',
                        type: data['release-group']?.['primary-type'] || 'Album',
                        trackCount: tracklist.length,
                        tracklist: tracklist,
                        artwork: `https://coverartarchive.org/release/${release.id}/front`
                    };
                }
            }
        } catch (err) {
            console.warn(`MusicBrainz: Search variant failed for "${searchArtist}":`, err.message);
        }
    }
    return null;
}


// History Database Init - Handled in database.js constructor
console.log('Server: History DB module loaded');


// Lyrics Utilities
// Simple in-memory cache for lyrics to avoid spamming the API
const lyricsCache = new Map();
const metadataCache = new Map();
let loggedRoonRaw = false; // Global flag for one-time detailed log // New: Metadata Cache for Album/Year enrichment

async function fetchLyrics(url, params) {
    try {
        const response = await axios.get(url, {
            params,
            timeout: 5000,
            headers: {
                'User-Agent': 'ArtisNova/1.2.1 (contact: artisnova@example.com)'
            }
        });
        return response.data;
    } catch (e) {
        if (e.response && e.response.status === 404) {
            console.log(`Lyrics: API 404 for ${url} with params: ${JSON.stringify(params)}`);
            return null;
        }
        console.error(`Lyrics: API Error (${e.response?.status}) for ${url}:`, e.message);
        return null; // Return null so we can try the next strategy instead of crashing
    }
}

function normalizeLyricsMetadata(artist, track) {
    // 1. Normalize Artist: Take only the first artist if it's a list
    let cleanArtist = artist
        .split(/[\\\/,;&]/)[0] // Split by /, \, ,, ;, &, etc.
        .replace(/\s+(feat|ft)\.?\s+.*/i, '') // Strip "feat."
        .trim();

    // 2. Normalize Track: Strip common suffixes
    let cleanTrack = track
        .replace(/\s*\((Live|Remastered|Deluxe|Deluxe Edition|Special Edition|Expanded|Anniversary|Remaster|Bonus Track Version|Radio Edit|Edit|Duet With.*)\)\s*$/i, '')
        .replace(/\s*\[(Live|Remastered|Deluxe|Special Edition)\]\s*$/i, '')
        .replace(/\s*-\s*(Live|Remastered|Deluxe|Single Version|Radio Edit).*/i, '')
        .trim();

    return { artist: cleanArtist, track: cleanTrack };
}

async function getLyricsFromLrcLib(track, artist) {
    const cacheKey = `${artist}-${track}`.toLowerCase();

    // Check cache
    if (lyricsCache.has(cacheKey)) {
        const cached = lyricsCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 1000 * 60 * 60 * 24) {
            return cached.data;
        }
    }

    const { artist: cleanArtist, track: cleanTrack } = normalizeLyricsMetadata(artist, track);

    // Strategy A: Direct Get with Normalized Data
    console.log(`Lyrics: Trying Get (Normalized) for "${cleanArtist}" - "${cleanTrack}"`);
    let data = await fetchLyrics('https://lrclib.net/api/get', {
        artist_name: cleanArtist,
        track_name: cleanTrack
    });

    if (data && (data.plainLyrics || data.syncedLyrics)) {
        const result = { plain: data.plainLyrics, synced: data.syncedLyrics, instrumental: data.instrumental };
        lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    }

    // Strategy B: Search with Normalized Concatenation
    const searchQuery = `${cleanArtist} ${cleanTrack}`.replace(/\//g, ' ');
    console.log(`Lyrics: Trying Search (Normalized) for "${searchQuery}"`);
    let searchData = await fetchLyrics('https://lrclib.net/api/search', {
        q: searchQuery
    });

    if (Array.isArray(searchData) && searchData.length > 0) {
        const bestMatch = searchData[0];
        const result = { plain: bestMatch.plainLyrics, synced: bestMatch.syncedLyrics, instrumental: bestMatch.instrumental };
        lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    }

    // Strategy C: Last Resort - Original Raw Strings in Search
    if (artist !== cleanArtist || track !== cleanTrack) {
        const rawSearchQuery = `${artist} ${track}`.replace(/\//g, ' ');
        console.log(`Lyrics: Strategy C - Searching for "${rawSearchQuery}"`);
        let rawSearchData = await fetchLyrics('https://lrclib.net/api/search', {
            q: rawSearchQuery
        });
        if (Array.isArray(rawSearchData) && rawSearchData.length > 0) {
            const bestMatch = rawSearchData[0];
            const result = { plain: bestMatch.plainLyrics, synced: bestMatch.syncedLyrics, instrumental: bestMatch.instrumental };
            lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }
    }

    // Strategy D: Medley handling (split by /)
    if (cleanTrack.includes('/')) {
        const parts = cleanTrack.split('/').map(p => p.trim()).filter(p => p.length >= 3);
        console.log(`Lyrics: Strategy D - Detected medley. Trying components: ${parts.join(', ')}`);
        for (const part of parts) {
            console.log(`Lyrics: Strategy D - Trying Search for medley component: "${cleanArtist} ${part}"`);
            let medleySearchData = await fetchLyrics('https://lrclib.net/api/search', {
                q: `${cleanArtist} ${part}`.replace(/\//g, ' ')
            });

            if (Array.isArray(medleySearchData) && medleySearchData.length > 0) {
                const bestMatch = medleySearchData[0];
                const result = { plain: bestMatch.plainLyrics, synced: bestMatch.syncedLyrics, instrumental: bestMatch.instrumental };
                lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
                console.log(`Lyrics: Strategy D - SUCCEEDED for medley component "${part}"`);
                return result;
            }
        }
    }

    console.log(`Lyrics: All strategies FAILED for "${artist}" - "${track}"`);
    return null;
}

app.post('/api/media/playpause', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('playpause');
        } else if (source === 'lms') {
            await lmsController.control('playpause');
        } else {
            await runMediaCommand('play');
        }
        // No DSP ensureRunning needed explicitly, it's always on
        res.json({ success: true, action: 'playpause' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to toggle play/pause' });
    }
});

app.post('/api/media/next', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('next');
        } else if (source === 'lms') {
            await lmsController.control('next');
        } else {
            await runMediaCommand('next');
        }
        res.json({ success: true, action: 'next' });
    } catch (e) {
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
        res.status(500).json({ error: 'Failed to stop' });
    }
});

app.post('/api/media/prev', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('prev');
        } else if (source === 'lms') {
            await lmsController.control('previous');
        } else {
            await runMediaCommand('prev');
        }
        res.json({ success: true, action: 'prev' });
    } catch (e) {
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
        res.status(500).json({ error: 'Failed to seek' });
    }
});

app.post('/api/media/playqueue', async (req, res) => {
    const { id, source, index } = req.body;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            roonController.playQueueItem(id);
            res.json({ success: true });
        } else if (source === 'apple') {
            if (index === undefined || index === null) return res.status(400).json({ error: 'Index required' });
            const result = await runMediaCommand('play_queue_item', [index]);
            res.json({ success: true, result });
        } else {
            res.json({ success: false, error: 'Not supported' });
        }
    } catch (e) {
        res.status(500).json({ error: 'Failed to play queue item' });
    }
});

app.get('/api/media/queue', async (req, res) => {
    const source = req.query.source || 'apple';
    try {
        if (source === 'roon') {
            const queue = roonController.getQueue();
            return res.json({ queue });
        }
        const output = await runMediaCommand('queue');
        const queueData = JSON.parse(output);
        res.json(queueData);
    } catch (e) {
        res.json({ queue: [] });
    }
});

app.get('/api/media/info', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const source = req.query.source;
    try {
        if (source === 'roon') {
            const raw = roonController.getNowPlaying() || { state: 'unknown' };
            const info = { ...raw };

            const zone = roonController.zones.get(roonController.activeZoneId);
            info.device = zone ? zone.display_name : 'Unknown Zone';

            // Generate Simplified Signal Path
            let uiNodes = [];
            // Basic source node
            uiNodes.push({
                type: 'source',
                description: 'Roon High Res',
                details: '96kHz • 24-bit',
                status: 'enhanced'
            });

            // Always Add DSP and Final Output nodes (Always-On Mode)
            const zoneName = info.device;
            const activeDsp = getDspForZone(zoneName);
            const backendId = getBackendIdForZone(zoneName);
            const isRemote = backendId === 'raspi';

            if (activeDsp.isRunning()) {
                uiNodes.push(
                    {
                        type: 'dsp',
                        description: activeDsp.currentState.bypass ? 'CamillaDSP (Bypassed)' : 'CamillaDSP',
                        details: `64-bit • ${activeDsp.currentState.presetName || 'Custom'}`,
                        status: activeDsp.currentState.bypass ? 'lossless' : 'enhanced'
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
                quality: 'enhanced',
                nodes: uiNodes
            };
            info.source = 'roon';

            // Enrich with cached Year/Genre/Artwork info if missing
            const cacheKey = `${info.artist}-${info.album}`;

            if (info.artist && info.album && (!info.year || !info.style || !info.artworkUrl)) {
                if (metadataCache.has(cacheKey)) {
                    const cached = metadataCache.get(cacheKey);
                    if (!info.year) info.year = cached.year;
                    if (!info.style) info.style = cached.style;
                    if (!info.artworkUrl) info.artworkUrl = cached.artwork;
                } else {
                    // BACKGROUND ENRICHMENT: Trigger fetch in background and return immediate current info
                    (async () => {
                        try {
                            console.log(`Enrichment (Background): Fetching metadata for "${cacheKey}"...`);
                            const [albumData, artistData] = await Promise.all([
                                getAlbumInfo(info.artist, info.album),
                                getArtistInfo(info.artist, info.album)
                            ]);

                            const year = albumData?.date || '';
                            // FILTER GENERIC GENRES: Prefer any tag that isn't 'music'. If only 'music' exists, return empty.
                            const style = (artistData?.tags || []).find(t => t.toLowerCase() !== 'music') || '';
                            const artwork = albumData?.artwork || '';

                            if (year || style || artwork) {
                                metadataCache.set(cacheKey, { year, style, artwork });
                                console.log(`Enrichment (Background): Success for "${cacheKey}" -> Year: ${year || '?'}, Style: ${style || '?'}`);

                                // PROPER SYNC: Trigger a metadata broadcast so the frontend refreshes
                                broadcast('metadata_update', { source: 'roon', info: { ...info, year, style, artworkUrl: artwork } });
                            }
                        } catch (e) {
                            console.warn('Metadata enrichment background task failed:', e.message);
                        }
                    })();
                }
            }

            console.log(`API Info (Roon): Sending Metadata for "${info.track}" - Year: ${info.year || 'MISSING'}`);
            return res.json(info);
        } else if (source === 'lms') {
            const data = await lmsController.getStatus();
            const info = { ...data };
            info.device = 'Raspberry Pi (Streaming)';
            info.signalPath = {
                quality: 'lossless',
                nodes: [
                    { type: 'source', description: 'Lyrion Music Server', details: 'PCM', status: 'lossless' },
                    { type: 'dsp', description: 'CamillaDSP', details: '64-bit Processing', status: 'enhanced' },
                    { type: 'output', description: 'Raspberry Pi DAC', details: 'Hardware Output', status: 'enhanced' }
                ]
            };
            info.source = 'lms';
            return res.json(info);
        }

        // Default: Apple Music / System
        if (isRunningOnPi) {
            return res.json({
                state: 'stopped',
                track: '',
                artist: '',
                album: '',
                artworkUrl: null,
                device: 'Apple Music (Remote)',
                signalPath: { quality: 'lossless', nodes: [] },
                source: 'apple'
            });
        }

        const zoneName = source === 'apple' ? 'Camilla' : getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        const output = await runMediaCommand('info');
        const info = JSON.parse(output);
        info.device = 'Mac / System';
        info.source = 'apple';

        if (info.artwork) {
            const crypto = require('crypto');
            const trackHash = crypto.createHash('md5').update(`${info.track}-${info.artist}`).digest('hex').substring(0, 8);
            info.artworkUrl = `/api/media/artwork?h=${trackHash}`;
        }

        // ALWAYS attempt metadata enrichment for Year/Style regardless of artwork
        const cacheKey = `${info.artist}-${info.album}`;
        if (info.artist && info.album && (!info.year || !info.style)) {
            if (metadataCache.has(cacheKey)) {
                const cached = metadataCache.get(cacheKey);
                if (!info.year) info.year = cached.year;
                if (!info.style) info.style = cached.style;
                if (!info.artworkUrl && cached.artwork) info.artworkUrl = cached.artwork;
            } else {
                try {
                    const data = await getAlbumInfo(info.artist, info.album);
                    if (data) {
                        if (!info.year) info.year = data.date;
                        if (!info.artworkUrl) info.artworkUrl = data.artwork;
                        metadataCache.set(cacheKey, { artwork: data.artwork, year: data.date });
                    }
                } catch (e) { }
            }
        }

        info.signalPath = {
            quality: 'enhanced',
            nodes: [
                { type: 'source', description: 'Apple Music / System', details: 'CoreAudio Local', status: 'lossless' },
                { type: 'dsp', description: 'CamillaDSP', details: '64-bit Processing', status: 'enhanced' },
                { type: 'output', description: 'D50 III', details: '96kHz Output', status: 'enhanced' }
            ]
        };

        console.log(`API Info (System/Apple): Sending Metadata for "${info.track}" - Year: ${info.year || 'MISSING'}`);
        return res.json(info);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/media/artist-info', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { artist, album } = req.query;
    console.log(`API: Request for artist-info: artist="${artist}", album="${album}"`);
    try {
        const info = await getArtistInfo(artist, album);
        const albumInfo = await getAlbumInfo(artist, album);
        const finalResponse = {
            artist: info,
            album: albumInfo,
            source: albumInfo?.source || info.source || 'MusicBrainz'
        };
        console.log(`API: Sending response for artist-info:`, JSON.stringify(finalResponse).substring(0, 300));
        res.json(finalResponse);
    } catch (e) {
        console.error('API Error in artist-info:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/config/remote', (req, res) => {
    res.json({
        remoteUrl: isRunningOnPi ? null : 'http://raspberrypi.local:3000'
    });
});

app.post('/api/unmute-dsp', async (req, res) => {
    const zone = roonController.getActiveZone();
    const activeDsp = zone ? getDspForZone(zone.display_name) : dsp;
    zoneConfig.autoMuteEnabled = false;
    saveZoneConfig();
    if (activeDsp && typeof activeDsp.setMute === 'function') {
        await activeDsp.setMute(false);
        isAutoMuted = false;
        res.json({ success: true, message: 'DSP unmuted' });
    } else {
        res.json({ success: true });
    }
});

app.get('/api/media/zones', async (req, res) => {
    const list = [];
    if (!isRunningOnPi) {
        list.push({ id: 'apple', name: 'Apple Music / System', state: 'ready', active: true, source: 'apple' });
    }
    try {
        const roonZones = roonController.getZones();
        if (roonZones) roonZones.forEach(z => list.push({ ...z, source: 'roon' }));
    } catch (e) { }
    /*
    try {
        const lmsPlayers = await lmsController.getPlayers();
        const localPiPlayer = lmsPlayers.find(p => p.id === lmsController.playerId);
        if (localPiPlayer) list.push(localPiPlayer);
    } catch (e) { }
    */
    res.json(list);
});

app.get('/api/media/roon/zones', (req, res) => {
    res.json(roonController.getZones());
});

app.post('/api/media/lms/select', (req, res) => {
    const { playerId } = req.body;
    lmsController.playerId = playerId;
    res.json({ success: true, playerId });
});

app.post('/api/media/roon/select', (req, res) => {
    const { zoneId } = req.body;
    roonController.setActiveZone(zoneId, true);
    zoneConfig.lastActiveZoneId = zoneId;
    const zone = roonController.getZone(zoneId);
    if (zone) zoneConfig.lastActiveZoneName = zone.display_name;
    saveZoneConfig();
    if (zone) broadcastZoneChange(zoneId, zone.display_name);
    res.json({ success: true, activeZoneId: zoneId });
});

app.get('/api/media/roon/image/:imageKey', (req, res) => {
    roonController.getImage(req.params.imageKey, res);
});

// Fix for Artwork: Add standard /api/image route used by frontend
app.get('/api/image/:imageKey', (req, res) => {
    roonController.getImage(req.params.imageKey, res);
});

app.get('/api/media/lms/artwork/:trackId', async (req, res) => {
    try {
        const { trackId } = req.params;
        const lmsUrl = `http://${lmsController.host}:${lmsController.port}/music/${trackId}/cover.jpg`;
        const response = await axios.get(lmsUrl, { responseType: 'stream' });
        response.data.pipe(res);
    } catch (e) {
        res.status(404).end();
    }
});

app.get('/api/media/artwork', async (req, res) => {
    const artworkPath = '/tmp/artisnova_artwork.jpg';
    if (fs.existsSync(artworkPath)) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.sendFile(artworkPath);
    } else {
        res.status(404).send('No artwork');
    }
});

app.get('/api/hostname', (req, res) => {
    res.json({ hostname: os.hostname() });
});

app.get('/api/media/lyrics', async (req, res) => {
    const { track, artist } = req.query;
    try {
        const lyrics = await getLyricsFromLrcLib(track, artist);
        res.json(lyrics || { error: 'Lyrics not found' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});

// History Endpoints
app.get('/api/history/stats', async (req, res) => {
    const { range } = req.query;
    try {
        const stats = await db.getStats(range || 'week');
        res.json(stats);
    } catch (e) {
        console.error('History Stats Error:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/history/list', async (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;
    try {
        const items = await db.getHistory(limit, offset);
        res.json({ items, page, limit });
    } catch (e) {
        console.error('History List Error:', e);
        res.status(500).json({ error: e.message });
    }
});

let cachedVolume = { value: 50, timestamp: 0 };
app.get('/api/volume', (req, res) => {
    const now = Date.now();
    if (now - cachedVolume.timestamp < 2000) return res.json({ volume: cachedVolume.value });
    const { exec } = require('child_process');
    exec('osascript -e "output volume of (get volume settings)"', { timeout: 2000 }, (error, stdout) => {
        if (!error) cachedVolume = { value: parseInt(stdout.trim()), timestamp: now };
        res.json({ volume: cachedVolume.value });
    });
});

app.post('/api/volume', (req, res) => {
    const { volume, source } = req.body;
    if (source === 'roon' && roonController.activeZoneId) {
        roonController.control('volume', volume);
        return res.json({ success: true, volume });
    }
    const { exec } = require('child_process');
    exec(`osascript -e "set volume output volume ${volume}"`, (error) => {
        if (!error) res.json({ success: true, volume });
        else res.status(500).json({ error: 'Failed' });
    });
});

app.get('/api/zones/config', (req, res) => {
    const backends = Object.entries(DSP_BACKENDS).map(([id, backend]) => ({ id, name: backend.name, wsUrl: backend.wsUrl }));
    res.json({ zones: zoneConfig.zones, defaults: zoneConfig.defaults, backends });
});

app.post('/api/zones/config', (req, res) => {
    const { zoneId, backend } = req.body;
    if (backend) zoneConfig.zones[zoneId] = backend;
    else delete zoneConfig.zones[zoneId];
    saveZoneConfig();
    res.json({ success: true, zones: zoneConfig.zones });
});

app.post('/api/zones/default', (req, res) => {
    const { backend } = req.body;
    zoneConfig.defaults.dspBackend = backend;
    saveZoneConfig();
    res.json({ success: true, defaults: zoneConfig.defaults });
});

app.post('/api/zones/backend-settings', (req, res) => {
    const { backendId, settings } = req.body;
    if (!zoneConfig.backendSettings) zoneConfig.backendSettings = {};
    zoneConfig.backendSettings[backendId] = { ...zoneConfig.backendSettings[backendId], ...settings };
    if (backendId === 'raspi') {
        remoteDsp.setOptions(settings);
    }
    saveZoneConfig();
    res.json({ success: true, backendSettings: zoneConfig.backendSettings });
});


// Serve Frontend
const FRONTEND_DIST = path.join(__dirname, 'public');
if (fs.existsSync(FRONTEND_DIST)) {
    app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        next();
    });
    app.use(express.static(FRONTEND_DIST));
    app.get('*', (req, res) => res.sendFile(path.join(FRONTEND_DIST, 'index.html')));
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

// SIMPLIFIED PROXY FOR MAIN DSP (ActivePort 5005)
// No more switching, no more LevelProbe class logic for fallback.
let mainDspSocket = null; // Single connection to 5005
let levelSubscribers = new Set();
let reconnectTimer = null;

function connectToMainDsp() {
    if (mainDspSocket && (mainDspSocket.readyState === WebSocket.OPEN || mainDspSocket.readyState === WebSocket.CONNECTING)) return;

    mainDspSocket = new WebSocket('ws://127.0.0.1:5005');

    mainDspSocket.on('open', () => {
        console.log('WS-Proxy: Connected to Main DSP (5005)');
        if (reconnectTimer) { clearInterval(reconnectTimer); reconnectTimer = null; }
        // Subscribe to levels immediately
        mainDspSocket.send('"GetCaptureSignalPeak"');
    });

    mainDspSocket.on('message', (data) => {
        try {
            const msg = JSON.parse(data);
            if (msg.GetCaptureSignalPeak) {
                const levels = msg.GetCaptureSignalPeak.value;
                if (levels) broadcastLevels(levels);
            }
        } catch (e) { }
    });

    mainDspSocket.on('close', () => {
        console.log('WS-Proxy: Main DSP disconnected. Retrying in 1s...');
        mainDspSocket = null;
        if (!reconnectTimer) {
            reconnectTimer = setInterval(connectToMainDsp, 1000);
        }
    });

    mainDspSocket.on('error', () => {
        if (mainDspSocket) { mainDspSocket.close(); }
    });
}

// Poll Levels from Main DSP constantly
setInterval(() => {
    if (mainDspSocket && mainDspSocket.readyState === WebSocket.OPEN) {
        mainDspSocket.send('"GetCaptureSignalPeak"');
    }
}, 100);

function broadcastLevels(levels) {
    if (!levels) return;

    // Filter: Only broadcast levels if the active backend is local
    const zoneName = getActiveZoneName();
    const backendId = getBackendIdForZone(zoneName);
    if (backendId !== 'local') return;

    const message = JSON.stringify(levels);
    levelSubscribers.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) ws.send(message);
    });

    // Also drive the RTA generation from these levels
    updateSpectrum(levels);
}

// --- SYNTHETIC RTA GENERATOR ---
// Generates a believable 31-band 1/3 octave spectrum from peak levels
const BANDS = 31;
let spectrumL = new Array(BANDS).fill(-100);
let spectrumR = new Array(BANDS).fill(-100);
// Simple noise generator state
let seed = 1;
function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function updateSpectrum(levels) {
    if (!levels) return;

    const normalizedL = levels[0] !== undefined ? Math.max(-100, levels[0]) : -100;
    const normalizedR = levels[1] !== undefined ? Math.max(-100, levels[1]) : -100;

    // Strict separation: Force silence if below a certain threshold to avoid "residual energy"
    const l = normalizedL < -65 ? -120 : normalizedL;
    const r = normalizedR < -65 ? -120 : normalizedR;

    const runSimulation = (energy, channel, channelData) => {
        // Strict silence threshold for synthetic RTA
        if (energy <= -99) {
            let changed = false;
            for (let i = 0; i < BANDS; i++) {
                if (channelData[i] > -120) {
                    channelData[i] = Math.max(-120, channelData[i] - 15); // Instant-like decay for silence
                    changed = true;
                }
            }
            return changed;
        }

        const time = Date.now();
        for (let i = 0; i < BANDS; i++) {
            let curveOffset = 0;
            if (i < 4) curveOffset = 5; // Bass boost
            else if (i > 20) curveOffset = -((i - 20) * 1.5); // HF Roll-off

            // Force visual difference between L and R
            const channelOffset = channel === 'L' ? 0 : Math.PI;
            const variance = (Math.sin(time / (100 + i * 20) + channelOffset) + 1) * 3;
            const jitter = (random() - 0.5) * 2;

            let targetDb = energy + curveOffset + (energy > -50 ? variance + jitter : 0);
            targetDb = Math.min(0, Math.max(-100, targetDb));

            if (targetDb > channelData[i]) {
                channelData[i] = targetDb;
            } else {
                channelData[i] = Math.max(-120, channelData[i] - 4.0); // Faster decay
            }
        }
        return true;
    };

    const changedL = runSimulation(l, 'L', spectrumL);
    const changedR = runSimulation(r, 'R', spectrumR);


    broadcastSpectrum();
}

function broadcastSpectrum() {
    // Send both L and R, plus combined legacy for compatibility
    const message = JSON.stringify({
        type: 'rta',
        left: spectrumL,
        right: spectrumR,
        data: spectrumL.map((l, i) => Math.max(l, spectrumR[i])) // Legacy fallback
    });

    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}


// Start Proxy
// Start Proxy
connectToMainDsp(); // Re-enabled: Connects to LOCAL (127.0.0.1:5005), vital for UI.


levelWss.on('connection', (ws) => {
    console.log('WS: Level subscriber connected (Always-On Mode)');
    levelSubscribers.add(ws);
    ws.on('close', () => levelSubscribers.delete(ws));
});

function broadcast(type, data) {
    if (type === 'metadata_update' || type === 'levels') {
        const zoneName = getActiveZoneName();
        const backendId = getBackendIdForZone(zoneName);
        if (data.source === 'roon' && backendId !== 'local') {
            // ... (keep logic)
        }
        if (type === 'levels') {
            if (backendId !== 'local') {
                // For remote levels, send raw array to level subscribers for compatibility
                const rawMessage = JSON.stringify(data);
                levelSubscribers.forEach(ws => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(rawMessage);
                });
            } else {
                return; // Already handled by broadcastLevels for local
            }
        }
    }

    const message = JSON.stringify({ type, data });
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(message);
    });
}

// Auto-Mute Logic for Hybrid Groups (Direct + DSP)
let isAutoMuted = false;
function checkHybridGroupMute() {
    // Logic remains but might be less relevant if we are always on. 
    // Kept to prevent double-audio if Roon groups Direct zone + BlackHole zone.
}

// Global broadcast for Roon changes - debounced
let roonUpdateTimeout = null;
roonController.init((info) => {
    if (roonUpdateTimeout) clearTimeout(roonUpdateTimeout);
    roonUpdateTimeout = setTimeout(() => {
        checkHybridGroupMute();

        // Enrich the broadcast update with cached metadata if available
        if (info && info.artist && info.album) {
            const cacheKey = `${info.artist}-${info.album}`;
            const cached = metadataCache.get(cacheKey);
            if (cached) {
                if (!info.year) info.year = cached.year;
                if (!info.style) info.style = cached.style;
                if (!info.artworkUrl && cached.artwork) info.artworkUrl = cached.artwork;
            }
        }

        broadcast('metadata_update', { source: 'roon', info });
        roonUpdateTimeout = null;
    }, 100);
});

// Proactive Sample Rate Handling
roonController.onSampleRateChange = async (newRate, zone) => {
    console.log(`Server: Sample rate change detected -> ${newRate}Hz for zone "${zone.display_name}"`);
    const activeDsp = getDspForZone(zone.display_name);

    if (newRate === 'CHECK') {
        // Simplified: Do nothing on periodic checks. Trust the persistent Keep-Alive of DSP Manager.
        return;
    }

    // Normal rate change: Restart with new rate
    const filters = activeDsp.lastFilterData || { filters: [], preamp: 0 };
    const options = { ...activeDsp.lastOptions, sampleRate: newRate };
    await activeDsp.start(filters, options);
};

// Silence Watchdog: If Roon is playing but no signal reaches Camilla
// Silence Watchdog: DISABLED - Was causing auto-stop issues
// Original watchdog was too aggressive and stopped DSP during normal pauses
// setInterval(async () => {
//     const activeZone = roonController.getActiveZone();
//     if (activeZone && activeZone.state === 'playing') {
//         const health = dsp.getHealthReport();
//         // If DSP is running but silent for > 5s while Roon is playing
//         if (health.dsp.running && !health.signal.present && health.signal.silenceDuration >= 6) {
//             console.warn(`Server: Silence Watchdog triggered! Roon is playing but Camilla is silent (${health.signal.silenceDuration}s). Restarting...`);
//             const activeDsp = getDspForZone(activeZone.display_name);
//             const filters = activeDsp.lastFilterData || { filters: [], preamp: 0 };
//             const options = activeDsp.lastOptions || { sampleRate: 96000 };
//             await activeDsp.start(filters, options);
//         }
//     }
// }, 2000);

// Periodic Diagnostic Logs
setInterval(() => {
    const localStatus = dsp.getHealthReport();
    const remoteStatus = remoteDsp.currentState || {};
    const zoneName = getActiveZoneName();
    const backendId = getBackendIdForZone(zoneName);

    console.log(`[HEARTBEAT] LocalDSP: ${localStatus.dsp.running ? 'RUNNING' : 'STOPPED'} | RemoteDSP: ${remoteStatus.running ? 'RUNNING' : 'STOPPED'} | ActiveZone: ${zoneName} (${backendId}) | Silence: ${localStatus.signal.silenceDuration}s`);
    if (!localStatus.dsp.running && dsp.shouldBeRunning) {
        console.warn(`[DIAGNOSTIC] Local DSP should be running but is stopped! Last Error: ${localStatus.lastError}`);
    }
}, 30000);

// Load configs and start
loadZoneConfig();
loadRaspiCredentials();

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Managing Always-On DSP at: ${CAMILLA_ROOT}`);
});
