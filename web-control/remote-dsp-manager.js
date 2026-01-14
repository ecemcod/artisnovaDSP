/**
 * Remote DSP Manager for Raspberry Pi
 * Communicates with CamillaDSP running on Raspberry Pi via WebSocket
 */
const WebSocket = require('ws');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');

class RemoteDSPManager {
    constructor(options = {}) {
        this.host = options.host || 'raspberrypi.local';
        this.port = options.port || 1234;
        this.user = options.user || 'manuelcouceiro';
        this.password = options.password || 'Lo0125ks';
        this.wsUrl = `ws://${this.host}:${this.port}`;
        this.ws = null;
        this.connected = false;
        this.reconnectTimer = null;
        this.pendingRequests = new Map();
        this.requestId = 0;
        this.shouldBeRunning = false;  // Track if DSP should be running (for parity with local DSPManager)
        this.lastFilterData = null;
        this.lastOptions = null;

        this.currentState = {
            running: false,
            sampleRate: 0,
            bypass: false,
            bitDepth: 24,
            presetName: null,
            filtersCount: 0,
            preamp: 0,
            device: 'D50 III (via Loopback)'
        };

        // Health state for watchdog parity
        this.healthState = {
            startTime: null,
            lastCheck: null,
            reconnectCount: 0,
            lastError: null,
            signalPresent: false,
            signalLevels: { left: -1000, right: -1000 }
        };

        console.log(`RemoteDSPManager initialized for ${this.wsUrl}`);
    }

