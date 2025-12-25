const { spawn } = require('child_process');
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
        const sampleRate = options.sampleRate || 44100;
        // bitDepth is now informational only - CoreAudio auto-selects format

        const config = {
            devices: {
                samplerate: sampleRate,
                chunksize: 1024,
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

    start(filterData, options = {}) {
        return new Promise((resolve, reject) => {
            if (this.isRunning()) {
                this.stop();
            }

            try {
                const configYaml = this.generateConfig(filterData, options);
                const configPath = path.join(this.baseDir, 'temp_config.yml');
                fs.writeFileSync(configPath, configYaml);

                console.log('Starting CamillaDSP with config:', configPath);

                // Spawn with websocket enabled on port 1234 for level data
                this.process = spawn(this.dspPath, ['-p', '1234', configPath], {
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
                }, 500);

            } catch (err) {
                reject(err);
            }
        });
    }

    stop() {
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
    }
}

module.exports = DSPManager;
