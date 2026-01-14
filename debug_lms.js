const LMSController = require('./web-control/lms-controller');
const lms = new LMSController({ host: 'raspberrypi.local', port: 9000 });

async function check() {
    console.log("Fetching LMS players...");
    const players = await lms.getPlayers();
    console.log(JSON.stringify(players, null, 2));
}

check();
