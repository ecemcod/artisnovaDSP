const RoonApi = require("node-roon-api");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const RoonApiBrowse = require("node-roon-api-browse");

// Node 22 workaround
// Node 22 workaround: Force 'ws' package as native WebSocket isn't fully compatible with node-roon-api yet
try {
    global.WebSocket = require('ws');
    console.log('RoonController: Forced use of "ws" package for Roon API compatibility.');
} catch (e) {
    console.error('RoonController: Failed to load "ws" package:', e);
}



class RoonController {
    constructor() {
        console.log('RoonController: Instance created');
        this.roon = null;
        this.core = null;
        this.transport = null;
        this.browseApi = null;
        this.activeZoneId = null;
        this.activeZoneName = null; // Track name for recovery
        this.zones = new Map();
        this.statusCallback = null;
        this.isPaired = false;
        // Sample rate tracking
        this.currentSampleRate = null;
        this.currentTrackKey = null;  // Track ID to detect actual song changes
        this.currentAlbum = null;     // Album tracking for stream recovery
        this.onSampleRateChange = null;  // Callback: (newRate) => {}
        this.onAlbumChange = null;       // Callback: (albumName, sameRate) => {} - for stream recovery
        this.checkTimeout = null; // Debounce for missing signal path
        this.queue = [];      // Current zone playback queue
        this._queueSubscription = null;
        this.isQueueSubscribed = false;

        this.currentTrackKey = null;
        this.currentAlbum = null;
        this.checkTimeout = null;
        this.isCheckingRate = false;
    }

    init(callback) {
        console.log('RoonController: Initializing...');
        this.statusCallback = callback;

        this.roon = new RoonApi({
            extension_id: 'com.artisnova.dsp.v2',
            display_name: 'Artis Nova DSP Controller',
            display_version: '1.2.0',
            publisher: 'Artis Nova',
            email: 'admin@artisnova.com',
            log_level: 'all',

            core_paired: (core) => {

                console.log('Roon Core Paired:', core.display_name);
                this.core = core;
                this.transport = core.services.RoonApiTransport;
                this.browseApi = core.services.RoonApiBrowse;
                this.isPaired = true;

                // Probe History on Pair
                setTimeout(() => {
                    this.probeHistoryAccess();
                }, 5000);

                this.transport.subscribe_zones(async (status, data) => {
                    console.log(`RoonController: SubscribeZones Status=${status}`);
                    if (status === "Subscribed" || status === "Changed") {
                        if (data.zones) {
                            data.zones.forEach(z => {
                                console.log(`RoonController: adding zone ${z.display_name} (${z.zone_id})`);
                                this.zones.set(z.zone_id, z);

                                // Auto-select "Camilla" zone if no active zone is set
                                if (!this.activeZoneId && z.display_name === "Camilla") {
                                    console.log(`RoonController: Auto-selecting zone: ${z.display_name} (${z.zone_id})`);
                                    this.setActiveZone(z.zone_id); // Use setter to trigger queue subscription
                                }

                                // Debug matching
                                if (this.activeZoneId && z.zone_id !== this.activeZoneId) {
                                    console.log(`RoonController: Zone mismatch. Active=${this.activeZoneId}, Found=${z.zone_id} (${z.display_name})`);
                                }

                                // If we have a restored activeZoneId, trigger queue subscription when it's found
                                if (this.activeZoneId === z.zone_id && !this.isQueueSubscribed) {
                                    console.log(`RoonController: Restored zone ${z.display_name} found, subscribing to queue.`);
                                    this._subscribeQueue();
                                }
                            });
                        }
                        if (data.zones_added) {
                            data.zones_added.forEach(z => {
                                console.log(`RoonController: Zone Added ${z.display_name}`);
                                this.zones.set(z.zone_id, z);
                            });
                        }
                        if (data.zones_changed) {
                            data.zones_changed.forEach(z => {
                                console.log(`RoonController: Zone Changed ${z.display_name}`);
                                const old = this.zones.get(z.zone_id) || {};
                                const combinedZone = { ...old, ...z };

                                // Detect Playback Start (e.g. paused -> playing, stopped -> playing)
                                if (z.state === 'playing' && old.state !== 'playing') {
                                    console.log(`RoonController: Playback STARTED for zone "${combinedZone.display_name}"`);
                                    if (this.onPlaybackStart) this.onPlaybackStart(combinedZone);
                                }

                                this.zones.set(z.zone_id, combinedZone);
                            });
                        }
                        if (data.zones_removed) {
                            data.zones_removed.forEach(zid => {
                                console.log(`RoonController: Zone Removed ${zid}`);
                                this.zones.delete(zid);
                            });
                        }

                        // RECOVERY LOGIC: If active zone is missing but we have a name, try to find it
                        if (this.activeZoneName && (!this.activeZoneId || !this.zones.has(this.activeZoneId))) {
                            this._attemptZoneRecovery();
                        }

                        console.log(`RoonController: Current Map size after update: ${this.zones.size}`);

                        // NEW: Scan ALL zones for active playback to determine sample rate
                        // This ensures we detect sample rate even if playing to a "Direct" zone
                        await this._scanForActiveSampleRate();

                        this._notifyStatus();
                    }
                });

                // Periodic debug log
                setInterval(async () => {
                    console.log(`RoonController: Heartbeat - Zones count: ${this.zones.size}`);
                    await this._scanForActiveSampleRate(); // Force periodic scan
                }, 30000);
            },

            core_unpaired: (core) => {
                console.log('Roon Core Unpaired');
                this.core = null;
                this.transport = null;
                this.isPaired = false;
                this.zones.clear();
                this._unsubscribeQueue();
                this._notifyStatus();
            }
        });

        try {
            this.roon.init_services({
                required_services: [RoonApiTransport, RoonApiImage, RoonApiBrowse]
            });
            console.log('RoonController: Services initialized');
        } catch (err) {
            console.error('RoonController: Service init failed:', err);
        }


        console.log('RoonController: Starting discovery in 2s...');
        setTimeout(() => {
            if (this.roon) {
                console.log('RoonController: discovery started now');
                this.roon.start_discovery();

                // Failsafe: Re-check discovery if no zones after 10s
                setTimeout(() => {
                    if (this.zones.size === 0) {
                        console.log('RoonController: No zones found after 10s, retrying discovery...');
                        this.roon.start_discovery();
                    }
                }, 10000);
            }
        }, 2000);
    }



