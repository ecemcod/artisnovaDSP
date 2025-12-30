const RoonApi = require("node-roon-api");
const RoonApiTransport = require("node-roon-api-transport");
const RoonApiImage = require("node-roon-api-image");

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
                this.isPaired = true;

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
                                    this.activeZoneId = z.zone_id;
                                }

                                // Check initial sample rate
                                if (z.zone_id === this.activeZoneId) {
                                    this._checkSampleRateChange(z);
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
                                const old = this.zones.get(z.zone_id) || {};
                                this.zones.set(z.zone_id, { ...old, ...z });

                                // Check for sample rate change in active zone
                                if (z.zone_id === this.activeZoneId) {
                                    this._checkSampleRateChange(this.zones.get(z.zone_id));
                                }
                            });
                        }
                        if (data.zones_removed) {
                            data.zones_removed.forEach(zid => {
                                console.log(`RoonController: Zone Removed ${zid}`);
                                this.zones.delete(zid);
                            });
                        }
                        console.log(`RoonController: Current Map size after update: ${this.zones.size}`);
                        this._notifyStatus();
                    }
                });

                // Periodic debug log
                setInterval(() => {
                    console.log(`RoonController: Heartbeat - Zones count: ${this.zones.size}`);
                }, 30000);
            },

            core_unpaired: (core) => {
                console.log('Roon Core Unpaired');
                this.core = null;
                this.transport = null;
                this.isPaired = false;
                this._notifyStatus();
            }
        });

        try {
            this.roon.init_services({
                required_services: [RoonApiTransport, RoonApiImage]
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

    setActiveZone(zoneId) {
        this.activeZoneId = zoneId;
        this._notifyStatus();
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

    async control(action, value) {
        if (!this.transport || !this.activeZoneId) return;

        const zone = this.zones.get(this.activeZoneId);
        if (!zone) return;

        switch (action) {
            case 'playpause': this.transport.control(zone, 'playpause'); break;
            case 'play': this.transport.control(zone, 'play'); break;
            case 'pause': this.transport.control(zone, 'pause'); break;
            case 'next': this.transport.control(zone, 'next'); break;
            case 'prev': this.transport.control(zone, 'previous'); break;
            case 'seek': this.transport.seek(zone, 'absolute', value); break;
            case 'seekToStart': this.transport.seek(zone, 'absolute', 0); break;
            case 'mute':
                if (zone.outputs?.[0]) {
                    this.transport.mute(zone.outputs[0], 'mute');
                }
                break;
            case 'unmute':
                if (zone.outputs?.[0]) {
                    this.transport.mute(zone.outputs[0], 'unmute');
                }
                break;
            case 'volume':
                if (zone.outputs?.[0]) {
                    this.transport.change_volume(zone.outputs[0], 'absolute', value);
                }
                break;
        }
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
                if (this.onSampleRateChange) this.onSampleRateChange(newRate);
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
                        if (this.onSampleRateChange) this.onSampleRateChange('CHECK');
                    }
                }, 2500);
            }
        } else {
            // If paused/stopped, clear any pending check
            if (this.checkTimeout) {
                clearTimeout(this.checkTimeout);
                this.checkTimeout = null;
            }
        }
    }
}

module.exports = new RoonController();
