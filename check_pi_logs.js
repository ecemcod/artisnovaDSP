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

const cmd = 'sudo journalctl -u artisnova -n 50 --no-pager';

try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error("Error:", e.message);
}