    async control(action, val) {
        if (!this.transport || !this.activeZoneId) return;
        const zone = this.zones.get(this.activeZoneId);
        if (!zone) return;

        console.log(`RoonController: sending control "${action}" val="${val}" to zone "${zone.display_name}"`);

        return new Promise((resolve, reject) => {
            if (action === 'volume') {
                this.transport.change_volume(zone, 'absolute', val, (err) => {
                    if (err) reject(err); else resolve();
                });
            } else if (action === 'mute') {
                this.transport.mute(zone, 'mute', (err) => {
                    if (err) reject(err); else resolve();
                });
            } else if (action === 'unmute') {
                this.transport.mute(zone, 'unmute', (err) => {
                    if (err) reject(err); else resolve();
                });
            } else if (action === 'prev' || action === 'previous') {
                // Robust Previous Logic: Try Previous, if it fails (First Track), Seek to 0.
                const position = zone.seek_position || 0;

                // 1. If deep in track, restart is the standard behavior
                if (position > 5) {
                    console.log(`RoonController: >5s into track (${position}s). Seeking to start.`);
                    this.transport.seek(zone, 'absolute', 0, (err) => {
                        if (err) reject(err); else resolve();
                    });
                    return;
                }

                // 2. Try Previous. If it fails, Fallback to Seek(0)
                this.transport.control(zone, 'previous', (err) => {
                    if (err) {
                        console.log('RoonController: "Previous" command failed (likely start of queue). Fallback to Seek(0).');
                        this.transport.seek(zone, 'absolute', 0, (seekErr) => {
                            if (seekErr) reject(seekErr); else resolve();
                        });
                    } else {
                        resolve();
                    }
                });

            } else {
                this.transport.control(zone, action, (err) => {
                    if (err) reject(err); else resolve();
                });
            }
        });
    }

    getZones() {
        const zoneList = Array.from(this.zones.values()).map(z => ({
            id: z.zone_id,
            name: z.display_name,
            state: z.state,
            active: z.zone_id === this.activeZoneId
        }));
        console.log(`RoonController: getZones called. count=${zoneList.length}, active=${this.activeZoneId}`);
        return zoneList;
    }

