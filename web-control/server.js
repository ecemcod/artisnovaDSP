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

    try {
        console.log(`Artist Info: Searching for "${artist}"...`);
        let adbArtist = await fetchAudioDB(artist);

        // Retry with first artist if failed and separator exists
        if (!adbArtist && (artist.includes('/') || artist.includes(',') || artist.toLowerCase().includes('feat.'))) {
            const firstArtist = artist.split(/(?:\/|,|feat\.)/i)[0].trim();
            console.log(`Artist Info: Retrying with first artist "${firstArtist}"...`);
            adbArtist = await fetchAudioDB(firstArtist);
        }

        if (adbArtist) {
            return {
                bio: adbArtist.strBiographyEN || null,
                formed: adbArtist.intFormedYear || 'Unknown',
                origin: adbArtist.strCountry || 'Unknown',
                tags: [adbArtist.strStyle, adbArtist.strGenre].filter(Boolean),
                image: adbArtist.strArtistThumb || null,
                source: 'TheAudioDB'
            };
        }

        // 2. Fallback: MusicBrainz (Metadata only, synthetic bio)
        let mbArtist = await fetchMusicBrainz(artist);
        if (!mbArtist && (artist.includes('/') || artist.includes(',') || artist.toLowerCase().includes('feat.'))) {
            const firstArtist = artist.split(/(?:\/|,|feat\.)/i)[0].trim();
            mbArtist = await fetchMusicBrainz(firstArtist);
        }

        if (mbArtist) {
            const tags = mbArtist.tags ? mbArtist.tags.map(t => t.name).slice(0, 5) : ['Music'];
            const formed = mbArtist['life-span'] ? (mbArtist['life-span'].begin || 'Unknown') : 'Unknown';

            return {
                // Synthetic Bio to force frontend display
                bio: `${mbArtist.name || artist} is an artist from ${mbArtist.country || 'Unknown'} formed in ${formed}. Genres: ${tags.join(', ')}.`,
                formed: formed,
                origin: mbArtist.country || 'Unknown',
                tags: tags,
                image: null,
                source: 'MusicBrainz'
            };
        }
    } catch (e) {
        console.warn(`Artist Info: API fetch failed for "${artist}":`, e.message);
    }

    return {
        bio: null,
        formed: '-',
        origin: '-',
        tags: ['Music'],
        source: 'Local'
    };
}

