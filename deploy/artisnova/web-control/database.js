const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'history.db');

class Database {
    constructor() {
        this.db = new sqlite3.Database(DB_PATH, (err) => {
            if (err) {
                console.error('Database: Could not connect to database', err);
            } else {
                console.log('Database: Connected to SQLite database');
                this.init();
            }
        });
    }

    init() {
        this.db.serialize(() => {
            this.db.run(`
                CREATE TABLE IF NOT EXISTS listening_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    track TEXT,
                    artist TEXT,
                    album TEXT,
                    style TEXT,
                    source TEXT,
                    device TEXT,
                    artwork_url TEXT,
                    timestamp INTEGER,
                    duration_listened INTEGER
                )
            `);

            // Migration: Add device column if it doesn't exist
            this.db.run("ALTER TABLE listening_history ADD COLUMN device TEXT", (err) => {
                if (err && !err.message.includes('duplicate column')) console.log('Database migration note:', err.message);
            });

            // Migration: Add artwork_url column if it doesn't exist
            this.db.run("ALTER TABLE listening_history ADD COLUMN artwork_url TEXT", (err) => {
                if (err && !err.message.includes('duplicate column')) console.log('Database migration note:', err.message);
            });
        });
    }

    saveTrack(track) {
        return new Promise((resolve, reject) => {
            const { title, artist, album, style, source, device, artworkUrl, timestamp, durationListened } = track;
            this.db.run(`
                INSERT INTO listening_history (track, artist, album, style, source, device, artwork_url, timestamp, duration_listened)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [title, artist, album, style, source, device, artworkUrl, timestamp, durationListened], function (err) {
                if (err) {
                    console.error('Database: Error saving track', err);
                    reject(err);
                } else {
                    console.log(`Database: Saved "${title}" by ${artist} [${style}]`);
                    resolve(this.lastID);
                }
            });
        });
    }

    getStats(range) {
        return new Promise((resolve, reject) => {
            let timeFilter = 0;
            const now = Math.floor(Date.now() / 1000);

            switch (range) {
                case 'week':
                    timeFilter = now - (7 * 24 * 60 * 60);
                    break;
                case 'month':
                    timeFilter = now - (30 * 24 * 60 * 60);
                    break;
                case 'year':
                    timeFilter = now - (365 * 24 * 60 * 60);
                    break;
                case 'all':
                default:
                    timeFilter = 0;
            }

            // Enhanced query to get the most common artwork for the item
            // CHANGED: Use SUM(duration_listened) instead of COUNT(*)
            const queryTop = (column) => `
                SELECT ${column} as name, SUM(duration_listened) as count, MAX(artwork_url) as image
                FROM listening_history 
                WHERE timestamp > ? AND ${column} IS NOT NULL AND ${column} != ''
                GROUP BY ${column} 
                ORDER BY count DESC 
                LIMIT 10
            `;

            const stats = {};

            this.db.serialize(() => {
                // Get total duration for the period
                this.db.get(`SELECT SUM(duration_listened) as total FROM listening_history WHERE timestamp > ?`, [timeFilter], (err, row) => {
                    if (!err && row) {
                        stats.totalTracks = row.total || 0; // Keeping property name 'totalTracks' in JSON to avoid breaking frontend type initially, but semantically it is now 'totalSeconds'
                    } else {
                        stats.totalTracks = 0;
                    }
                });

                this.db.all(queryTop('artist'), [timeFilter], (err, rows) => {
                    if (err) return reject(err);
                    stats.topArtists = rows;
                });

                this.db.all(queryTop('album'), [timeFilter], (err, rows) => {
                    if (err) return reject(err);
                    stats.topAlbums = rows;
                });

                // Style query
                this.db.all(`
                    SELECT style as name, SUM(duration_listened) as count 
                    FROM listening_history 
                    WHERE timestamp > ? AND style IS NOT NULL AND style != ''
                    GROUP BY style 
                    ORDER BY count DESC 
                    LIMIT 10
                `, [timeFilter], (err, rows) => {
                    if (err) return reject(err);
                    stats.topStyles = rows;

                    // Resolve after the last query
                    resolve(stats);
                });
            });
        });
    }

    getHistory(limit = 50, offset = 0) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM listening_history 
                ORDER BY timestamp DESC 
                LIMIT ? OFFSET ?
            `, [limit, offset], (err, rows) => {
                if (err) {
                    console.error('Database: Error getting history', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }
}

module.exports = new Database();