    getZone(zoneId) {
        return this.zones.get(zoneId) || null;
    }

    getActiveZone() {
        return this.getZone(this.activeZoneId);
    }

    setActiveZone(zoneId, force = false) {
        if (!force && this.activeZoneId === zoneId && this.isQueueSubscribed) {
            console.log('RoonController: setActiveZone skipped (same zone & subscribed)');
            return;
        }

        const zone = this.zones.get(zoneId);
        if (zone) {
            this.activeZoneName = zone.display_name;
            console.log(`RoonController: Active zone set to ${zone.display_name} (${zoneId})`);
        }

        // Unsubscribe from previous queue
        this._unsubscribeQueue();

        this.activeZoneId = zoneId;

        // Subscribe to new queue
        this._subscribeQueue();

        this._notifyStatus();
    }

    _attemptZoneRecovery() {
        if (!this.activeZoneName) return;

        console.log(`RoonController: Attempting recovery for zone named "${this.activeZoneName}"...`);
        for (const [id, zone] of this.zones.entries()) {
            if (zone.display_name === this.activeZoneName) {
                console.log(`RoonController: Zone recovered! New ID: ${id}`);
                this.activeZoneId = id;
                this._subscribeQueue();
                this._notifyStatus();
                return true;
            }
        }
        return false;
    }

    _subscribeQueue() {
        if (!this.transport || !this.activeZoneId) return;

        // Ensure no existing subscription (safety)
        console.log(`RoonController: _subscribeQueue called. activeZoneId=${this.activeZoneId}, subscribed=${this.isQueueSubscribed}`);
        if (this.isQueueSubscribed) {
            console.log('RoonController: Already subscribed, unsubscribing first...');
            this._unsubscribeQueue();
        }

        const zone = this.zones.get(this.activeZoneId);
        if (!zone) {
            console.log('RoonController: _subscribeQueue failed - Zone not found in map');
            return;
        }

        console.log(`RoonController: Subscribing to queue for zone: ${zone.display_name} (ID: ${zone.zone_id})`);
        // console.log('RoonController: Zone keys:', Object.keys(zone));

        this.isQueueSubscribed = true;

        try {
            this._queueSubscription = this.transport.subscribe_queue(zone, { subscription_key: `${Date.now()} ` }, (status, data) => {
                console.log(`RoonController: Queue Status = ${status} Zone = ${zone.display_name} `);

                if (status === "Subscribed") {
                    console.log(`RoonController: Queue Subscribed.Items: ${data.items ? data.items.length : 0} `);
                    this.queue = data.items || [];
                } else if (status === "Changed") {
                    // 1. Full replacement list
                    if (data.items) {
                        console.log(`RoonController: Queue Full Update.Items: ${data.items.length} `);
                        this.queue = data.items;
                    }
                    // 2. Partial updates (changes array)
                    else if (data.changes) {
                        console.log(`RoonController: Queue Partial Update.${data.changes.length} changes.`);
                        data.changes.forEach(change => {
                            if (change.operation === "insert") {
                                this.queue.splice(change.index, 0, ...change.items);
                            } else if (change.operation === "remove") {
                                this.queue.splice(change.index, change.count);
                            } else if (change.operation === "update") {
                                this.queue.splice(change.index, change.items.length, ...change.items);
                            }
                        });
                        console.log(`RoonController: Queue updated.New size: ${this.queue.length} `);
                    }
                } else if (status === "Unsubscribed") {
                    console.log(`RoonController: Queue Unsubscribed for ${zone.display_name}`);
                    this.isQueueSubscribed = false;
                    this._queueSubscription = null;
                }
            });
        } catch (err) {
            console.error('RoonController: Error subscribing to queue:', err);
        }
    }
    _unsubscribeQueue() {
        if (this._queueSubscription) {
            console.log('RoonController: Destroying queue subscription');
            if (typeof this._queueSubscription.destroy === 'function') {
                this._queueSubscription.destroy();
            }
            this._queueSubscription = null;
        }
        this.isQueueSubscribed = false;
        this.queue = [];
    }

