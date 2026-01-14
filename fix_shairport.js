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

// Correct Shairport-Sync config: output to hw:0,1 so CamillaDSP can capture from hw:0,0
const conf = `
general = {
  name = "ArtisNova AirPlay";
};

alsa = {
  output_device = "hw:0,1";
};
`;

const encodedConf = Buffer.from(conf).toString('base64');

const cmd = `echo ${encodedConf} | base64 -d | sudo tee /etc/shairport-sync.conf > /dev/null && sudo systemctl restart shairport-sync && sleep 1 && sudo systemctl status shairport-sync`;

console.log("🔧 Fixing Shairport-Sync configuration...");
try {
    const output = execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
    console.log("✅ Shairport-Sync reconfigured to use hw:0,1");
} catch (e) {
    console.error("Error:", e.message);
}
