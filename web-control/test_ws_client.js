const WebSocket = require('ws');

const ws = new WebSocket('ws://localhost:3000/ws/levels');

ws.on('open', () => {
    console.log('Connected to ws://localhost:3000/ws/levels');
});

ws.on('message', (data) => {
    console.log('Received:', data.toString());
});

ws.on('error', (err) => {
    console.error('Error:', err.message);
});

ws.on('close', () => {
    console.log('Disconnected');
});

// Keep alive for 10 seconds then exit
setTimeout(() => {
    console.log('Test finished');
    ws.close();
    process.exit(0);
}, 10000);
