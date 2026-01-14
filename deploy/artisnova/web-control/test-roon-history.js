const RoonApi = require("node-roon-api");
const RoonApiBrowse = require("node-roon-api-browse");
const RoonApiTransport = require("node-roon-api-transport");

var core;
var roon = new RoonApi({
    extension_id: 'com.artisnova.history_probe',
    display_name: "History Probe",
    display_version: "1.0.0",
    publisher: 'Artis Nova',
    email: 'admin@artisnova.com',
    log_level: 'none',

    core_paired: function (c) {
        core = c;
        console.log("Core Paired:", core.display_name);
        browseRoot();
    },
    core_unpaired: function (c) {
        console.log("Core Unpaired");
    }
});

roon.init_services({
    required_services: [RoonApiBrowse, RoonApiTransport]
});

roon.start_discovery();

function browseRoot() {
    var opts = {
        hierarchy: "browse",
        zone_or_output_id: null,
    };

    core.services.RoonApiBrowse.browse(opts, (err, payload) => {
        if (err) { console.log(err, payload); return; }
        console.log("Root Items:");
        if (payload.items) {
            payload.items.forEach(item => {
                console.log(` - ${item.title} (${item.item_key})`);
                if (item.title === "Library" || item.title === "History" || item.title === "My History") {
                    browseItem(item.item_key, item.title);
                }
            });
        }
    });
}

function browseItem(itemKey, title) {
    console.log(`\nBrowsing: ${title}...`);
    var opts = {
        hierarchy: "browse",
        item_key: itemKey,
        zone_or_output_id: null,
    };

    core.services.RoonApiBrowse.browse(opts, (err, payload) => {
        if (err) { console.log(err, payload); return; }

        if (payload.items) {
            payload.items.forEach(item => {
                console.log(`   - ${item.title} (${item.item_key})`);
                // Drill down if it looks promising
                if (item.title === "History" || item.title === "Recent" || item.title === "Played") {
                    // Check contents of History
                    browseContents(item.item_key, item.title);
                }
            });
        }
    });
}

function browseContents(itemKey, title) {
    console.log(`\nContents of ${title}:`);
    var opts = {
        hierarchy: "browse",
        item_key: itemKey,
        zone_or_output_id: null,
        count: 10 // Just get first 10
    };

    core.services.RoonApiBrowse.load(opts, (err, payload) => {
        if (err) { console.log(err, payload); return; }
        if (payload.items) {
            payload.items.forEach(item => {
                console.log(`      -> ${item.title} - ${item.subtitle}`);
            });
        }
    });
}
