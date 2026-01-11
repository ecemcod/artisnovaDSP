const WebSocket = require('ws');
const ws = new WebSocket('ws://raspberrypi.local:1234');
ws.on('open', () => {
    ws.send('"GetConfigJson"');
});
ws.on('message', (data) => {
    console.log(JSON.stringify(JSON.parse(data), null, 2));
    process.exit(0);
});
ws.on('error', (err) => {
    console.error(err);
    process.exit(1);
});
setTimeout(() => process.exit(1), 5000);
