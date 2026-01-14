const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getCreds() {
    const raspiTxtPath = '/Users/manuelcouceiro/Audio Calibration/camilla/raspi.txt';
    const content = fs.readFileSync(raspiTxtPath, 'utf8');
    const lines = content.split('\n');
    const creds = {};
    lines.forEach(line => {
        const [key, value] = line.split('=').map(s => s.trim());
        if (key && value) creds[key] = value;
    });
    return creds;
}

const creds = getCreds();
const commands = [
    'sudo apt-get update',
    'sudo apt-get install -y shairport-sync librespot',
    'sudo systemctl enable shairport-sync',
    'sudo systemctl start shairport-sync',
    'sudo systemctl enable librespot',
    'sudo systemctl start librespot'
];

for (const cmd of commands) {
    console.log(`\n--- Executing: ${cmd} ---`);
    try {
        const output = execSync(`python3 ssh_client.py ${creds.user} ${creds.host} ${creds.password} "${cmd}"`, { encoding: 'utf8' });
        console.log(output);
    } catch (e) {
        console.error(`Error executing ${cmd}:`, e.message);
    }
}
