const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:1234');

ws.on('open', function open() {
    console.log('Connected to CamillaDSP WS');
    setInterval(() => {
        ws.send('"GetCaptureSignalPeak"');
    }, 100);
});

ws.on('message', function incoming(data) {
    console.log('Received:', data.toString());
});

ws.on('error', function error(err) {
    console.error('WS Error:', err);
});