    async connect() {
        return new Promise((resolve, reject) => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                resolve(true);
                return;
            }

            try {
                this.ws = new WebSocket(this.wsUrl);
                const timeout = setTimeout(() => {
                    if (this.ws) this.ws.close();
                    reject(new Error('Connection timeout'));
                }, 5000);

                this.ws.onopen = () => {
                    clearTimeout(timeout);
                    this.connected = true;
                    this.healthState.startTime = Date.now();
                    this.healthState.lastError = null;
                    console.log(`RemoteDSP: Connected to ${this.wsUrl}`);
                    resolve(true);
                };

                this.ws.onclose = () => {
                    this.connected = false;
                    console.log('RemoteDSP: Connection closed');
                };

                this.ws.onerror = (err) => {
                    clearTimeout(timeout);
                    this.connected = false;
                    console.error('RemoteDSP: Connection error:', err.message);
                    reject(err);
                };

                this.ws.onmessage = (event) => {
                    this._handleMessage(event.data);
                };

                // Start polling state
                this.startPolling();

            } catch (err) {
                reject(err);
            }
        });
    }

    _handleMessage(data) {
        try {
            console.log(`RemoteDSP: <- Recv: ${data.substring(0, 150)}${data.length > 150 ? '...' : ''}`);
            const msg = JSON.parse(data);

            // CamillaDSP responses have the command name as the top-level key
            // e.g. {"GetState": {"result": "Ok", "value": "Running"}}
            const commandKeys = Object.keys(msg);
            if (commandKeys.length > 0) {
                const command = commandKeys[0];
                const response = msg[command];

                // Find all pending requests for this command
                for (const [id, req] of this.pendingRequests.entries()) {
                    if (req.command === command) {
                        this.pendingRequests.delete(id);
                        if (response.result === 'Ok') {
                            req.resolve(response.value !== undefined ? response.value : response);
                        } else {
                            req.reject(new Error(response.result || 'Command failed'));
                        }
                        return;
                    }
                }
            }
        } catch (e) {
            // Ignore parsing errors for non-JSON messages
        }
    }

    async _sendCommand(command, params = null) {
        if (!this.connected) {
            await this.connect();
        }

        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const commandName = typeof command === 'string' ? command : Object.keys(command)[0];
            const request = params ? { [command]: params } : (typeof command === 'string' ? `"${command}"` : command);

            this.pendingRequests.set(id, { resolve, reject, command: commandName });

            // Timeout for request
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 5000);

            try {
                const requestStr = typeof request === 'string' ? request : JSON.stringify(request);
                this.ws.send(requestStr);
                console.log(`RemoteDSP: -> Sent: ${requestStr.substring(0, 150)}${requestStr.length > 150 ? '...' : ''}`);
            } catch (err) {
                this.pendingRequests.delete(id);
                reject(err);
            }
        });
    }

    setOptions(options) {
        if (options.user) {
            this.user = options.user;
        }
        if (options.password) {
            this.password = options.password;
        }
        if (options.port) {
            this.port = options.port;
        }
        const newUrl = `ws://${this.host}:${this.port}`;
        if (newUrl !== this.wsUrl) {
            console.log(`RemoteDSP: Updating host to ${newUrl}`);
            this.wsUrl = newUrl;
            this.disconnect(); // Force reconnect with new URL on next command
        }
    }


    startPolling() {
        if (this.pollInterval) clearInterval(this.pollInterval);
        this.pollInterval = setInterval(() => this.refreshState(), 2000);
    }

    async refreshState() {
        if (!this.connected) return;
        try {
            // 1. Get State
            try {
                const state = await this._sendCommand('GetState');
                this.currentState.running = (state === 'Running');
            } catch (e) {
                this.currentState.running = false;
            }

            // 2. Get Config (for pipeline info)
            // We only do this if running to save bandwidth, or if we suspect change
            if (this.currentState.running) {
                try {
                    const config = await this._sendCommand('GetConfigJson');
                    const configObj = JSON.parse(config);
                    if (configObj.devices) {
                        this.currentState.sampleRate = configObj.devices.samplerate;
                    }
                    if (configObj.pipeline) {
                        this.currentState.filtersCount = configObj.pipeline.length;
                    }
                } catch (e) { }
            }
        } catch (err) {
            // Ignore polling errors
        }
    }

    async getStatus() {
        try {
            // Only try to connect if it should be running or we're explicitly checking
            if (this.shouldBeRunning && !this.connected) {
                // Try to connect but don't wait too long
                this.connect().catch(() => { });
            }

            // Send GetState to check if running (fire and forget)
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('"GetState"');
            }

            return {
                running: this.isRunning(),
                sampleRate: this.currentState.sampleRate || 0,
                bypass: this.currentState.bypass || false,
                remote: true,
                connected: this.connected,
                host: this.host
            };
        } catch (err) {
            console.error('RemoteDSP: getStatus failed:', err.message);
            return {
                running: this.shouldBeRunning, // Return intent if error
                sampleRate: 0,
                bypass: false,
                remote: true,
                connected: false,
                error: err.message
            };
        }
    }

    isRunning() {
        // If it's connected, we trust the state. 
        // If not connected but it SHOULD be running, we return true to avoid UI flicker
        return this.connected || this.shouldBeRunning;
    }

    async checkConnection() {
        try {
            await this.connect();
            return true;
        } catch {
            return false;
        }
    }

    // Send a reload command to CamillaDSP to apply new config
    async reload() {
        try {
            // CamillaDSP 3.0+ uses "Reload" command to apply the next config
            return await this._sendCommand('Reload');
        } catch (err) {
            console.error('RemoteDSP: Reload failed:', err.message);
            return false;
        }
    }

    // Get capture signal peak for VU meters
    async getCapturePeak() {
        try {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('"GetCaptureSignalPeak"');
            }
        } catch (err) {
            // Ignore errors for peak requests
        }
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.connected = false;
    }

    /**
     * Generate CamillaDSP JSON configuration for Raspberry Pi
     */
    generateConfigJson(filterData, options = {}) {
        const sampleRate = options.sampleRate || 96000;

        const config = {
            devices: {
                samplerate: sampleRate,
                chunksize: 4096,
                capture: {
                    type: "Alsa",
                    channels: 2,
                    device: "hw:Loopback,1",
                    format: "S32LE"
                },
                playback: {
                    type: "Alsa",
                    channels: 2,
                    device: "hw:III",
                    format: "S32LE"
                }
            },
            filters: {},
            pipeline: []
        };

        const pipelineNames = [];

        // Add Preamp
        if (filterData.preamp !== 0) {
            config.filters['preamp'] = {
                type: 'Gain',
                parameters: { gain: filterData.preamp }
            };
            pipelineNames.push('preamp');
        }

        // Add Filters
        if (filterData.filters && Array.isArray(filterData.filters)) {
            filterData.filters.forEach((f, i) => {
                const name = `filter${i + 1}`;
                config.filters[name] = {
                    type: 'Biquad',
                    parameters: {
                        type: f.type,
                        freq: f.freq,
                        gain: f.gain,
                        q: f.q
                    }
                };
                pipelineNames.push(name);
            });
        }

        // Pipeline
        config.pipeline = [{
            type: 'Filter',
            channels: [0, 1],
            names: pipelineNames
        }];

        return yaml.dump(config);
    }

    /**
     * Push configuration directly to CamillaDSP via WebSocket
     */
    async syncConfigSsh(configJson) {
        return new Promise((resolve, reject) => {
            if (!this.user || !this.password) {
                console.warn('RemoteDSP: SSH credentials missing, skipping sync to disk');
                resolve(false);
                return;
            }

            // Path to our python helper - hardcoded to be safe
            const helperPath = '/Users/manuelcouceiro/Audio Calibration/camilla/ssh_client.py';

            console.log(`RemoteDSP [v6]: Starting SSH Sync.`);
            console.log(`RemoteDSP [v6]: Helper Path: ${helperPath}`);
            console.log(`RemoteDSP [v6]: Helper Exists: ${fs.existsSync(helperPath)}`);
            console.log(`RemoteDSP [v6]: Credentials: User=${this.user}, Host=${this.host}, PwdLen=${this.password ? this.password.length : 0}`);

            // Remote path for config
            const remotePath = '/home/manuelcouceiro/camilladsp/active_config.yml';

            // Debug: write locally to see what we are sending
            try {
                fs.writeFileSync(path.join(__dirname, 'last_config_sent.json'), configJson);
                console.log(`RemoteDSP [v6]: Wrote last_config_sent.json`);
            } catch (e) {
                console.error(`RemoteDSP [v6]: Failed to write local debug file: ${e.message}`);
            }

            // Generate command: write config to file using remote python to decode base64
            // This is more robust than echo/redirection
            const base64Config = Buffer.from(configJson).toString('base64');
            const pythonCmd = `import base64; open('${remotePath}', 'wb').write(base64.b64decode('${base64Config}'))`;
            const cmd = `python3 "${helperPath}" ${this.user} ${this.host} ${this.password} "python3 -c \\"${pythonCmd}\\""`;

            console.log(`RemoteDSP [v4]: Syncing config to ${this.host} via SSH (python binary write, b64 length: ${base64Config.length})...`);
            exec(cmd, (error, stdout, stderr) => {
                if (error) {
                    console.error('RemoteDSP [v4]: SSH sync failed:', error.message);
                    console.error('RemoteDSP [v4]: SSH stderr:', stderr);
                    reject(new Error(`SSH sync failed: ${error.message}`));
                } else {
                    console.log('RemoteDSP [v4]: SSH sync successful');
                    resolve(true);
                }
            });
        });
    }

    async pushConfig(configJson) {
        try {
            // 1. Sync to disk FIRST (critical: if service is crashing, we must fix the file first)
            await this.syncConfigSsh(configJson);

            // 2. Connect (might fail if service is restarting, but file is fixed now)
            try {
                await this.connect();
            } catch (e) {
                console.warn('RemoteDSP: Could not connect immediately after sync (service restarting?). Skipping WS push.');
                return; // Service should auto-restart with new config
            }

            // 3. Send via WebSocket if connected
            console.log('RemoteDSP: Pushing next configuration via WebSocket...');
            await this._sendCommand('SetConfigJson', configJson);

            // 4. Reload to apply
            console.log('RemoteDSP: Reloading to apply configuration...');
            const result = await this.reload();
            return result;
            console.log('RemoteDSP: Configuration applied successfully');
            return result;
        } catch (err) {
            console.error('RemoteDSP: pushConfig failed:', err.message);
            throw err;
        }
    }

    // ========== PARITY METHODS WITH LOCAL DSPManager ==========

    /**
     * Start CamillaDSP on Raspberry Pi
     * Note: CamillaDSP on RPi is expected to already be running as a service.
     * This method just ensures connection and updates state.
     */
    async start(filterData, options = {}) {
        try {
            this.shouldBeRunning = true;
            this.lastFilterData = filterData;
            this.lastOptions = options;
            this.currentState.sampleRate = options.sampleRate || 44100;
            this.currentState.bitDepth = options.bitDepth || 24;
            this.currentState.presetName = options.presetName || null;
            this.currentState.filtersCount = filterData.filters?.length || 0;
            this.currentState.preamp = filterData.preamp || 0;
            this.currentState.bypass = false;
            this.currentState.running = true;

            // Connect is handled inside pushConfig now (after SSH sync)
            // await this.connect();

            // Generate and push config directly to WebSocket
            const configJson = this.generateConfigJson(filterData, options);
            await this.pushConfig(configJson);

            console.log(`RemoteDSP: Configuration pushed and applied at ${this.currentState.sampleRate}Hz`);
            return true;
        } catch (err) {
            console.error('RemoteDSP: start() failed:', err.message);
            throw err;
        }
    }

    /**
     * Stop tracking DSP on Raspberry Pi
     * Note: We don't actually stop CamillaDSP service, just disconnect
     */
    async stop() {
        console.log('RemoteDSP: stop() called');
        this.shouldBeRunning = false;
        this.currentState.running = false;
        try {
            // CamillaDSP 3.0+ uses "Stop" command
            return await this._sendCommand('Stop');
        } catch (err) {
            console.error('RemoteDSP: Stop failed:', err.message);
            return false;
        }
    }

    /**
     * Start in bypass mode (no processing)
     * Note: This would require sending a bypass config to CamillaDSP
     */
    async startBypass(sampleRate) {
        try {
            console.log(`RemoteDSP: startBypass() called at ${sampleRate}Hz`);
            // await this.connect();

            this.shouldBeRunning = true;
            this.currentState.sampleRate = sampleRate;
            this.currentState.bypass = true;
            this.currentState.running = true;

            // Generate a simple bypass config
            const bypassFilterData = { preamp: 0, filters: [] };
            const configJson = this.generateConfigJson(bypassFilterData, { sampleRate });
            await this.pushConfig(configJson);

            console.log(`RemoteDSP: Bypass configuration pushed and active at ${sampleRate}Hz`);
            return true;
        } catch (err) {
            console.error('RemoteDSP: startBypass() failed:', err.message);
            throw err;
        }
    }

    /**
     * Ensure DSP is running (auto-start if needed)
     */
    async ensureRunning() {
        if (!this.connected) {
            try {
                await this.connect();
                console.log('RemoteDSP: ensureRunning() - Connection established');
            } catch (err) {
                console.error('RemoteDSP: ensureRunning() - Failed to connect:', err.message);
            }
        }
        return this.connected;
    }

    /**
     * Restart DSP with new sample rate
     */
    async restartWithSampleRate(sampleRate) {
        console.log(`RemoteDSP: restartWithSampleRate(${sampleRate}Hz)`);
        this.currentState.sampleRate = sampleRate;

        if (this.lastFilterData) {
            const configJson = this.generateConfigJson(this.lastFilterData, { ...this.lastOptions, sampleRate });
            return this.pushConfig(configJson);
        }

        // If bypass was active
        if (this.currentState.bypass) {
            return this.startBypass(sampleRate);
        }

        return true;
    }

    /**
     * Get health report for API consistency with local DSPManager
     */
    getHealthReport() {
        this.healthState.lastCheck = Date.now();

        return {
            dsp: {
                running: this.isRunning(),
                uptime: this.healthState.startTime ? Math.floor((Date.now() - this.healthState.startTime) / 1000) : 0,
                restartCount: this.healthState.reconnectCount,
                bypass: this.currentState.bypass
            },
            devices: {
                capture: {
                    name: 'Loopback (ALSA)',
                    status: this.connected ? 'ok' : 'unknown'
                },
                playback: {
                    name: this.currentState.device || 'D50 III',
                    status: this.connected ? 'ok' : 'unknown'
                }
            },
            signal: {
                present: this.healthState.signalPresent,
                levels: this.healthState.signalLevels,
                silenceDuration: 0
            },
            remote: true,
            host: this.host,
            connected: this.connected,
            lastError: this.healthState.lastError,
            lastCheck: this.healthState.lastCheck
        };
    }
    async setMute(muted) {
        console.log(`RemoteDSP: Setting mute to ${muted}`);
        this.currentState.mute = muted;
        try {
            await this._sendCommand('SetMute', muted);
            console.log('RemoteDSP: Mute command sent successfully');
        } catch (e) {
            console.error('RemoteDSP: Failed to send mute command', e);
        }
    }
}

module.exports = RemoteDSPManager;
