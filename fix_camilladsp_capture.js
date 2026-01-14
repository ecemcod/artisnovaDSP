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

// Fix: Change capture device from hw:Loopback,1 to hw:Loopback,0
const cmd = `
sed -i 's/device: hw:Loopback,1/device: hw:Loopback,0/' /home/${user}/camilladsp/active_config.yml &&
sudo systemctl restart camilladsp &&
sleep 2 &&
cat /home/${user}/camilladsp/active_config.yml | head -15
`;

console.log("🔧 Fixing CamillaDSP capture device...");
try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
    console.log("✅ CamillaDSP capture device corrected to hw:Loopback,0");
} catch (e) {
    console.error("Error:", e.message);
}
