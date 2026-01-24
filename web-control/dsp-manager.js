const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// Flags to manage hot reload behavior
// Indicates that the next DSP process exit is expected after a hot reload
this.ignoreNextExit = false;
// Tracks if hot reload succeeded
this.hotReloadSuccessful = false;

class DSPManager {
    constructor(baseDir) {
        this.process = null;
        this.isLinux = process.platform === 'linux';
        this.baseDir = baseDir; // camilla dir
        this.presetsDir = path.join(baseDir, 'presets');
        this.dspPath = this.isLinux ? 'camilladsp' : path.join(baseDir, 'camilladsp');
        this.bypassConfigPath = path.join(baseDir, 'config-bypass.yml');
        this.stateFilePath = path.join(baseDir, 'state.json');
        // Flags to manage hot reload behavior
        this.ignoreNextExit = false;
        this.hotReloadSuccessful = false;

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

        // Robust sample rate loading
        if (this.persistedState.sampleRate) {
            this.currentState.sampleRate = this.persistedState.sampleRate;
        } else if (this.persistedState.lastOptions && this.persistedState.lastOptions.sampleRate) {
            this.currentState.sampleRate = this.persistedState.lastOptions.sampleRate;
        }

        // Restore filter data for robust restarts
        if (this.persistedState.lastFilterData) this.lastFilterData = this.persistedState.lastFilterData;
        if (this.persistedState.lastOptions) this.lastOptions = this.persistedState.lastOptions;

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
        return { running: true, bypass: false };
    }

