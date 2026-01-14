const RoonApi = require("node-roon-api");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");
const RoonApiBrowse = require("node-roon-api-browse");

// Node 22 workaround
if (typeof WebSocket === 'undefined') {
    global.WebSocket = require('ws');
    console.log('RoonController: Shared WebSocket sham applied');
} else {
    console.log('RoonController: Native WebSocket detected, overriding with ws for compatibility');
    global.WebSocket = require('ws');
}
console.log('RoonController: WebSocket check:', global.WebSocket ? 'Defined' : 'UNDEFINED');



class RoonController {
    constructor() {
        console.log('RoonController: Instance created');
        this.roon = null;
        this.core = null;
        this.transport = null;
        this.browseApi = null;
        this.activeZoneId = null;
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

                this.transport.subscribe_zones((status, data) => {
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

                                // If we have a restored activeZoneId, trigger queue subscription when it's found
                                if (this.activeZoneId === z.zone_id && !this._queueSubscription) {
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
                                if (this.activeZoneId === zid) {
                                    this.activeZoneId = null;
                                    this._unsubscribeQueue();
                                }
                            });
                        }
                        console.log(`RoonController: Current Map size after update: ${this.zones.size}`);

                        // NEW: Scan ALL zones for active playback to determine sample rate
                        // This ensures we detect sample rate even if playing to a "Direct" zone
                        this._scanForActiveSampleRate();

                        this._notifyStatus();
                    }
                });

                // Periodic debug log
                setInterval(() => {
                    console.log(`RoonController: Heartbeat - Zones count: ${this.zones.size}`);
                    this._scanForActiveSampleRate(); // Force periodic scan
                }, 30000);
            },

            core_unpaired: (core) => {
                console.log('Roon Core Unpaired');
                this.core = null;
                this.transport = null;
                this.browseApi = null;
                this.isPaired = false;
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
                this.transport.mute(zone, 'toggle', (err) => {
                    if (err) reject(err); else resolve();
                });
            } else if (action === 'unmute') {
                this.transport.mute(zone, 'unmute', (err) => {
                    if (err) reject(err); else resolve();
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

    setActiveZone(zoneId) {
        if (this.activeZoneId === zoneId) return;

        // Unsubscribe from previous queue
        this._unsubscribeQueue();

        this.activeZoneId = zoneId;
        console.log(`RoonController: Active zone set to ${zoneId}`);

        // Subscribe to new queue
        this._subscribeQueue();

        this._notifyStatus();
    }

    _subscribeQueue() {
        if (!this.transport || !this.activeZoneId) return;

        // Ensure no existing subscription (safety)
        this._unsubscribeQueue();

        const zone = this.zones.get(this.activeZoneId);
        if (!zone) return;

        console.log(`RoonController: Subscribing to queue for zone: ${zone.display_name}`);

        this._queueSubscription = this.transport.subscribe_queue(zone, { subscription_key: Date.now() }, (status, data) => {
            console.log(`RoonController: Queue Status=${status} Zone=${zone.display_name}`);
            if (status === "Subscribed") {
                console.log(`RoonController: Queue Subscribed. Items: ${data.items ? data.items.length : 0}`);
                this.queue = data.items || [];
            } else if (status === "Changed") {
                // If we get a full replacement list, use it
                if (data.items) {
                    console.log(`RoonController: Queue Full Update. Items: ${data.items.length}`);
                    this.queue = data.items;
                }
                // Handle partial updates by forcing a refresh (simplest robust strategy)
                else {
                    console.log('RoonController: Partial queue update detected. Re-subscribing to force full sync...');
                    // Use setTimeout to decouple from current event loop stack
                    setTimeout(() => {
                        this._subscribeQueue();
                    }, 50);
                }
            }
        });
    }

    _unsubscribeQueue() {
        if (this._queueSubscription) {
            if (typeof this._queueSubscription.destroy === 'function') {
                this._queueSubscription.destroy();
            }
            this._queueSubscription = null;
        }
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
                artworkUrl: item.image_key ? `/api/media/roon/image/${item.image_key}` : null
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

        console.log(`Roon Metadata [${z.display_name}]: ${track.three_line?.line1} - SignalPath: ${track.signal_path ? 'YES' : 'NO'}`);

        // DEBUG: Dump track to find source sample rate
        console.log('Roon Track Debug:', JSON.stringify(track, null, 2));

        if (track.signal_path) {
            console.log('Roon SignalPath Details:', JSON.stringify(track.signal_path));
        }

        return {
            state: z.state,
            track: track.three_line.line1 || 'Unknown Track',
            artist: track.three_line.line2 || 'Unknown Artist',
            album: track.three_line.line3 || '',
            artworkUrl: track.image_key ? `/api/media/roon/image/${track.image_key}` : null,
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

        console.log(`RoonController: playQueueItem called with ID=${queueItemId} (Type: ${typeof queueItemId})`);

        // Ensure ID is passed correctly (some APIs expect int, but usually it's compliant)
        this.transport.play_from_here(zone, queueItemId, (err) => {
            if (err) console.error('RoonController: play_from_here callback ERROR:', err);
            else console.log('RoonController: play_from_here callback SUCCESS');
        });
    }

    getImage(imageKey, res) {
        console.log('Roon getImage called for:', imageKey);
        if (!this.core) {
            console.log('Roon getImage: No core available');
            return res.status(404).end();
        }

        const imageService = this.core.services.RoonApiImage;
        if (!imageService) {
            console.log('Roon getImage: No image service available');
            return res.status(404).end();
        }

        imageService.get_image(imageKey, { format: "image/jpeg", width: 600, height: 600, scale: "fit" }, (err, contentType, data) => {
            console.log('Roon image callback:', err ? 'ERROR' : 'OK', contentType);
            if (err) {
                console.error('Roon image error:', err);
                return res.status(404).end();
            }
            res.set("Content-Type", contentType);
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

        return null;
    }

    // Check if sample rate changed and trigger callback
    _checkSampleRateChange(zone) {
        const signalPath = zone.now_playing?.signal_path;
        const trackInfo = zone.now_playing?.three_line;

        // Generate a unique key for the current track (title + duration)
        const newTrackKey = trackInfo ? `${trackInfo.line1}|${zone.now_playing?.length || 0}` : null;

        // Get current album name
        const newAlbum = trackInfo?.line3 || null;

        let newRate = this._extractSampleRate(signalPath);

        console.log(`RoonController: _checkSampleRateChange - State: ${zone.state}, Track: "${trackInfo?.line1 || 'unknown'}", Album: "${newAlbum || 'unknown'}", Rate: ${newRate || 'unknown'}Hz, LastRate: ${this.currentSampleRate || 'none'}Hz`);

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
                console.log(`RoonController: Sample rate CHANGED: ${this.currentSampleRate || 'none'} -> ${newRate}Hz`);
                this.currentSampleRate = newRate;
                if (this.onSampleRateChange) this.onSampleRateChange(newRate, zone);
            } else if (albumChanged) {
                // Album changed but rate is the same - notify for stream recovery
                console.log(`RoonController: Album CHANGED: "${previousAlbum}" -> "${newAlbum}" (same rate: ${newRate}Hz)`);
                if (this.onAlbumChange) this.onAlbumChange(newAlbum, true);
            } else {
                console.log(`RoonController: New track, same album & rate (${newRate}Hz). No restart needed.`);
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
                this.checkTimeout = setTimeout(() => {
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
                        if (this.onSampleRateChange) this.onSampleRateChange('CHECK', zone);
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
    // Prioritizes "Camilla" zone if playing, otherwise takes any playing zone
    _scanForActiveSampleRate() {
        let bestCandidate = null;
        console.log('RoonController: Scanning zones for active rate...');

        for (const zone of this.zones.values()) {
            if (zone.state === 'playing') {
                console.log(`RoonController: Found playing zone: "${zone.display_name}"`);
                // DEBUG: Log the FULL zone data to find signal_path
                try {
                    // Avoid circular references if any (though Roon zones are usually plain objects)
                    console.log(`RoonController: FULL ZONE [${zone.display_name}]:`, JSON.stringify(zone, null, 2));
                } catch (e) {
                    console.log('Error logging full zone data', e.message);
                    // Fallback: log keys
                    console.log('Zone Keys:', Object.keys(zone));
                }

                if (zone.display_name === 'Camilla') {
                    // Critical priority
                    bestCandidate = zone;
                    break;
                } else if (!bestCandidate) {
                    // Fallback
                    bestCandidate = zone;
                }
            }
        }

        if (bestCandidate) {
            console.log(`RoonController: Best candidate for rate: "${bestCandidate.display_name}"`);
            this._checkSampleRateChange(bestCandidate);
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
                console.log(`RoonController: FOUND HISTORY AT ROOT: "${history.title}" (key: ${history.item_key})`);
                return;
            }

            // Step 2: Iterate all root items to depth 1
            for (const item of rootItems) {
                if (['Search', 'Settings', 'Zone'].includes(item.title)) continue; // Skip unlikely

                console.log(`RoonController: Checking inside "${item.title}"...`);
                try {
                    const children = await getItems({ hierarchy: "browse", item_key: item.item_key });
                    console.log(`RoonController:   Items in "${item.title}":`, children.map(i => i.title).join(', '));

                    history = children.find(i => ['History', 'Played', 'Show History'].includes(i.title));
                    if (history) {
                        console.log(`RoonController: FOUND HISTORY IN "${item.title}": "${history.title}" (key: ${history.item_key})`);
                        return;
                    }
                } catch (err) {
                    console.log(`RoonController:   Failed to browse "${item.title}": ${err.message}`);
                }
            }

            console.log('RoonController: History probe finished. History item NOT found.');

        } catch (e) {
            console.error('RoonController: Probe Error:', e);
        }
    }
}

module.exports = new RoonController();
