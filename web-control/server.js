const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const https = require('https');
const DSPManager = require('./dsp-manager');
const FilterParser = require('./parser');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const CAMILLA_ROOT = path.resolve(__dirname, '..'); // camilla dir
const PRESETS_DIR = path.join(CAMILLA_ROOT, 'presets');

const dsp = new DSPManager(CAMILLA_ROOT);

// Ensure presets dir exists
if (!fs.existsSync(PRESETS_DIR)) {
    fs.mkdirSync(PRESETS_DIR, { recursive: true });
}

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

        const options = {
            sampleRate: parseInt(sampleRate) || 44100,
            bitDepth: parseInt(bitDepth) || 24
        };

        await dsp.start(filterData, options);
        res.json({ success: true, state: 'running', sampleRate: options.sampleRate, bitDepth: options.bitDepth });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 5. Stop DSP
app.post('/api/stop', (req, res) => {
    dsp.stop();
    res.json({ success: true, state: 'stopped' });
});

// 6. Status
app.get('/api/status', (req, res) => {
    res.json({ running: dsp.isRunning() });
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
        if (track && artist) searches.push(`${track} ${artist}`);
        if (album && artist) searches.push(`${album} ${artist}`);

        const trySearch = (index) => {
            if (index >= searches.length) return resolve(null);

            const query = encodeURIComponent(searches[index]);
            const entity = index === 0 && track ? 'song' : 'album';
            const url = `https://itunes.apple.com/search?term=${query}&entity=${entity}&limit=1`;

            https.get(url, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        if (json.results && json.results.length > 0) {
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

const getLyricsFromLrcLib = (track, artist) => {
    return new Promise((resolve) => {
        if (!artist || !track) return resolve(null);

        // Clean the track name for better search results
        let cleanTrack = track
            .replace(/\s*\(Live\)/gi, '')           // Remove (Live)
            .replace(/\s*\[Live\]/gi, '')           // Remove [Live]
            .replace(/\s*- Live$/gi, '')            // Remove - Live at end
            .replace(/\s*\(Remaster(ed)?\)/gi, '')  // Remove (Remaster) or (Remastered)
            .replace(/\s*\[Remaster(ed)?\]/gi, '')  // Remove [Remaster] or [Remastered]
            .replace(/\s*\(\d{4}\s*Remaster\)/gi, '') // Remove (2023 Remaster) etc.
            .replace(/\s*\/.*$/, '')                // Remove everything after /
            .replace(/\s*\(feat\..*?\)/gi, '')      // Remove (feat. Artist)
            .replace(/\s*\(ft\..*?\)/gi, '')        // Remove (ft. Artist)
            .trim();

        // Also clean artist name
        let cleanArtist = artist
            .replace(/\s*&.*$/, '')                 // Remove & other artists
            .replace(/\s*,.*$/, '')                 // Remove , other artists
            .trim();

        const artistQuery = encodeURIComponent(cleanArtist);
        const trackQuery = encodeURIComponent(cleanTrack);
        // Using lrclib.net get endpoint
        const url = `https://lrclib.net/api/get?artist_name=${artistQuery}&track_name=${trackQuery}`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    // lrclib returns 404 if not found, but we handle it in parse
                    if (json.plainLyrics || json.syncedLyrics) {
                        resolve({
                            plain: json.plainLyrics,
                            synced: json.syncedLyrics,
                            instrumental: json.instrumental
                        });
                    } else {
                        resolve(null);
                    }
                } catch (e) {
                    resolve(null);
                }
            });
        }).on('error', () => resolve(null));
    });
};

app.post('/api/media/playpause', async (req, res) => {
    try {
        await runMediaCommand('play');
        res.json({ success: true, action: 'playpause' });
    } catch (e) {
        console.error('Play/pause error:', e);
        res.status(500).json({ error: 'Failed to toggle play/pause' });
    }
});

app.post('/api/media/next', async (req, res) => {
    try {
        await runMediaCommand('next');
        res.json({ success: true, action: 'next' });
    } catch (e) {
        console.error('Next track error:', e);
        res.status(500).json({ error: 'Failed to skip to next track' });
    }
});

app.post('/api/media/stop', async (req, res) => {
    try {
        await runMediaCommand('stop');
        res.json({ success: true, action: 'stop' });
    } catch (e) {
        console.error('Stop error:', e);
        res.status(500).json({ error: 'Failed to stop' });
    }
});

app.post('/api/media/prev', async (req, res) => {
    try {
        await runMediaCommand('prev');
        res.json({ success: true, action: 'prev' });
    } catch (e) {
        console.error('Prev track error:', e);
        res.status(500).json({ error: 'Failed to go to previous track' });
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
    try {
        const output = await runMediaCommand('info');
        const info = JSON.parse(output);

        // Try iTunes if local artwork failed or is missing
        if (!info.artwork && (info.track || info.album) && info.artist) {
            info.artworkUrl = await getArtworkFromiTunes(info.track, info.artist, info.album);
        } else if (info.artwork) {
            info.artworkUrl = '/api/media/artwork?' + Date.now();
        }

        res.json(info);
    } catch (e) {
        console.error('Media info error:', e);
        res.json({ state: 'unknown', track: '', artist: '', album: '', artwork: '' });
    }
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

// Serve Frontend
const FRONTEND_DIST = path.join(CAMILLA_ROOT, 'web-app-new', 'dist');
if (fs.existsSync(FRONTEND_DIST)) {
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
