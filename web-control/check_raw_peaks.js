const WebSocket = require('ws');
const ws = new WebSocket('ws://localhost:5005');

ws.on('open', () => {
    console.log('Connected to 5005');
    ws.send('"GetCaptureSignalPeak"');
});

ws.on('message', (data) => {
    console.log('Raw message:', data.toString());
    process.exit(0);
});

ws.on('error', (err) => {
    console.error('Error:', err.message);
    process.exit(1);
});

setTimeout(() => {
    console.log('Timeout');
    process.exit(1);
}, 5000);
