const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class DSPManager {
    constructor(baseDir) {
        this.process = null;
        this.isLinux = process.platform === 'linux';
        this.baseDir = baseDir; // camilla dir
        this.presetsDir = path.join(baseDir, 'presets');
        this.dspPath = this.isLinux ? 'camilladsp' : path.join(baseDir, 'camilladsp');
        this.bypassConfigPath = path.join(baseDir, 'config-bypass.yml');
        this.stateFilePath = path.join(baseDir, 'state.json');

        this.currentState = {
            running: false,
            bypass: false,
            sampleRate: 0,
            bitDepth: 0,
            presetName: null,
            filtersCount: 0,
            preamp: 0,
            device: null
        };

        // Watchdog health state
        this.healthState = {
            lastCheck: null,
            deviceStatus: 'unknown', // 'ok', 'missing', 'switched'
            captureDevice: 'BlackHole 2ch',
            playbackDevice: null,
            signalPresent: false,
            signalLevels: { left: -1000, right: -1000 },
            restartCount: 0,
            lastError: null,
            startTime: null,
            silenceDuration: 0 // seconds of silence
        };

        // Load persisted state to determine intent
        this.persistedState = this.loadState();
        this.shouldBeRunning = this.persistedState.running;

        // Sync vital state from persistence
        if (this.persistedState.presetName) this.currentState.presetName = this.persistedState.presetName;
        if (this.persistedState.bypass) this.currentState.bypass = this.persistedState.bypass;
        if (this.persistedState.sampleRate) this.currentState.sampleRate = this.persistedState.sampleRate;

        console.log('DSPManager initialized. Persisted Intent:', this.shouldBeRunning ? (this.persistedState.bypass ? 'Bypass' : 'Running') : 'Stopped');
    }

    loadState() {
        try {
            if (fs.existsSync(this.stateFilePath)) {
                return JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
            }
        } catch (e) {
            console.error('Failed to load state.json:', e);
        }
        return { running: true, bypass: false }; // Default intent is running (appliance mode)
    }

    saveState(updates = {}) {
        try {
            this.persistedState = { ...this.persistedState, ...updates };
            fs.writeFileSync(this.stateFilePath, JSON.stringify(this.persistedState, null, 2));
        } catch (e) {
            console.error('Failed to save state.json:', e);
        }
    }
    isRunning() {
        return this.process !== null && !this.process.killed;
    }

    getAvailableDevices() {
        if (this.isLinux) {
            try {
                const output = execSync('aplay -l', { encoding: 'utf8' });
                const devices = [];
                const lines = output.split('\n');
                lines.forEach(line => {
                    const match = line.match(/card \d+: (.+) \[.+\]/);
                    if (match) {
                        devices.push(match[1].trim());
                    }
                });
                return devices;
            } catch (e) {
                console.error('Failed to get available devices (Linux):', e.message);
                return ['III']; // Fallback for D50 III
            }
        }
        try {
            const output = execSync('system_profiler SPAudioDataType', { encoding: 'utf8' });
            const devices = [];
            const lines = output.split('\n');

            // Devices are usually indented by 8 spaces in the standard output
            // Example:
            //         BlackHole 2ch:
            //           Manufacturer: Existential Audio Inc.
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Match lines that look like "        Device Name:"
                const match = line.match(/^ {8}(.+):$/);
                if (match) {
                    const devName = match[1].trim();
                    if (devName !== 'Devices') {
                        devices.push(devName);
                    }
                }
            }
            return devices;
        } catch (e) {
            console.error('Failed to get available devices:', e.message);
            return [];
        }
    }

    findBestOutputDevice() {
        const devices = this.getAvailableDevices();
        console.log('Available output devices:', devices.join(', '));

        const priorities = ['D50 III', 'III', 'UMC204HD 192k', 'USB Audio', 'KT_USB_AUDIO', 'BlackHole 2ch', 'Mac mini Speakers'];
        for (const target of priorities) {
            if (devices.includes(target) || (this.isLinux && devices.some(d => d.includes(target)))) {
                // On Linux, return the card name or ID if it matches
                const found = this.isLinux ? devices.find(d => d.includes(target)) : target;
                return found;
            }
        }
        return devices.length > 0 ? devices[0] : (this.isLinux ? 'III' : 'D50 III');
    }

    generateConfig(filterData, options = {}) {
        const sampleRate = options.sampleRate || 96000;
        // bitDepth is now informational only - CoreAudio auto-selects format

        const config = {
            devices: {
                samplerate: sampleRate,
                chunksize: 4096,
                capture: this.isLinux ? {
                    type: 'Alsa',
                    device: 'hw:Loopback,1',
                    channels: 2,
                    format: 'S32LE'
                } : {
                    type: 'CoreAudio',
                    device: 'BlackHole 2ch',
                    channels: 2
                },
                playback: this.isLinux ? {
                    type: 'Alsa',
                    device: `hw:${this.findBestOutputDevice()}`,
                    channels: 2,
                    format: 'S32LE'
                } : {
                    type: 'CoreAudio',
                    device: this.findBestOutputDevice(),
                    channels: 2
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

        // Pipeline
        // Apply to both channels [0, 1]? 
        // Prev server used: channels: [0, 1], names: [...]
        config.pipeline = [{
            type: 'Filter',
            channels: [0, 1],
            names: pipelineNames
        }];

        return yaml.dump(config);
    }

    async start(filterData, options = {}) {
        // ALWAYS stop and wait before starting to ensure audio devices are released
        await this.stop();

        // Store filter data for potential sample rate restarts
        this.lastFilterData = filterData;
        this.lastOptions = { ...options };
        this.shouldBeRunning = true; // Mark as intended to be running

        return new Promise((resolve, reject) => {
            try {
                const configYaml = this.generateConfig(filterData, options);
                const configPath = path.join(this.baseDir, 'temp_config.yml');
                fs.writeFileSync(configPath, configYaml);

                console.log('Starting CamillaDSP with config:', configPath);

                const dspArgs = ['-a', '0.0.0.0', '-p', '5005', configPath];
                console.log('Spawning:', this.dspPath, dspArgs.join(' '));

                // Spawn with websocket enabled on port 5005 for level data
                this.process = spawn(this.dspPath, dspArgs, {
                    cwd: this.baseDir
                });

                this.currentState = {
                    running: true,
                    bypass: false,
                    sampleRate: options.sampleRate,
                    bitDepth: options.bitDepth,
                    presetName: options.presetName || 'Manual',
                    filtersCount: filterData.filters?.length || 0,
                    preamp: filterData.preamp || 0,
                    device: options.device || (this.isLinux ? 'D50 III' : this.findBestOutputDevice())
                };

                this.process.stdout.on('data', (data) => console.log(`DSP out: ${data}`));
                this.process.stderr.on('data', (data) => console.error(`DSP err: ${data}`));

                this.process.on('close', (code) => {
                    console.log(`DSP exited with code ${code}`);
                    this.process = null;
                });

                this.process.on('error', (err) => {
                    console.error('Failed to start DSP:', err);
                    reject(err);
                });

                // Start Watchdog to ensure persistence
                this.startWatchdog();

                this.saveState({ running: true, bypass: false, presetName: options.presetName });

                // Give it a moment to verify it hasn't crashed immediately
                setTimeout(() => {
                    if (this.isRunning()) resolve(true);
                    else reject(new Error('Process exited immediately'));
                }, 1000);

            } catch (err) {
                reject(err);
            }
        });
    }

    startWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        if (this.signalCheckInterval) clearInterval(this.signalCheckInterval);
        if (this.deviceCheckInterval) clearInterval(this.deviceCheckInterval);

        console.log('Starting Enhanced DSP Watchdog...');
        this.healthState.startTime = Date.now();
        this.healthState.restartCount = 0;

        // Process health check - every 5 seconds
        this.watchdogInterval = setInterval(() => {
            this.healthState.lastCheck = Date.now();

            if (this.shouldBeRunning && !this.isRunning()) {
                // Circuit breaker: max 5 restarts in 5 minutes
                if (this.healthState.restartCount >= 5) {
                    console.log('Watchdog: Circuit breaker triggered - too many restarts. Manual intervention required.');
                    this.healthState.lastError = 'Circuit breaker: too many restart attempts';
                    return;
                }

                console.log('Watchdog: DSP process died unexpectedly. Attempting restart...');
                this.healthState.restartCount++;

                if (this.lastFilterData) {
                    this.start(this.lastFilterData, this.lastOptions)
                        .then(() => {
                            console.log('Watchdog: Restart successful');
                            this.healthState.lastError = null;
                        })
                        .catch(e => {
                            this.healthState.lastError = e.message;
                            if (e.message.includes('Could not find playback device')) {
                                console.log('Watchdog: Device missing, checking for fallback...');
                                this.handleDeviceFallback();
                            } else {
                                console.error('Watchdog: Restart failed', e);
                            }
                        });
                } else {
                    console.log('Watchdog: Must restart but no last config found.');
                    this.healthState.lastError = 'No configuration available for restart';
                }
            }
        }, 5000);

        // Device health check - every 10 seconds
        this.deviceCheckInterval = setInterval(() => {
            this.checkDeviceHealth();
        }, 10000);

        // Signal presence check - every 2 seconds
        this.signalCheckInterval = setInterval(() => {
            this.checkSignalPresence();
        }, 2000);

        // Initial checks
        this.checkDeviceHealth();
    }

    stopWatchdog() {
        if (this.watchdogInterval) {
            clearInterval(this.watchdogInterval);
            this.watchdogInterval = null;
        }
        if (this.signalCheckInterval) {
            clearInterval(this.signalCheckInterval);
            this.signalCheckInterval = null;
        }
        if (this.deviceCheckInterval) {
            clearInterval(this.deviceCheckInterval);
            this.deviceCheckInterval = null;
        }
    }

    checkDeviceHealth() {
        const devices = this.getAvailableDevices();
        const currentPlayback = this.currentState.device || this.healthState.playbackDevice;

        // Check if capture device exists
        const captureOk = devices.includes(this.healthState.captureDevice) || this.isLinux;

        // Check if playback device exists
        const playbackOk = currentPlayback && devices.includes(currentPlayback);

        if (!captureOk) {
            this.healthState.deviceStatus = 'missing';
            this.healthState.lastError = `Capture device "${this.healthState.captureDevice}" not found`;
            console.log('Watchdog: Capture device missing!');
        } else if (!playbackOk && currentPlayback) {
            this.healthState.deviceStatus = 'missing';
            this.healthState.lastError = `Playback device "${currentPlayback}" not found`;
            console.log('Watchdog: Playback device missing! Will attempt fallback on next restart.');
        } else {
            this.healthState.deviceStatus = 'ok';
        }

        this.healthState.playbackDevice = currentPlayback;
    }

    async checkSignalPresence() {
        if (!this.isRunning()) {
            this.healthState.signalPresent = false;
            return;
        }

        try {
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:5005');

            const timeout = setTimeout(() => {
                ws.terminate();
            }, 1500);

            ws.on('open', () => {
                ws.send('"GetCaptureSignalPeak"');
            });

            ws.on('message', (data) => {
                clearTimeout(timeout);
                try {
                    const response = JSON.parse(data.toString());
                    if (response.GetCaptureSignalPeak?.result === 'Ok') {
                        const [left, right] = response.GetCaptureSignalPeak.value;
                        this.healthState.signalLevels = { left, right };

                        // Signal present if above -60 dB
                        const hasSignal = left > -60 || right > -60;
                        if (hasSignal) {
                            this.healthState.signalPresent = true;
                            this.healthState.silenceDuration = 0;
                        } else {
                            this.healthState.silenceDuration += 2; // 2 second check interval
                            if (this.healthState.silenceDuration >= 5) {
                                this.healthState.signalPresent = false;
                            }
                        }
                    }
                } catch (e) { }
                ws.close();
            });

            ws.on('error', () => {
                clearTimeout(timeout);
            });
        } catch (e) {
            // WebSocket module might not be available in all contexts
        }
    }

    handleDeviceFallback() {
        const bestDevice = this.findBestOutputDevice();
        if (bestDevice && bestDevice !== this.healthState.playbackDevice) {
            console.log(`Watchdog: Switching to fallback device "${bestDevice}"`);
            this.healthState.deviceStatus = 'switched';
            this.healthState.playbackDevice = bestDevice;

            if (this.lastFilterData && this.lastOptions) {
                this.lastOptions.device = bestDevice;
                this.start(this.lastFilterData, this.lastOptions)
                    .then(() => console.log('Watchdog: Fallback device started successfully'))
                    .catch(e => console.error('Watchdog: Fallback start failed', e));
            }
        }
    }

    getHealthReport() {
        return {
            dsp: {
                running: this.isRunning(),
                uptime: this.healthState.startTime ? Math.floor((Date.now() - this.healthState.startTime) / 1000) : 0,
                restartCount: this.healthState.restartCount,
                bypass: this.currentState.bypass
            },
            devices: {
                capture: {
                    name: this.healthState.captureDevice,
                    status: this.healthState.deviceStatus === 'ok' || this.isLinux ? 'ok' : 'missing'
                },
                playback: {
                    name: this.healthState.playbackDevice || this.currentState.device,
                    status: this.healthState.deviceStatus
                }
            },
            signal: {
                present: this.healthState.signalPresent,
                levels: this.healthState.signalLevels,
                silenceDuration: this.healthState.silenceDuration
            },
            lastError: this.healthState.lastError,
            lastCheck: this.healthState.lastCheck
        };
    }

    async ensureRunning() {
        // Use persisted state as the source of truth for intent
        const intendedState = this.persistedState;

        if (intendedState.running && !this.isRunning()) {
            console.log('ensureRunning: DSP died but should be running. Intent:', intendedState.bypass ? 'Bypass' : 'Normal');

            // If internal flag matches, we can trust lastFilterData. 
            // If this is a fresh boot, we might not have lastFilterData in memory.
            // TODO: Ideally we should load last config from disk too, but for now we rely on the watchdog's restart logic
            // or we expect a fresh start call from the server if it detects it's stopped.

            if (intendedState.bypass) {
                // We need a sample rate to start bypass. Use current state or default.
                const rate = this.currentState.sampleRate || 96000;
                return this.startBypass(rate);
            } else if (this.lastFilterData) {
                return this.start(this.lastFilterData, this.lastOptions);
            }
        }
        return Promise.resolve(true); // Already running or explicitly stopped
    }

    async stop() {
        this.shouldBeRunning = false; // Mark as explicitly stopped by user/system
        this.saveState({ running: false });

        this.stopWatchdog();

        if (this.process) {
            console.log('Stopping CamillaDSP instance...');
            this.process.kill('SIGTERM');
            this.process = null;
        }
        this.currentState.running = false;
        // Force kill any other instances that might be lingering
        const { execSync } = require('child_process');
        try {
            execSync('pkill -9 camilladsp');
            console.log('All camilladsp processes force-killed.');
        } catch (e) {
            // No process found, it's fine
        }
        // Wait for port 5005 to be released
        await this.waitForPortRelease(5005, 3000);
    }

    waitForPortRelease(port, timeout) {
        return new Promise((resolve) => {
            const { execSync } = require('child_process');
            const start = Date.now();

            const check = () => {
                try {
                    // Check if any camilladsp process is still running
                    const processes = execSync('pgrep -x camilladsp', { encoding: 'utf8' }).trim();
                    if (processes) {
                        if (Date.now() - start < timeout) {
                            setTimeout(check, 300);
                        } else {
                            console.log(`CamillaDSP processes still running after ${timeout}ms, force killing`);
                            try { execSync('pkill -9 camilladsp'); } catch (e) { }
                            setTimeout(resolve, 1000); // Extra delay after force kill for CoreAudio
                        }
                    } else {
                        console.log('All CamillaDSP processes terminated');
                        setTimeout(resolve, 800); // Delay for CoreAudio to fully release devices
                    }
                } catch (e) {
                    // pgrep returns exit code 1 if no process found - port is free
                    console.log('No CamillaDSP processes running, port is free');
                    setTimeout(resolve, 800); // Delay for CoreAudio to fully release devices
                }
            };
            setTimeout(check, 500); // Initial delay to let SIGTERM work
        });
    }

    // Restart DSP with a new sample rate, preserving current filter configuration
    async restartWithSampleRate(sampleRate) {
        if (!this.isRunning()) {
            console.log('DSP: Not running, cannot change sample rate');
            return false;
        }

        if (this.currentState.sampleRate === sampleRate) {
            console.log(`DSP: Already running at ${sampleRate}Hz, skipping restart`);
            return true;
        }

        if (!this.lastFilterData) {
            console.log('DSP: No stored filter data, cannot restart');
            return false;
        }

        console.log(`DSP: Restarting for sample rate change: ${this.currentState.sampleRate} -> ${sampleRate}Hz`);

        // Restart with same filters but new sample rate
        const newOptions = {
            ...this.lastOptions,
            sampleRate: sampleRate
        };

        try {
            await this.start(this.lastFilterData, newOptions);
            console.log(`DSP: Successfully restarted at ${sampleRate}Hz`);
            return true;
        } catch (err) {
            console.error('DSP: Failed to restart with new sample rate:', err);
            return false;
        }
    }

    // Start in bypass mode (no filters, just pass-through)
    async startBypass(sampleRate) {
        // Stop any running instance first
        // Note: stop() sets running=false in state, so we must set it back to true after
        await this.stop();

        this.shouldBeRunning = true;
        this.saveState({ running: true, bypass: true }); // Persist BYPASS intent

        return new Promise((resolve, reject) => {
            try {
                // Read and modify bypass config with current sample rate
                // For Linux, we override the whole devices section to ensure ALSA
                const config = {
                    devices: {
                        samplerate: sampleRate || 96000,
                        chunksize: 4096,
                        capture: this.isLinux ? {
                            type: 'Alsa',
                            device: 'hw:Loopback,1',
                            channels: 2,
                            format: 'S32LE'
                        } : {
                            type: 'CoreAudio',
                            device: 'BlackHole 2ch',
                            channels: 2
                        },
                        playback: this.isLinux ? {
                            type: 'Alsa',
                            device: 'hw:III',
                            channels: 2,
                            format: 'S32LE'
                        } : {
                            type: 'CoreAudio',
                            device: this.findBestOutputDevice(),
                            channels: 2
                        }
                    },
                    filters: {
                        volume: {
                            type: 'Gain',
                            parameters: { gain: 0.0 }
                        }
                    },
                    pipeline: [{
                        type: 'Filter',
                        channels: [0, 1],
                        names: ['volume']
                    }]
                };

                const configPath = path.join(this.baseDir, 'temp_config.yml');
                fs.writeFileSync(configPath, yaml.dump(config));

                console.log(`Starting CamillaDSP in BYPASS mode at ${config.devices.samplerate}Hz (${this.isLinux ? 'ALSA' : 'CoreAudio'})`);

                const dspArgs = ['-a', '0.0.0.0', '-p', '5005', configPath];
                this.process = spawn(this.dspPath, dspArgs, {
                    cwd: this.baseDir
                });

                this.currentState = {
                    running: true,
                    bypass: true,
                    sampleRate: config.devices.samplerate,
                    bitDepth: 24,
                    presetName: 'BYPASS',
                    filtersCount: 0,
                    preamp: 0,
                    device: config.devices.playback.device
                };

                this.process.stdout.on('data', (data) => console.log(`DSP out: ${data}`));
                this.process.stderr.on('data', (data) => console.error(`DSP err: ${data}`));

                this.process.on('close', (code) => {
                    console.log(`DSP exited with code ${code}`);
                    this.process = null;
                });

                this.process.on('error', (err) => {
                    console.error('Failed to start DSP:', err);
                    reject(err);
                });

                setTimeout(() => {
                    if (this.isRunning()) resolve(true);
                    else reject(new Error('Process exited immediately'));
                }, 1000);

            } catch (err) {
                reject(err);
            }
        });
    }
}

module.exports = DSPManager;