    getQueue() {
        if (!this.activeZoneId || !this.zones.has(this.activeZoneId)) return [];

        const zone = this.zones.get(this.activeZoneId);
        const nowPlaying = zone.now_playing;

        let displayQueue = this.queue;

        // Filter out the currently playing track if it's at the top of the queue
        if (nowPlaying && displayQueue.length > 0) {
            const firstItem = displayQueue[0];
            // Match loosely or by text since IDs might differ or be absent in some views
            if (firstItem.three_line.line1 === nowPlaying.three_line.line1 &&
                firstItem.three_line.line2 === nowPlaying.three_line.line2) {
                displayQueue = displayQueue.slice(1);
            }
        }

        return displayQueue.map((item, index) => {
            return {
                id: item.queue_item_id,
                track: item.three_line.line1,
                artist: item.three_line.line2,
                album: item.three_line.line3,
                artworkUrl: item.image_key ? `/api/image/${item.image_key}` : null
            };
        });
    }

    getNowPlaying() {
        if (!this.activeZoneId || !this.zones.has(this.activeZoneId)) {
            console.log('Roon: No active zone or zone not found. Active ID:', this.activeZoneId);
            return null;
        }
        const z = this.zones.get(this.activeZoneId);
        const track = z.now_playing;

        if (!track) {
            console.log('Roon: No track playing in zone', z.display_name);
            return { state: z.state };
        }

        console.log(`Roon Metadata[${z.display_name}]: ${track.three_line?.line1} - SignalPath: ${track.signal_path ? 'YES' : 'NO'} `);

        // DEBUG: Verbose logging disabled for performance
        // console.log('Roon Track Debug:', JSON.stringify(track, null, 2));
        // if (track.signal_path) {
        //     console.log('Roon SignalPath Details:', JSON.stringify(track.signal_path));
        // }

        return {
            state: z.state,
            track: track.three_line.line1 || 'Unknown Track',
            artist: track.three_line.line2 || 'Unknown Artist',
            album: track.three_line.line3 || '',
            artworkUrl: track.image_key ? `/api/image/${track.image_key}` : null,
            duration: track.length || 0,
            position: track.seek_position || 0,
            volume: z.outputs?.[0]?.volume?.value || 0,
            signalPath: track.signal_path,
            bitDepth: this._extractBitDepth(track.signal_path)
        };
    }

    playQueueItem(queueItemId) {
        if (!this.transport || !this.activeZoneId) {
            console.error('RoonController: playQueueItem failed - No transport or active zone', { transport: !!this.transport, activeZoneId: this.activeZoneId });
            return;
        }
        const zone = this.zones.get(this.activeZoneId);
        if (!zone) {
            console.error('RoonController: playQueueItem failed - Zone not found for ID:', this.activeZoneId);
            return;
        }

        console.log(`RoonController: playQueueItem called with ID = ${queueItemId} (Type: ${typeof queueItemId})`);

        // Ensure ID is passed correctly (some APIs expect int, but usually it's compliant)
        this.transport.play_from_here(zone, queueItemId, (err) => {
            if (err) console.error('RoonController: play_from_here callback ERROR:', err);
            else console.log('RoonController: play_from_here callback SUCCESS');
        });
    }

    getImage(imageKey, res) {
        console.log(`RoonController: getImage request for key: ${imageKey} `);
        if (!this.core) {
            console.warn('RoonController: getImage failed - No core available');
            return res.status(404).json({ error: 'No Roon Core' });
        }

        const imageService = this.core.services.RoonApiImage;
        if (!imageService) {
            console.warn('RoonController: getImage failed - No image service available');
            return res.status(404).json({ error: 'No Image Service' });
        }

        imageService.get_image(imageKey, { format: "image/jpeg", width: 600, height: 600, scale: "fit" }, (err, contentType, data) => {
            if (err) {
                console.error(`RoonController: getImage ERROR for key ${imageKey}: `, err);
                return res.status(404).end();
            }
            console.log(`RoonController: getImage SUCCESS for key ${imageKey}.Content - Type: ${contentType}, Size: ${data.length} bytes`);
            res.set("Content-Type", contentType);
            // Disable caching for images to allow retries with different keys if needed
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
            res.send(data);
        });
    }

    _notifyStatus() {
        if (this.statusCallback) {
            this.statusCallback(this.getNowPlaying());
        }
    }

    // Extract source sample rate from Roon's signal_path
    _extractSampleRate(signalPath) {
        if (!signalPath || !Array.isArray(signalPath)) return null;

        // Look for the source node which has the native file sample rate
        for (const node of signalPath) {
            if (node.type === 'source' && node.quality?.sample_rate) {
                return node.quality.sample_rate;
            }
        }

        // Fallback: check any node with sample_rate
        for (const node of signalPath) {
            if (node.quality?.sample_rate) {
                return node.quality.sample_rate;
            }
        }

        return null;
    }

