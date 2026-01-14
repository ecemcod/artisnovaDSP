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

console.log("🚀 Syncing web-control to Raspberry Pi...");

// Use rsync via SSH with password (requires sshpass or similar, but we can't easily use that)
// Alternatively, we use `python3 ssh_client.py` for commands and we'll trust SCP/RSYNC if the keys are set.
// But the keys are NOT set as we saw earlier.
// So I'll use a trick: tar the folder and send it via SSH/cat.

const tarPath = '/tmp/web-control-code.tar.gz';
// Exclude public and node_modules to keep it very small
execSync(`tar -czf "${tarPath}" --exclude='node_modules' --exclude='public' web-control`, { cwd: '/Users/manuelcouceiro/Audio Calibration/camilla' });

const encodedTar = fs.readFileSync(tarPath).toString('base64');
// Increased timeout and better command handling
const cmd = `echo "${encodedTar}" | base64 -d | tar -xzf - -C /home/${creds.user}/camilla/ && sudo systemctl restart camilla-web`;

console.log("📡 Uploading and restarting service (excluding node_modules)...");
try {
    const output = execSync(`python3 ssh_client.py ${creds.user} ${creds.host} ${creds.password} '${cmd}'`, { encoding: 'utf8', maxBuffer: 1024 * 1024 * 10 });
    console.log("Output summary:", output.substring(0, 500) + "...");
    console.log("✅ Sync complete!");
} catch (e) {
    console.error("Sync failed:", e.message);
    if (e.stdout) console.log("Stdout:", e.stdout);
    if (e.stderr) console.log("Stderr:", e.stderr);
}
