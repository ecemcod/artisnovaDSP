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

// Create fresh state file and restart
const cmd = `
sudo systemctl stop camilladsp &&
sudo pkill -f camillagui || true &&
rm -f /home/${user}/camilladsp/statefile.yml &&
echo 'volume: 0.0' > /home/${user}/camilladsp/statefile.yml &&
cat /home/${user}/camilladsp/active_config.yml &&
sudo /usr/local/bin/camilladsp /home/${user}/camilladsp/active_config.yml -a 0.0.0.0 -p 1234 2>&1 &
sleep 5 &&
pgrep -a camilladsp
`;

console.log("🔧 Running CamillaDSP directly without systemd...");
try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error("Error:", e.message);
}