    // Extract source bit depth from Roon's signal_path
    _extractBitDepth(signalPath) {
        if (!signalPath || !Array.isArray(signalPath)) return null;

        // Look for the source node
        for (const node of signalPath) {
            if (node.type === 'source' && node.quality?.bits_per_sample) {
                return node.quality.bits_per_sample;
            }
        }

        // Fallback: check any node
        for (const node of signalPath) {
            if (node.quality?.bits_per_sample) {
                return node.quality.bits_per_sample;
            }
        }

        return 24;
    }

    // Check if sample rate changed and trigger callback
    async _checkSampleRateChange(zone) {
        const signalPath = zone.now_playing?.signal_path;
        const trackInfo = zone.now_playing?.three_line;

        // Generate a unique key for the current track (title + duration)
        const newTrackKey = trackInfo ? `${trackInfo.line1}| ${zone.now_playing?.length || 0} ` : null;

        // Get current album name
        const newAlbum = trackInfo?.line3 || null;

        let newRate = this._extractSampleRate(signalPath);

        console.log(`RoonController: _checkSampleRateChange - State: ${zone.state}, Track: "${trackInfo?.line1 || 'unknown'}", Album: "${newAlbum || 'unknown'}", Rate: ${newRate || 'unknown'} Hz, LastRate: ${this.currentSampleRate || 'none'} Hz`);

        // 1. Valid Rate Detected (Fast Path)
        if (newRate) {
            // Cancel any pending check since we have a new valid state
            if (this.checkTimeout) {
                clearTimeout(this.checkTimeout);
                this.checkTimeout = null;
            }

            // Check if this is the same track - if so, skip entirely
            if (newTrackKey && newTrackKey === this.currentTrackKey && newRate === this.currentSampleRate) {
                // Same track, same rate - no action needed
                return;
            }

            // Check for album change (different disc) - this requires stream recovery
            const albumChanged = newAlbum && this.currentAlbum && newAlbum !== this.currentAlbum;

            // Update track key and album
            this.currentTrackKey = newTrackKey;
            const previousAlbum = this.currentAlbum;
            this.currentAlbum = newAlbum;

            // Check if sample rate actually changed
            if (newRate !== this.currentSampleRate) {
                console.log(`RoonController: Sample rate CHANGED: ${this.currentSampleRate || 'none'} -> ${newRate} Hz`);
                this.currentSampleRate = newRate;
                if (this.onSampleRateChange) await this.onSampleRateChange(newRate, zone);
            } else if (albumChanged) {
                // Album changed but rate is the same - notify for stream recovery
                console.log(`RoonController: Album CHANGED: "${previousAlbum}" -> "${newAlbum}"(same rate: ${newRate}Hz)`);
                if (this.onAlbumChange) this.onAlbumChange(newAlbum, true);
            } else {
                console.log(`RoonController: New track, same album & rate(${newRate}Hz).No restart needed.`);
            }
            return;
        }

        // 2. Missing Rate (Fallback/Probe Path)
        // Only probe if playing AND this is a new track.
        // Start a debounce timer ONLY if one isn't already running.
        if (zone.state === 'playing') {
            // If we have a known rate and same track, don't probe
            if (this.currentSampleRate && newTrackKey === this.currentTrackKey) {
                console.log('RoonController: SignalPath missing but same track - using cached rate');
                return;
            }

            // Check for album change even without rate info
            const albumChanged = newAlbum && this.currentAlbum && newAlbum !== this.currentAlbum;

            if (!this.checkTimeout) {
                console.log('RoonController: SignalPath missing for new track. Starting probe timer (2500ms)...');
                this.checkTimeout = setTimeout(async () => {
                    console.log('RoonController: SignalPath still missing after delay. Requesting hardware check.');
                    this.checkTimeout = null; // Clear trigger
                    this.currentTrackKey = newTrackKey; // Update track key

                    // If album changed, notify for recovery
                    if (albumChanged) {
                        const previousAlbum = this.currentAlbum;
                        this.currentAlbum = newAlbum;
                        console.log(`RoonController: Album changed during probe: "${previousAlbum}" -> "${newAlbum}"`);
                        if (this.onAlbumChange) this.onAlbumChange(newAlbum, false);
                    } else {
                        this.currentAlbum = newAlbum;
                        if (this.onSampleRateChange) await this.onSampleRateChange('CHECK', zone);
                    }
                }, 1000);
            }
        } else {
            // If paused/stopped, clear any pending check
            if (this.checkTimeout) {
                clearTimeout(this.checkTimeout);
                this.checkTimeout = null;
            }
        }
    }

