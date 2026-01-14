const DSPManager = require('./dsp-manager');
const path = require('path');

const dsp = new DSPManager(path.resolve(__dirname, '..'));

console.log('Testing device discovery...');
const devices = dsp.getAvailableDevices();
console.log('Available devices:', devices);

const best = dsp.findBestOutputDevice();
console.log('Best candidate:', best);

const filterData = { preamp: 0, filters: [] };
const options = { sampleRate: 44100, presetName: 'Test' };

console.log('Attempting start bypass at 44.1k...');
dsp.startBypass(44100)
    .then(() => {
        console.log('DSP Started successfully!');
        process.exit(0);
    })
    .catch(err => {
        console.error('DSP Start failed:', err);
        process.exit(1);
    });
