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

// Check ALL loopback devices
const cmds = [
    'cat /proc/asound/card0/pcm0p/sub0/hw_params 2>/dev/null || echo "closed"',
    'cat /proc/asound/card0/pcm0c/sub0/hw_params 2>/dev/null || echo "closed"',
    'cat /proc/asound/card0/pcm1p/sub0/hw_params 2>/dev/null || echo "closed"',
    'cat /proc/asound/card0/pcm1c/sub0/hw_params 2>/dev/null || echo "closed"',
    'sudo systemctl status camilladsp | head -15'
];

console.log("=== Loopback Device States ===");
console.log("pcm0p = Loopback,0 playback | pcm0c = Loopback,0 capture");
console.log("pcm1p = Loopback,1 playback | pcm1c = Loopback,1 capture");
console.log("What goes into pcmXp appears in pcmXc of the OTHER pair\n");

for (const cmd of cmds) {
    const label = cmd.includes('pcm0p') ? 'Loopback,0 Playback' :
        cmd.includes('pcm0c') ? 'Loopback,0 Capture' :
            cmd.includes('pcm1p') ? 'Loopback,1 Playback' :
                cmd.includes('pcm1c') ? 'Loopback,1 Capture' : 'CamillaDSP Status';
    console.log(`--- ${label} ---`);
    try {
        const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
        console.log(output);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
