const fs = require('fs');
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
const host = creds.host;
const user = creds.user;
const password = creds.password;

// Reset CamillaDSP to capture from correct source with proper config
const newConfig = `devices:
  samplerate: 44100
  chunksize: 4096
  capture:
    type: Alsa
    channels: 2
    device: "hw:Loopback,0,0"
    format: S32LE
  playback:
    type: Alsa
    channels: 2
    device: "hw:III,0"
    format: S32LE
filters: {}
pipeline:
  - type: Filter
    channels:
      - 0
      - 1
    names: []
`;

const encodedConfig = Buffer.from(newConfig).toString('base64');

const cmd = `
echo ${encodedConfig} | base64 -d > /home/${user}/camilladsp/active_config.yml &&
sudo systemctl stop camilladsp &&
sleep 1 &&
sudo systemctl start camilladsp &&
sleep 2 &&
sudo systemctl status camilladsp
`;

console.log("🔧 Resetting CamillaDSP configuration...");
try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error("Error:", e.message);
}
