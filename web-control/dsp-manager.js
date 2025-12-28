const { spawn, exec, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

class DSPManager {
    constructor(baseDir) {
        this.process = null;
        this.baseDir = baseDir; // camilla dir
        this.presetsDir = path.join(baseDir, 'presets');
        this.dspPath = path.join(baseDir, 'camilladsp');
    }

    isRunning() {
        return this.process !== null && !this.process.killed;
    }

    generateConfig(filterData, options = {}) {
        const sampleRate = options.sampleRate || 96000;
        // bitDepth is now informational only - CoreAudio auto-selects format

        const config = {
            devices: {
                samplerate: sampleRate,
                chunksize: 4096,
                capture: {
                    type: 'CoreAudio',
                    device: 'BlackHole 2ch',
                    channels: 2
                },
                playback: {
                    type: 'CoreAudio',
                    device: 'D50 III',
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

    async stop() {
        if (this.process) {
            console.log('Stopping CamillaDSP instance...');
            this.process.kill('SIGTERM');
            this.process = null;
        }
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
}

module.exports = DSPManager;