// Helper: Get Album Info (AudioDB)
async function getAlbumInfo(artist, album) {
    if (!artist || !album) return null;

    // Normalize album name by stripping common suffixes that may not match TheAudioDB
    const normalizeAlbumName = (name) => {
        return name
            .replace(/\s*\((Live|Remastered|Deluxe|Deluxe Edition|Special Edition|Expanded|Anniversary|Remaster|Bonus Track Version)\)\s*$/i, '')
            .replace(/\s*\[(Live|Remastered|Deluxe|Special Edition)\]\s*$/i, '')
            .trim();
    };

    const normalizedAlbum = normalizeAlbumName(album);
    const searchVariants = [album]; // Always try exact match first
    if (normalizedAlbum !== album) {
        searchVariants.push(normalizedAlbum); // Then try normalized
    }

    for (const searchAlbum of searchVariants) {
        try {
            const adbUrl = `https://www.theaudiodb.com/api/v1/json/2/searchalbum.php?s=${encodeURIComponent(artist)}&a=${encodeURIComponent(searchAlbum)}`;
            const adbRes = await axios.get(adbUrl, { timeout: 4000 });
            const adbAlbum = adbRes.data?.album?.[0];

            if (adbAlbum) {
                console.log(`AlbumInfo: Found "${adbAlbum.strAlbum}" for query "${searchAlbum}"`);
                let tracklist = [];
                if (adbAlbum.idAlbum) {
                    try {
                        const tracksUrl = `https://www.theaudiodb.com/api/v1/json/2/track.php?m=${adbAlbum.idAlbum}`;
                        const tracksRes = await axios.get(tracksUrl, { timeout: 3000 });
                        if (tracksRes.data?.track) {
                            tracklist = tracksRes.data.track.map(t => ({
                                number: parseInt(t.intTrackNumber),
                                title: t.strTrack,
                                duration: t.intDuration ? `${Math.floor(t.intDuration / 60000)}:${((t.intDuration % 60000) / 1000).toFixed(0).padStart(2, '0')}` : '--:--',
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
                    albumUrl: null
                };
            }
        } catch (e) {
            console.warn(`Album Info: AudioDB failed for "${searchAlbum}"`, e.message);
        }
    }

    console.log(`AlbumInfo: No results for "${artist}" - "${album}" (normalized: "${normalizedAlbum}")`);
    return null;
}


// History Database Init - Handled in database.js constructor
console.log('Server: History DB module loaded');


// Lyrics Utilities
// Simple in-memory cache for lyrics to avoid spamming the API
const lyricsCache = new Map();
const metadataCache = new Map(); // New: Metadata Cache for Album/Year enrichment

async function fetchLyrics(url, params) {
    try {
        const response = await axios.get(url, { params, timeout: 3000 });
        return response.data;
    } catch (e) {
        if (e.response && e.response.status === 404) return null; // Not found is fine
        throw e;
    }
}

async function getLyricsFromLrcLib(track, artist) {
    const cacheKey = `${artist}-${track}`.toLowerCase();

    // Check cache (expire after 24 hours?) - keeping it simple for now
    if (lyricsCache.has(cacheKey)) {
        const cached = lyricsCache.get(cacheKey);
        if (Date.now() - cached.timestamp < 1000 * 60 * 60 * 24) {
            return cached.data;
        }
    }

    const cleanArtist = artist.trim();
    const cleanTrack = track.trim();

    // Strategy A: Direct Get
    console.log(`Lyrics: Trying Get for "${cleanArtist}" - "${cleanTrack}"`);
    let data = await fetchLyrics('https://lrclib.net/api/get', {
        artist_name: cleanArtist,
        track_name: cleanTrack
    });

    if (data && (data.plainLyrics || data.syncedLyrics)) {
        const result = { plain: data.plainLyrics, synced: data.syncedLyrics, instrumental: data.instrumental };
        lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    }

    // Strategy B: Search
    console.log(`Lyrics: Trying Search for "${cleanArtist} ${cleanTrack}"`);
    let searchData = await fetchLyrics('https://lrclib.net/api/search', {
        q: `${cleanArtist} ${cleanTrack}`
    });

    if (Array.isArray(searchData) && searchData.length > 0) {
        const bestMatch = searchData[0]; // Take first match
        const result = { plain: bestMatch.plainLyrics, synced: bestMatch.syncedLyrics, instrumental: bestMatch.instrumental };
        lyricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
        return result;
    }

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

            // Enrich with cached Year/Album info if missing
            const cacheKey = `${info.artist}-${info.album}`;
            if (info.artist && info.album && !info.year) {
                if (metadataCache.has(cacheKey)) {
                    info.year = metadataCache.get(cacheKey).year;
                } else {
                    // Trigger async fetch but return current response immediately to avoid lag
                    // The next poll will pick it up
                    getAlbumInfo(info.artist, info.album).then(data => {
                        if (data && data.date) {
                            metadataCache.set(cacheKey, { year: data.date });
                        } else {
                            metadataCache.set(cacheKey, { year: '' }); // Prevent retry spam
                        }
                    });
                }
            }

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
                signalPath: { quality: 'lossless', nodes: [] }
            });
        }

        const zoneName = source === 'apple' ? 'Camilla' : getActiveZoneName();
        const activeDsp = getDspForZone(zoneName);
        const output = await runMediaCommand('info');
        const info = JSON.parse(output);
        info.device = 'Mac / System';

        // Retrieve artwork via hash... (simplified for brevity, existing logic holds)
        if (info.artwork) {
            const crypto = require('crypto');
            const trackHash = crypto.createHash('md5').update(`${info.track}-${info.artist}`).digest('hex').substring(0, 8);
            info.artworkUrl = `/api/media/artwork?h=${trackHash}`;
        }

        info.signalPath = {
            quality: 'enhanced',
            nodes: [
                { type: 'source', description: 'Apple Music / System', details: 'CoreAudio Local', status: 'lossless' },
                { type: 'dsp', description: 'CamillaDSP', details: '64-bit Processing', status: 'enhanced' },
                { type: 'output', description: 'D50 III', details: '96kHz Output', status: 'enhanced' }
            ]
        };

        return res.json(info);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/media/artist-info', async (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { artist, album } = req.query;
    try {
        const info = await getArtistInfo(artist, album);
        const albumInfo = await getAlbumInfo(artist, album);
        res.json({ artist: info, album: albumInfo, source: info.source });
    } catch (e) {
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
let spectrumData = new Array(BANDS).fill(-100);
let spectrumDecay = new Array(BANDS).fill(0);
// Simple noise generator state
let seed = 1;
function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
}

function updateSpectrum(levels) {
    if (!levels) return;

    // Average levels and clamp
    const l = Math.max(-100, levels[0]);
    const r = Math.max(-100, levels[1]);
    const maxDb = Math.max(l, r); // Driver

    // If silence, decay rapidly
    if (maxDb < -60) {
        for (let i = 0; i < BANDS; i++) {
            spectrumData[i] = Math.max(-120, spectrumData[i] - 2);
        }
        broadcastSpectrum();
        return;
    }

    // Generate spectrum shape
    // Bass (0-5) is high energy, Mids (6-20) moderate, Highs (21-30) roll off
    for (let i = 0; i < BANDS; i++) {
        // Base energy from volume
        let energy = maxDb;

        // Shape the EQ curve roughly (Green/Pink noise-ish)
        let curveOffset = 0;
        if (i < 4) curveOffset = 5; // Bass boost
        else if (i > 20) curveOffset = -((i - 20) * 1.5); // HF Roll-off

        // Add pseudo-random variance per band that moves slowly
        const variance = (Math.sin(Date.now() / (100 + i * 20)) + 1) * 5; // 0-10db variance

        // Add fast jitter
        const jitter = (random() - 0.5) * 4;

        let targetDb = energy + curveOffset + variance + jitter;

        // Clamp logical max
        targetDb = Math.min(0, Math.max(-100, targetDb));

        // Physics: Attack is instant, Decay is linear
        if (targetDb > spectrumData[i]) {
            spectrumData[i] = targetDb;
        } else {
            spectrumData[i] = Math.max(-120, spectrumData[i] - 1.5); // Decay speed
        }
    }
    broadcastSpectrum();
}

function broadcastSpectrum() {
    const message = JSON.stringify({ type: 'rta', data: spectrumData });
    // Broadcast to visualization subscribers (piggyback on main WSS or levelWSS? 
    // Let's use the main WSS for metadata/state/rta to keep levels separated if needed, 
    // BUT RTA is high frequency. Let's send it effectively via the level broadcasting loop or similar mechanism.
    // Actually, create a dedicated channel or just use the main one? 
    // The main WSS is for "metadata and state". Let's use it but perhaps limit rate if needed. 
    // ACTUALLY: RTA is 30-60fps. Levels is 10fps. 
    // Let's add RTA to the 'broadcast' function logic or a specific rtaSubscribers set.

    // We'll trust the main broadcast function for now, or optimizing:
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            // Only send if client actually wants it? For now broadcast all.
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