    saveState(updates = {}) {
        try {
            this.persistedState = { ...this.persistedState, ...updates };
            // Persist critical start data if available
            if (this.lastFilterData) this.persistedState.lastFilterData = this.lastFilterData;
            if (this.lastOptions) this.persistedState.lastOptions = this.lastOptions;

            fs.writeFileSync(this.stateFilePath, JSON.stringify(this.persistedState, null, 2));
        } catch (e) {
            console.error('Failed to save state.json:', e);
        }
    }
    isRunning() {
        // Check internal reference first
        if (this.process !== null && !this.process.killed) {
            return true;
        }
        // Fallback: check if camilladsp is actually running on the system
        try {
            const { execSync } = require('child_process');
            const result = execSync('pgrep -x camilladsp', { encoding: 'utf8' }).trim();
            if (result) {
                console.log('DSPManager: isRunning() - Found orphaned camilladsp process:', result);
                // Sync sample rate to 96000 so hot reload can work
                if (this.currentState.sampleRate === 0 || this.currentState.sampleRate === undefined) {
                    console.log('DSPManager: Syncing orphaned process state - assuming 96kHz');
                    this.currentState.sampleRate = 96000;
                    this.currentState.running = true;
                }
                return true;
            }
        } catch (e) {
            // pgrep returns non-zero if no process found
        }
        return false;
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
        const isBypass = options.bypass || false;
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
                    channels: 2,
                    format: 'FLOAT32LE'
                },
                playback: this.isLinux ? {
                    type: 'Alsa',
                    device: `hw:${this.findBestOutputDevice()}`,
                    channels: 2,
                    format: options.format || 'S32LE'
                } : {
                    type: 'CoreAudio',
                    device: this.findBestOutputDevice(),
                    channels: 2,
                    format: options.format || 'FLOAT32LE'
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
        if (filterData && filterData.filters) {
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

        // BYPASS MODE / Empty Pipeline Protection
        // CamillaDSP fails if there's no filters at all.
        // If we're in bypass or have no filters, add a dummy 0dB gain filter.
        if (isBypass || pipelineNames.length === 0) {
            if (!config.filters['volume']) {
                config.filters['volume'] = {
                    type: 'Gain',
                    parameters: { gain: 0.0 }
                };
                // In pure bypass, we only want the volume filter
                if (isBypass) {
                    // Clear any other filters that might have been added
                    config.pipeline = [{
                        type: 'Filter',
                        channels: [0, 1],
                        names: ['volume']
                    }];
                    return yaml.dump(config);
                }
                pipelineNames.push('volume');
            }
        }

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
        console.log(`DSPManager: start() called. isStarting=${this.isStarting}, isFallback=${options.isFallback}, bypass=${options.bypass}`);
        console.log(`DSPManager: Current State: running=${this.currentState.running}, bypass=${this.currentState.bypass}`);

        if (this.isStarting && !options.isFallback) {
            console.log('DSPManager: Start ignored - already starting');
            return Promise.resolve(false);
        }

        const isRunningNow = this.isRunning();
        const currentSR = this.currentState.sampleRate;
        const targetSR = options.sampleRate || 96000;
        const isSameSampleRate = isRunningNow && currentSR === targetSR;
        const canHotReload = isSameSampleRate && !options.isFallback && !options.forceRestart;

        console.log(`DSPManager: Hot Reload check - isRunning=${isRunningNow}, currentSR=${currentSR}, targetSR=${targetSR}, isFallback=${options.isFallback}, forceRestart=${options.forceRestart}, canHotReload=${canHotReload}`);
        if (!canHotReload) {
            console.log(`DSPManager: Hot Reload NOT possible. Reasons: isRunning=${isRunningNow}, SR match=${currentSR === targetSR}, isFallback=${!!options.isFallback}, forceRestart=${!!options.forceRestart}`);
        }

        // Update state IMMEDIATELY for UI responsiveness
        this.currentState = {
            ...this.currentState,
            running: true,
            bypass: options.bypass || false,
            sampleRate: options.sampleRate || 96000,
            bitDepth: options.bitDepth || 24,
            presetName: options.presetName || (options.bypass ? 'BYPASS' : 'Manual'),
            filtersCount: filterData?.filters?.length || 0,
            preamp: filterData?.preamp || 0
        };

        if (canHotReload) {
            console.log('DSPManager: Attempting Hot Reload...');
            try {
                const success = await this.hotReload(filterData, options);
                if (success) {
                    // Save filter data for future restarts
                    this.lastFilterData = filterData;
                    this.lastOptions = { ...options };
                    const bypassFlag = options.bypass || false;
                    this.saveState({ running: true, bypass: bypassFlag, presetName: this.currentState.presetName });
                    console.log(`DSPManager: Hot Reload complete (Bypass: ${bypassFlag}) - returning early`);
                    return true;
                }
                console.warn('DSPManager: Hot Reload failed, falling back to full restart');
            } catch (e) {
                console.error('DSPManager: Hot Reload error:', e.message);
            }
        } else {
            console.log(`DSPManager: Hot Reload not possible. isRunning=${this.isRunning()}, sampleRate match=${this.currentState.sampleRate === (options.sampleRate || 96000)}, isFallback=${options.isFallback}, forceRestart=${options.forceRestart}`);
        }

        this.isStarting = true;

        // ALWAYS stop and wait before starting to ensure audio devices are released
        // Check if we are already doing a fallback restart - if so, don't full stop if possible, 
        // but we likely need to to be safe. 
        if (!options.isFallback) {
            await this.stop();
        } else {
            // If fallback, we might have just crashed, so process is null. 
            // Just ensure cleanup logic runs if needed.
            if (this.process) await this.stop();
        }

        // Store filter data for potential sample rate restarts
        this.lastFilterData = filterData;
        this.lastOptions = { ...options };
        this.shouldBeRunning = true; // Mark as intended to be running

        const startPromise = new Promise((resolve, reject) => {
            try {
                const configYaml = this.generateConfig(filterData, options);
                const configPath = path.join(this.baseDir, 'temp_config.yml');
                fs.writeFileSync(configPath, configYaml);

                console.log('Starting CamillaDSP with config:', configPath);

                // Cleanup any orphaned processes named camilladsp before starting (Mac)
                if (process.platform === 'darwin') {
                    try {
                        const { execSync } = require('child_process');
                        console.log('DSPManager: Cleaning up all camilladsp processes...');
                        execSync('killall -9 camilladsp 2>/dev/null || true');
                        execSync('lsof -ti:5005 | xargs kill -9 2>/dev/null || true');
                        execSync('sleep 1.0'); // Give CoreAudio more time to release hardware
                    } catch (e) { }
                }

                const dspArgs = ['-a', '0.0.0.0', '-p', '5005', configPath];
                console.log('Spawning:', this.dspPath, dspArgs.join(' '));

                // Spawn with websocket enabled on port 5005 for level data
                this.process = spawn(this.dspPath, dspArgs, {
                    cwd: this.baseDir
                });

                this.currentState = {
                    ...this.currentState,
                    running: true,
                    device: options.device || (this.isLinux ? 'D50 III' : this.findBestOutputDevice())
                };

                this.process.stdout.on('data', (data) => console.log(`DSP out: ${data}`));
                this.process.stderr.on('data', (data) => {
                    const errStr = data.toString();
                    console.error(`DSP err: ${errStr}`);
                    this.healthState.lastError = errStr;
                    if (errStr.includes('Failed to find matching physical playback format')) {
                        this.healthState.formatError = true;
                    }
                });

                this.process.on('close', (code) => {
                    console.log(`DSP exited with code ${code}`);
                    this.process = null;
                    // If this exit was expected after a hot reload, ignore watchdog restart
                    if (this.ignoreNextExit) {
                        console.log('DSPManager: Expected exit after hot reload, ignoring for watchdog.');
                        this.ignoreNextExit = false;
                        return;
                    }
                    // Reset format error on explicit stop or if we are about to restart
                    if (this.shouldBeRunning) {
                        console.log('DSPManager: Process exited while it should be running. Watchdog will handle.');
                    }
                });

                this.process.on('error', (err) => {
                    console.error('Failed to start DSP:', err);
                    reject(err);
                });

                // Start Watchdog to ensure persistence
                this.startWatchdog();

                this.saveState({
                    running: true,
                    bypass: options.bypass || false,
                    presetName: this.currentState.presetName
                });

                // Give it a moment to verify it hasn't crashed immediately
                setTimeout(async () => {
                    if (this.isRunning()) {
                        resolve(true);
                    } else {
                        // Check if we can try a fallback format on Mac
                        if (!this.isLinux && this.healthState.formatError && !options.isFallback) {
                            console.log('DSPManager: Detected format error. Trying S32LE fallback...');
                            try {
                                const fallbackOptions = { ...options, format: 'S32LE', isFallback: true };
                                await this.start(filterData, fallbackOptions);
                                resolve(true);
                            } catch (e) {
                                reject(e);
                            }
                        } else {
                            reject(new Error('Process exited immediately'));
                        }
                    }
                }, 1000);

            } catch (err) {
                reject(err);
            }
        });

        startPromise.finally(() => {
            this.isStarting = false;
        });

        return startPromise;
    }

    startWatchdog() {
        if (this.watchdogInterval) clearInterval(this.watchdogInterval);
        if (this.signalCheckInterval) clearInterval(this.signalCheckInterval);
        if (this.deviceCheckInterval) clearInterval(this.deviceCheckInterval);

        console.log('Starting Enhanced DSP Watchdog (2s interval)...');
        this.healthState.startTime = Date.now();
        this.healthState.restartCount = 0;

        // Process health check - Enhanced Keep-Alive
        this.watchdogInterval = setInterval(() => {
            this.healthState.lastCheck = Date.now();

            // Simple Keep-Alive: If it should be running but isn't, restart it.
            // Ignoramos silencio, Roon states, etc. Solo nos importa: ¿Existe el proceso?
            if (this.shouldBeRunning && !this.isRunning()) {
                console.log('Watchdog: DSP process is dead. Restarting...');

                // Basic restart throttling (prevent rapid-fire if config is broken)
                const now = Date.now();
                if (now - this.healthState.lastRestartTime < 2000) {
                    console.log('Watchdog: Skipping restart (too fast)');
                    return;
                }
                this.healthState.lastRestartTime = now;

                if (this.lastFilterData) {
                    this.start(this.lastFilterData, this.lastOptions)
                        .catch(e => console.error('Watchdog: Restart failed', e));
                }
            }
        }, 3000); // Check every 3 seconds

        // Device health check - every 10 seconds
        this.deviceCheckInterval = setInterval(() => {
            this.checkDeviceHealth();
        }, 10000);

        // Signal presence check - frequent for debugging playback issue
        this.signalCheckInterval = setInterval(() => {
            // this.checkSignalPresence(); // DISABLED: Let's trust the server to manage silence. 
            // The DSP manager killing process on silence is fighting the server's logic.
            // If we want "Always On", we shouldn't kill it just because it's silent.
        }, 10000);

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

    _updateSignalState(captureLevels, playbackLevels) {
        this.healthState.signalLevels = { capture: captureLevels, playback: playbackLevels };
        const [cL, cR] = captureLevels;
        const [pL, pR] = playbackLevels;

        if (cL > -100) {
            console.log(`[LEVELS] Capture: L=${cL.toFixed(1)}, R=${cR.toFixed(1)} | Playback: L=${pL.toFixed(1)}, R=${pR.toFixed(1)}`);
        }

        const hasSignal = cL > -60 || cR > -60;
        if (hasSignal) {
            this.healthState.signalPresent = true;
            this.healthState.silenceDuration = 0;
        } else {
            // Increment silence duration (this method is called once per 2s check)
            this.healthState.silenceDuration += 2;
            if (this.healthState.silenceDuration >= 30) { // Aumentado de 5 a 30 segundos
                this.healthState.signalPresent = false;
                if (this.healthState.silenceDuration === 32) { // Aumentado de 6 a 32 segundos
                    console.warn('DSPManager: Prolonged silence detected while running.');
                }
            }
        }
    }

    async checkSignalPresence() {
        if (!this.isRunning()) {
            this.healthState.signalPresent = false;
            return;
        }

        try {
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://127.0.0.1:5005');

            const timeout = setTimeout(() => {
                ws.terminate();
            }, 1000);

            ws.on('open', () => {
                // Request both in one go if possible, or sequentially
                ws.send('"GetCaptureSignalPeak"');
                ws.send('"GetPlaybackSignalPeak"');
            });

            let capture = null;
            let playback = null;

            ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    if (response.GetCaptureSignalPeak) capture = response.GetCaptureSignalPeak.value;
                    if (response.GetPlaybackSignalPeak) playback = response.GetPlaybackSignalPeak.value;

                    if (capture !== null && playback !== null) {
                        clearTimeout(timeout);
                        this._updateSignalState(capture, playback);
                        ws.close();
                    }
                } catch (e) { }
            });

            ws.on('error', () => {
                clearTimeout(timeout);
            });
        } catch (e) { }
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
        console.log('DSPManager: stop() called');
        this.shouldBeRunning = false; // Mark as explicitly stopped by user/system
        this.currentState.running = false;

