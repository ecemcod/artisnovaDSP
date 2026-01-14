const db = require('./database');

console.log('Verifying database initialization...');

// Allow time for the constructor to run init()
setTimeout(() => {
    db.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='listening_history'", (err, rows) => {
        if (err) {
            console.error('Error checking table:', err);
        } else {
            console.log('Table check result:', rows);
            if (rows.length === 0) {
                console.log('Table missing! Attempting explicit init...');
                db.init();
                setTimeout(() => {
                    db.db.all("SELECT name FROM sqlite_master WHERE type='table' AND name='listening_history'", (err, rows) => {
                        console.log('Re-check table result:', rows);
                    });
                }, 1000);
            } else {
                console.log('Table exists.');
                db.db.get("SELECT COUNT(*) as count FROM listening_history", (err, row) => {
                    console.log('Record count:', row.count);
                });
            }
        }
    });
}, 1000);
