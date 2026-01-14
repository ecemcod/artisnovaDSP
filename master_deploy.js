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
const host = creds.host;
const user = creds.user;
const password = creds.password;

console.log("🚀 Starting robust automated deployment...");

try {
    // 1. Prepare bundle (exclude node_modules)
    console.log("📦 Preparing bundle...");
    const bundlePath = '/tmp/artisnova_bundle.tar.gz';
    execSync(`tar -czf "${bundlePath}" --exclude=node_modules web-control raspi_config.yml`, { cwd: '/Users/manuelcouceiro/Audio Calibration/camilla' });

    // 2. Transfer bundle
    console.log("📡 Sending bundle to Pi...");
    execSync(`python3 automate_pty.py ${password} scp -o StrictHostKeyChecking=no "${bundlePath}" ${user}@${host}:/tmp/`, { stdio: 'inherit' });

    // 3. Extract and Clean Install
    console.log("🔧 Extracting and clean installing dependencies on Pi...");
    const remoteCmd = `
        tar -xzf /tmp/artisnova_bundle.tar.gz -C /home/${user}/artisnova/ --strip-components=0 &&
        cd /home/${user}/artisnova/web-control &&
        rm -rf node_modules &&
        npm install --omit=dev &&
        sudo systemctl restart artisnova
    `;
    execSync(`python3 automate_pty.py ${password} ssh -o StrictHostKeyChecking=no ${user}@${host} "${remoteCmd}"`, { stdio: 'inherit' });

    console.log("✅ Deployment successful!");
} catch (e) {
    console.error("❌ Deployment failed:", e.message);
}
