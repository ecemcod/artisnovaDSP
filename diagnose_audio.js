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

const cmds = [
    'tail -30 /home/manuelcouceiro/camilladsp/camilladsp.log',
    'sudo journalctl -u shairport-sync -n 20 --no-pager',
    'cat /proc/asound/card0/pcm0p/sub0/hw_params 2>/dev/null || echo "No active playback"',
    'cat /proc/asound/card0/pcm1c/sub0/hw_params 2>/dev/null || echo "No active capture"'
];

for (const cmd of cmds) {
    console.log(`\n=== ${cmd.substring(0, 60)}... ===`);
    try {
        const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
        console.log(output);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
