const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const os = require('os');

// Node 22+ Roon API Workaround
global.WebSocket = require('ws');

const https = require('https');
const DSPManager = require('./dsp-manager');
const FilterParser = require('./parser');

const app = express();
app.use(cors());
app.use(express.json());

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


const PORT = 3001;
const CAMILLA_ROOT = path.resolve(__dirname, '..'); // camilla dir
const PRESETS_DIR = path.join(CAMILLA_ROOT, 'presets');

const dsp = new DSPManager(CAMILLA_ROOT);

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
async function handleSampleRateChange(newRate, source = 'Auto') {
    // Skip if we shouldn't be running or already processing a change
    if (!dsp.shouldBeRunning || isProcessingSampleRateChange) return;

    // Debounce: Prevent rapid restarts
    const now = Date.now();
    if (now - lastRestartTime < MIN_RESTART_INTERVAL) {
        console.log(`Server: [${source}] Ignoring rate change - too soon after last restart (${now - lastRestartTime}ms ago)`);
        return;
    }

    // Check if change is actually needed
    const currentDSPRate = dsp.currentState.sampleRate;
    const isActuallyRunning = dsp.isRunning();

    // Allow forced restarts for album changes (stream recovery) even at same rate
    const isForceRecovery = source === 'AlbumChangeRecovery';

    if (newRate === currentDSPRate && isActuallyRunning && !isForceRecovery) {
        console.log(`Server: [${source}] Rate unchanged (${newRate}Hz) and DSP running. No action needed.`);
        return;
    }

    isProcessingSampleRateChange = true;
    console.log(`Server: [${source}] Sample rate change detected: ${currentDSPRate} -> ${newRate}Hz`);

    // Update global tracker
    lastDetectedSampleRate = newRate;

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
        console.log(`Server: [Transition] Phase 2: Restarting DSP at ${newRate}Hz...`);

        // Record restart time for debounce
        lastRestartTime = Date.now();

        // Stop current DSP
        await dsp.stop();
        dsp.shouldBeRunning = true;

        // Wait for audio device to be fully released
        await new Promise(r => setTimeout(r, 1000));

        // Check if we were in bypass mode - we need to respect this
        const wasInBypass = dsp.currentState.bypass;

        // Start DSP with new rate (respecting bypass mode)
        try {
            if (wasInBypass) {
                // Restart in bypass mode with new sample rate
                await dsp.startBypass(newRate);
                console.log(`Server: [Transition] CamillaDSP started in BYPASS mode at ${newRate}Hz`);
            } else {
                // Restart with filters
                const filterData = dsp.lastFilterData ? { ...dsp.lastFilterData } : { filters: [], preamp: -3 };
                const baseOptions = dsp.lastOptions ? { ...dsp.lastOptions } : { bitDepth: 24 };
                const options = {
                    ...baseOptions,
                    sampleRate: newRate
                };
                await dsp.start(filterData, options);
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
// Event-Driven Switching (Instant)
// ----------------------------------------------------------------------
// Triggered immediately when Roon track metadata changes
roonController.onSampleRateChange = async (newRate) => {
    if (newRate === 'CHECK') {
        // First, check hardware rate WITHOUT stopping DSP
        const hwRate = getBlackHoleSampleRate();
        console.log(`Server: [ActiveProbe] Pre-check - Hardware: ${hwRate}Hz, DSP: ${dsp.currentState.sampleRate}Hz`);

        // If the rate is the same, no action needed
        if (hwRate && hwRate === dsp.currentState.sampleRate && dsp.isRunning()) {
            console.log('Server: [ActiveProbe] Same rate confirmed. No restart needed.');
            return;
        }

        // Rate is different or unknown - need to probe properly
        console.log(`Server: [ActiveProbe] Rate mismatch or unknown. Unlocking device to detect rate...`);

        // 1. Temporarily stop DSP to release CoreAudio device (allow Roon to set rate)
        if (dsp.isRunning()) {
            await dsp.stop();
        }

        // 2. Wait for Roon to seize the device and set the sample rate
        await new Promise(r => setTimeout(r, 1500));

        // 3. Poll the hardware
        const detectedRate = getBlackHoleSampleRate();
        console.log(`Server: [ActiveProbe] Hardware reports: ${detectedRate}Hz`);

        // 4. Restart DSP at the detected rate (or default if detection failed)
        if (detectedRate) {
            handleSampleRateChange(detectedRate, 'ActiveProbe');
        } else {
            // Fallback if probe failed: restart at previous rate
            handleSampleRateChange(dsp.currentState.sampleRate || 44100, 'ActiveProbeFallback');
        }

    } else if (newRate && newRate !== dsp.currentState.sampleRate) {
        console.log(`Server: Roon reported new rate: ${newRate}Hz (current: ${dsp.currentState.sampleRate}Hz). Triggering switch...`);
        handleSampleRateChange(newRate, 'RoonMetadata');
    } else {
        console.log(`Server: Roon callback with same rate (${newRate}Hz). Ignoring.`);
    }
};

// ----------------------------------------------------------------------
// Album Change Handler (Stream Recovery)
// ----------------------------------------------------------------------
// When album changes (different disc) but sample rate is the same,
// the audio stream may need recovery. Force DSP restart.
roonController.onAlbumChange = async (albumName, sameRate) => {
    console.log(`Server: Album changed to "${albumName}" (sameRate: ${sameRate}). Forcing DSP restart for stream recovery...`);

    if (!dsp.isRunning() || isProcessingSampleRateChange) {
        console.log('Server: DSP not running or already processing, skipping album change restart');
        return;
    }

    // Get current hardware rate
    const hwRate = getBlackHoleSampleRate() || dsp.currentState.sampleRate || 44100;

    // Force restart at the same rate to recover the stream
    // Use a slightly different source name so logs are clear
    handleSampleRateChange(hwRate, 'AlbumChangeRecovery');
};

// ----------------------------------------------------------------------
// Fallback Polling (Legacy/Safety)
// ----------------------------------------------------------------------
setInterval(async () => {
    // Always track the current sample rate
    const currentRate = getBlackHoleSampleRate();
    if (!currentRate) return;

    // Initialize lastDetectedSampleRate on first detection
    if (lastDetectedSampleRate === null) {
        lastDetectedSampleRate = currentRate;
        console.log(`Server: Initial BlackHole sample rate: ${currentRate}Hz`);
        return;
    }

    // Check for rate mismatch between hardware and DSP
    const dspRate = dsp.currentState.sampleRate;

    if (currentRate !== dspRate && dsp.isRunning() && !isProcessingSampleRateChange) {
        // Hardware rate differs from DSP - need to restart
        console.log(`Server: [Poll] Rate mismatch detected! Hardware: ${currentRate}Hz, DSP: ${dspRate}Hz. Restarting...`);
        handleSampleRateChange(currentRate, 'RateMismatchRecovery');
    } else if (dsp.shouldBeRunning && !dsp.isRunning() && !isProcessingSampleRateChange) {
        // Crash recovery case
        console.log('Server: [Poll] DSP Crash detected. Recovering...');
        handleSampleRateChange(currentRate, 'CrashRecovery');
    }
}, 5000);


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

        // Auto-detect sample rate from BlackHole if not specified or use BlackHole's current rate
        const detectedRate = getBlackHoleSampleRate();
        const options = {
            sampleRate: parseInt(sampleRate) || detectedRate || 96000,
            bitDepth: parseInt(bitDepth) || 24,
            presetName: presetName
        };
        console.log(`Starting DSP with sample rate: ${options.sampleRate}Hz (requested: ${sampleRate}, detected: ${detectedRate})`);

        await dsp.start(filterData, options);
        res.json({ success: true, state: 'running', sampleRate: options.sampleRate, bitDepth: options.bitDepth });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Stop DSP
app.post('/api/stop', async (req, res) => {
    await dsp.stop();
    res.json({ success: true, state: 'stopped' });
});

// 5b. Bypass Mode (no DSP processing, direct audio)
app.post('/api/bypass', async (req, res) => {
    try {
        const detectedRate = getBlackHoleSampleRate();
        const sampleRate = detectedRate || 96000;

        await dsp.startBypass(sampleRate);
        res.json({ success: true, state: 'bypass', sampleRate });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 6. Status (includes current sample rate for dynamic UI updates)
app.get('/api/status', (req, res) => {
    // Get actual hardware sample rate for real-time accuracy
    const hardwareRate = getBlackHoleSampleRate();
    const dspRate = dsp.currentState.sampleRate || 0;

    // Use hardware rate if available, otherwise use DSP reported rate
    const currentSampleRate = hardwareRate || dspRate;

    // Determine source bit depth (prefer Roon's actual source if available)
    let currentBitDepth = dsp.currentState.bitDepth || 24;

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
        running: dsp.isRunning(),
        bypass: dsp.currentState.bypass || false,
        sampleRate: currentSampleRate,
        bitDepth: currentBitDepth,
        presetName: dsp.currentState.presetName || null,
        filtersCount: dsp.currentState.filtersCount || 0,
        preamp: dsp.currentState.preamp || 0,
        // Diagnostic: rate mismatch detection
        rateMismatch: hardwareRate && dspRate && hardwareRate !== dspRate
    });
});

// 7. macOS Media Controls (via Python script)
const { exec } = require('child_process');

const MEDIA_SCRIPT = path.join(__dirname, 'media_keys.py');

const runMediaCommand = (action) => {
    return new Promise((resolve, reject) => {
        exec(`python3 "${MEDIA_SCRIPT}" ${action}`, (error, stdout, stderr) => {
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

const getArtworkFromiTunes = (track, artist, album) => {
    return new Promise((resolve) => {
        if (!artist && !track && !album) return resolve(null);

        const searches = [];
        // 1. Exact Album match (ES store for Spanish music support)
        if (album && artist) searches.push({ term: `${album} ${artist}`, entity: 'album' });
        // 2. Exact Track match
        if (track && artist) searches.push({ term: `${track} ${artist}`, entity: 'song' });
        // 3. Fallback: Any album by this artist (better than no image)
        if (artist) searches.push({ term: artist, entity: 'album' });

        const trySearch = (index) => {
            if (index >= searches.length) return resolve(null);

            const item = searches[index];
            const query = encodeURIComponent(item.term);
            // Default to ES store which has better coverage for user's music
            const url = `https://itunes.apple.com/search?term=${query}&entity=${item.entity}&limit=1&country=ES`;

            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.results && json.results.length > 0) {
                            // Get high res image
                            const artworkUrl = json.results[0].artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
                            resolve(artworkUrl);
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
        .replace(/\s*\([^)]*(Version|Remaster|Explicit|Deluxe|Edition|Live|Recorded|Remix|Single|EP)[^)]*\)/gi, '')
        .replace(/\s*\[[^\]]*(Version|Remaster|Explicit|Deluxe|Edition|Live|Recorded|Remix|Single|EP)[^\]]*\]/gi, '')
        .replace(/\s*- (Live|Remaster|Remix|Single|EP)$/gi, '')
        .split(' - ')[0] // Take first part if there's a dash like "Song Name - Live"
        .trim();

    let cleanArtist = artist
        .split(/[,&]/)[0] // Take first artist if multiple
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

    // Strategy A: Direct Get (Artist + Track)
    console.log(`Lyrics: [Strategy A] Trying Get for "${cleanArtist}" - "${cleanTrack}"`);
    let data = await fetchLyrics('https://lrclib.net/api/get', {
        artist_name: cleanArtist,
        track_name: cleanTrack
    });

    if (data && (data.plainLyrics || data.syncedLyrics)) {
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

        if (bestMatch && (bestMatch.plainLyrics || bestMatch.syncedLyrics)) {
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
        if (match && (match.plainLyrics || match.syncedLyrics)) {
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
            if (match && (match.plainLyrics || match.syncedLyrics)) {
                console.log(`Lyrics: Strategy D Success`);
                return { plain: match.plainLyrics, synced: match.syncedLyrics, instrumental: match.instrumental };
            }
        }
    }

    console.log(`Lyrics: All strategies failed for "${artist}" - "${track}"`);
    return null;
};

app.post('/api/media/playpause', async (req, res) => {
    const source = req.query.source || req.body.source;
    try {
        if (source === 'roon' && roonController.activeZoneId) {
            await roonController.control('playpause');
        } else {
            await runMediaCommand('play');
        }
        res.json({ success: true, action: 'playpause' });
    } catch (e) {
        console.error('Play/pause error:', e);
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


app.get('/api/media/queue', async (req, res) => {
    try {
        const output = await runMediaCommand('queue');
        const queueData = JSON.parse(output);

        if (queueData && queueData.queue && queueData.queue.length > 0) {
            // Batched artwork lookup for the first 15 tracks
            const enhancedQueue = await Promise.all(queueData.queue.slice(0, 15).map(async (item) => {
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
                // Use detected sample rate if available
                const sr = dsp.currentState.sampleRate || 0;
                const rateStr = sr ? `${sr / 1000}kHz` : 'Unknown';

                // Smart Labeling: > 48kHz = High Res. <= 48kHz = Standard (CD/PCM). 
                // We avoid "Lossy" label since we can't distinguish CD from MP3 without metadata.
                const isHiRes = sr > 48000;

                // Use 'lossless' status for standard (Blue/Purple) instead of 'lossy' (Orange)
                // This gives CD quality the benefit of the doubt.
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
            if (dsp.isRunning()) {
                uiNodes.push(
                    {
                        type: 'dsp',
                        description: 'CamillaDSP',
                        details: `64-bit Processing • ${dsp.currentState.presetName || 'Custom'}`,
                        status: 'enhanced'
                    },
                    {
                        type: 'output',
                        description: 'D50 III',
                        details: `${dsp.currentState.sampleRate / 1000}kHz Output`,
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

            if (dsp.isRunning()) {
                info.signalPath.nodes.push(
                    {
                        type: 'dsp',
                        description: 'CamillaDSP',
                        details: `64-bit Processing • ${dsp.currentState.presetName || 'Custom'} (${dsp.currentState.filtersCount} filters) • Gain: ${dsp.currentState.preamp || 0}dB`,
                        status: 'enhanced'
                    },
                    {
                        type: 'output',
                        description: 'D50 III',
                        details: `${dsp.currentState.sampleRate / 1000}kHz • ${dsp.currentState.bitDepth}-bit Hardware Output`,
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
    roonController.setActiveZone(zoneId);
    res.json({ success: true });
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


// Get lyrics
app.get('/api/media/lyrics', async (req, res) => {
    const { track, artist } = req.query;
    if (!track || !artist) return res.status(400).json({ error: 'Missing track or artist' });

    try {
        const lyrics = await getLyricsFromLrcLib(track, artist);
        res.json(lyrics || { error: 'Lyrics not found' });
    } catch (e) {
        res.status(500).json({ error: 'Failed to fetch lyrics' });
    }
});

// Serve Frontend with anti-cache headers
const FRONTEND_DIST = path.join(CAMILLA_ROOT, 'web-app-new', 'dist');
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


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Managing DSP at: ${CAMILLA_ROOT}`);
    console.log(`Presets at: ${PRESETS_DIR}`);
});
