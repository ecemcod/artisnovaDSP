const rc = require('./roon-controller');

rc.init((status) => {
    if (status === 'paired') {
        setTimeout(() => {
            const zones = Array.from(rc.zones.values());
            console.log(JSON.stringify(zones, null, 2));
            process.exit(0);
        }, 3000);
    }
});
