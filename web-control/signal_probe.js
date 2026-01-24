
const WebSocket = require('ws');

async function probe() {
    const ws = new WebSocket('ws://127.0.0.1:5005');

    ws.on('open', () => {
        console.log('Connected to CamillaDSP');
        // Initial request to get state and confirm communication
        ws.send(JSON.stringify("GetCaptureSignalPeak"));
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data);
        console.log('Signal Peak Response:', JSON.stringify(msg, null, 2));

        if (msg.GetCaptureSignalPeak && msg.GetCaptureSignalPeak.result === "Ok") {
            const peaks = msg.GetCaptureSignalPeak.value;
            console.log(`Current Peaks: L=${peaks[0]} dB, R=${peaks[1]} dB`);

            if (peaks[0] > -100 || peaks[1] > -100) {
                console.log('AUDIO DETECTED!');
            } else {
                console.log('SILENCE detected.');
            }
        }

        // Exit after one probe
        ws.close();
        process.exit(0);
    });

    ws.on('error', (err) => {
        console.error('WebSocket Error:', err);
        process.exit(1);
    });

    // Timeout
    setTimeout(() => {
        console.error('Probe timeout');
        process.exit(1);
    }, 5000);
}

probe();