        this.saveState({ running: false });
        this.stopWatchdog();

        if (this.process) {
            console.log('Stopping CamillaDSP instance...');
            this.process.kill('SIGTERM');
            this.process = null;
        }
        this.currentState.running = false;
        // Force kill any other instances that might be lingering on port 5005
        const { execSync } = require('child_process');
        try {
            console.log('DSPManager: Cleaning up port 5005...');
            if (process.platform === 'darwin') {
                // Use pkill instead of lsof to avoid hanging on network mounts
                // pkill -f matches full argument list. 
                try {
                    execSync('pkill -9 -f "camilladsp.*5005" || true');
                    console.log('Main DSP cleanup (pkill) complete.');
                } catch (e) {
                    // pkill returns non-zero if no process found, which is fine
                }
            } else {
                // On Linux we might still need pkill if not using multiple instances,
                // but let's be safer and check for 5005 there too if netstat/ss available
                execSync('pkill -9 camilladsp');
            }
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
        console.log(`DSPManager: startBypass requested at ${sampleRate}Hz. Current bypass state: ${this.currentState.bypass}`);
        return this.start({ filters: [], preamp: 0 }, {
            sampleRate,
            bypass: true,
            presetName: 'BYPASS'
        }).then(started => {
            if (started) {
                this.saveState({ running: true, bypass: true, presetName: 'BYPASS' });
            }
            return started;
        });
    }

