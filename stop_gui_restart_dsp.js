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

// Stop camillagui_backend and restart camilladsp cleanly
const cmds = [
    'sudo systemctl stop camillagui || true',
    'sudo pkill -9 camillagui_backend || true',
    'sudo systemctl stop camilladsp',
    'sleep 1',
    'sudo systemctl start camilladsp',
    'sleep 3',
    'sudo systemctl status camilladsp'
];

const cmd = cmds.join(' && ');

console.log("🔧 Stopping camillagui_backend and restarting CamillaDSP cleanly...");
try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error("Error:", e.message);
}