    // NEW: Scan all zones to find the active sample rate
    // Prioritizes explicitly selected zone, then "Camilla", then any playing zone
    async _scanForActiveSampleRate() {
        let bestCandidate = null;
        console.log('RoonController: Scanning zones for active rate...');

        const activeZone = this.activeZoneId ? this.zones.get(this.activeZoneId) : null;

        // Priority 1: Explicitly selected active zone if playing
        if (activeZone && activeZone.state === 'playing') {
            console.log(`RoonController: Priority 1(Selected) - Using "${activeZone.display_name}"`);
            bestCandidate = activeZone;
        } else {
            // Scan others
            for (const zone of this.zones.values()) {
                if (zone.state === 'playing') {
                    if (zone.display_name === 'Camilla') {
                        // Priority 2: "Camilla" (Virtual Device)
                        console.log(`RoonController: Priority 2(Camilla) - Used "${zone.display_name}"`);
                        bestCandidate = zone;
                        break;
                    } else if (!bestCandidate) {
                        // Priority 3: First other playing zone
                        bestCandidate = zone;
                    }
                }
            }
        }

        if (bestCandidate) {
            console.log(`RoonController: Best candidate for rate: "${bestCandidate.display_name}"`);
            await this._checkSampleRateChange(bestCandidate);
        } else {
            console.log('RoonController: No playing zones found during scan.');
        }
    }

    async probeHistoryAccess() {
        if (!this.browseApi) return;
        console.log('RoonController: Probing History Access (Deep Search)...');

        const loadItems = (opts) => {
            return new Promise((resolve, reject) => {
                this.browseApi.load(opts, (err, payload) => {
                    if (err) return reject(err);
                    resolve(payload);
                });
            });
        };

        const browse = (opts) => {
            return new Promise((resolve, reject) => {
                this.browseApi.browse(opts, (err, payload) => {
                    if (err) return reject(err);
                    resolve(payload);
                });
            });
        };

        const getItems = async (opts) => {
            let payload = await browse(opts);
            let items = payload.items;
            if (payload.action === 'list' && !items) {
                const listPayload = await loadItems({
                    hierarchy: "browse",
                    level: payload.list.level,
                    offset: 0,
                    count: 100
                });
                items = listPayload.items;
            }
            return items || [];
        };

        try {
            // Step 1: Browse Root
            const rootItems = await getItems({ hierarchy: "browse", zone_or_output_id: null });
            console.log('RoonController: Root Items:', rootItems.map(i => i.title).join(', '));

            // Check Root first
            let history = rootItems.find(i => ['History', 'Played', 'Show History', 'Recent'].includes(i.title));
            if (history) {
                console.log(`RoonController: FOUND HISTORY AT ROOT: "${history.title}"(key: ${history.item_key})`);
                return;
            }

            // Step 2: Iterate all root items to depth 1
            for (const item of rootItems) {
                if (['Search', 'Settings', 'Zone'].includes(item.title)) continue; // Skip unlikely

                console.log(`RoonController: Checking inside "${item.title}"...`);
                try {
                    const children = await getItems({ hierarchy: "browse", item_key: item.item_key });
                    console.log(`RoonController: Items in "${item.title}": `, children.map(i => i.title).join(', '));

                    history = children.find(i => ['History', 'Played', 'Show History'].includes(i.title));
                    if (history) {
                        console.log(`RoonController: FOUND HISTORY IN "${item.title}": "${history.title}"(key: ${history.item_key})`);
                        return;
                    }
                } catch (err) {
                    console.log(`RoonController:   Failed to browse "${item.title}": ${err.message} `);
                }
            }

            console.log('RoonController: History probe finished. History item NOT found.');

        } catch (e) {
            console.error('RoonController: Probe Error:', e);
        }
    }
}

module.exports = new RoonController();