    async setMute(muted) {
        if (!this.isRunning()) return;

        console.log(`DSPManager: Setting mute to ${muted}`);
        this.currentState.mute = muted;

        try {
            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:5005');

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.terminate();
                    reject(new Error('WebSocket timeout'));
                }, 1000);

                ws.on('open', () => {
                    // CamillaDSP protocol: "SetMute": boolean
                    ws.send(JSON.stringify({ "SetMute": muted }));
                });

                ws.on('message', (data) => {
                    // Wait for ack? usually returns {"SetMute": {"result": "Ok"}}
                    const msg = JSON.parse(data);
                    if (msg.SetMute) {
                        clearTimeout(timeout);
                        ws.close();
                        resolve();
                    }
                });

                ws.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
            console.log('DSPManager: Mute command sent successfully');
        } catch (e) {
            console.error('DSPManager: Failed to send mute command', e);
        }
    }

    async hotReload(filterData, options = {}) {
        console.log('DSPManager: hotReload() called');

        if (!this.isRunning()) {
            console.log('DSPManager: hotReload aborted - isRunning() returned false');
            return false;
        }

        try {
            console.log('DSPManager: Generating config for hot reload...');
            const configYaml = this.generateConfig(filterData, options);
            const configJson = yaml.load(configYaml);

            // Also write to file for consistency and debugging
            const configPath = path.join(this.baseDir, 'temp_config.yml');
            fs.writeFileSync(configPath, configYaml);
            console.log('DSPManager: Config written to file, connecting to ws://localhost:5005...');

            const WebSocket = require('ws');
            const ws = new WebSocket('ws://localhost:5005');

            return await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    ws.terminate();
                    reject(new Error('Hot Reload: WebSocket timeout'));
                }, 2000);

                ws.on('open', () => {
                    console.log('DSPManager: Sending Hot Reload config via WebSocket...');
                    ws.send(JSON.stringify({ "SetConfigJson": JSON.stringify(configJson) }));
                });

                ws.on('message', (data) => {
                    const msg = JSON.parse(data);
                    if (msg.SetConfigJson) {
                        if (msg.SetConfigJson.result === 'Ok') {
                            console.log('DSPManager: Config pushed, sending Reload...');
                            ws.send('"Reload"');
                        } else {
                            clearTimeout(timeout);
                            ws.close();
                            reject(new Error(`SetConfigJson failed: ${msg.SetConfigJson.result}`));
                        }
                    } else if (msg.Reload) {
                        clearTimeout(timeout);
                        ws.close();
                        if (msg.Reload.result === 'Ok') {
                            console.log('DSPManager: Hot Reload successful!');
                            resolve(true);
                        } else {
                            reject(new Error(`Reload failed: ${msg.Reload.result}`));
                        }
                    }
                });

                ws.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });
            });
        } catch (err) {
            console.error('DSPManager: Hot Reload failed:', err.message);
            return false;
        }
    }
}

module.exports = DSPManager;

