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
const conf = `
general = {
  name = "ArtisNova AirPlay";
};

alsa = {
  output_device = "hw:0,0";
};
`;

// Base64 encode the config to safely pass it via SSH command line
const encodedConf = Buffer.from(conf).toString('base64');

const cmd = `echo ${encodedConf} | base64 -d | sudo tee /etc/shairport-sync.conf > /dev/null && sudo systemctl restart shairport-sync`;

console.log(`\n--- Executing: ${cmd} ---`);
try {
    const output = execSync(`python3 ssh_client.py ${creds.user} ${creds.host} ${creds.password} "${cmd}"`, { encoding: 'utf8' });
    console.log(output);
} catch (e) {
    console.error(`Error:`, e.message);
}
