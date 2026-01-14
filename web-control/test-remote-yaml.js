const RemoteDSPManager = require('./remote-dsp-manager');
const fs = require('fs');
const path = require('path');

const remoteDsp = new RemoteDSPManager({
    host: 'raspberrypi.local',
    user: 'manuelcouceiro',
    password: 'Lo0125ks'
});

const rate = parseInt(process.argv[2]) || 96000;
const filterData = { preamp: 0, filters: [] };
const options = { sampleRate: rate };

const configYaml = remoteDsp.generateConfigJson(filterData, options);
console.log('Pushing YAML config to Pi...');
console.log(configYaml);

remoteDsp.syncConfigSsh(configYaml)
    .then(() => {
        console.log('SSH Sync successful. Now restart CamillaDSP service on Pi.');
        process.exit(0);
    })
    .catch(err => {
        console.error('SSH Sync failed:', err);
        process.exit(1);
    });
