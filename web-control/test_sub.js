const RoonApi = require("node-roon-api");
const RoonApiTransport = require("node-roon-api-transport");

const roon = new RoonApi({
    extension_id: 'com.test.queue',
    display_name: 'Queue Test',
    display_version: '1.0.0',
    publisher: 'Test',
    email: 'test@test.com',
    core_paired: (core) => {
        const transport = core.services.RoonApiTransport;
        transport.subscribe_zones((status, data) => {
            if (status === "Subscribed" && data.zones) {
                const zone = data.zones[0];
                if (zone) {
                    console.log(`Subscribing to queue for ${zone.display_name}`);
                    const sub = transport.subscribe_queue(zone, { subscription_key: Date.now() }, (s, d) => {
                        console.log(`Queue Status: ${s}`);
                    });
                    console.log(`Subscription return value type: ${typeof sub}`);
                    console.log(`Subscription return value: ${sub}`);
                    process.exit(0);
                }
            }
        });
    },
    core_unpaired: (core) => {
        console.log("Unpaired");
    }
});

roon.init_services({
    required_services: [RoonApiTransport]
});

roon.start_discovery();
setTimeout(() => { console.log("Timeout"); process.exit(1); }, 10000);
