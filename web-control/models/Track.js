const sqlite3 = require('sqlite3').verbose();

class Track {
    constructor(data = {}) {
        this.id = data.id || null;
        this.mbid = data.mbid || null;
        this.title = data.title || '';
        this.album_id = data.album_id || null;
        this.position = data.position || null;
        this.disc_number = data.disc_number || 1;
        this.duration = data.duration || null; // in milliseconds
        this.artist_credit = data.artist_credit || null; // JSON string
        this.created_at = data.created_at || null;
    }

    static fromRow(row) {
        const track = new Track(row);
        // Parse artist_credit JSON if it exists
        if (track.artist_credit && typeof track.artist_credit === 'string') {
            try {
                track.artist_credit = JSON.parse(track.artist_credit);
            } catch (e) {
                track.artist_credit = null;
            }
        }
        return track;
    }

    toJSON() {
        return {
            id: this.id,
            mbid: this.mbid,
            title: this.title,
            album_id: this.album_id,
            position: this.position,
            disc_number: this.disc_number,
            duration: this.duration,
            artist_credit: this.artist_credit,
            created_at: this.created_at
        };
    }

    getDurationFormatted() {
        if (!this.duration) return null;
        
        const totalSeconds = Math.floor(this.duration / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
}

class TrackRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM tracks WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Track.fromRow(row) : null);
                }
            );
        });
    }

    async findByMbid(mbid) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM tracks WHERE mbid = ?',
                [mbid],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Track.fromRow(row) : null);
                }
            );
        });
    }

    async findByAlbum(albumId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM tracks WHERE album_id = ? ORDER BY disc_number, position',
                [albumId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Track.fromRow(row)));
                }
            );
        });
    }

    async search(query, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT t.*, a.title as album_title, ar.name as artist_name
                FROM tracks t
                LEFT JOIN albums a ON t.album_id = a.id
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE t.title LIKE ? OR ar.name LIKE ?
                ORDER BY 
                    CASE 
                        WHEN t.title = ? THEN 1
                        WHEN t.title LIKE ? THEN 2
                        WHEN ar.name LIKE ? THEN 3
                        ELSE 4
                    END,
                    t.title
                LIMIT ?
            `, [
                `%${query}%`, `%${query}%`,
                query, `${query}%`, `${query}%`,
                limit
            ], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => Track.fromRow(row)));
            });
        });
    }

    async create(track) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            track.created_at = now;

            // Serialize artist_credit if it's an object
            let artistCreditJson = track.artist_credit;
            if (typeof track.artist_credit === 'object' && track.artist_credit !== null) {
                artistCreditJson = JSON.stringify(track.artist_credit);
            }

            this.db.run(`
                INSERT INTO tracks (
                    mbid, title, album_id, position, disc_number,
                    duration, artist_credit, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                track.mbid, track.title, track.album_id, track.position,
                track.disc_number, track.duration, artistCreditJson, track.created_at
            ], function(err) {
                if (err) reject(err);
                else {
                    track.id = this.lastID;
                    resolve(new Track(track));
                }
            });
        });
    }

    async update(id, updates) {
        return new Promise((resolve, reject) => {
            // Serialize artist_credit if it's an object
            if (updates.artist_credit && typeof updates.artist_credit === 'object') {
                updates.artist_credit = JSON.stringify(updates.artist_credit);
            }
            
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            this.db.run(
                `UPDATE tracks SET ${fields} WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async delete(id) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM tracks WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getCredits(trackId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM credits WHERE track_id = ? ORDER BY role, person_name',
                [trackId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async addCredit(trackId, personName, role, instrument = null) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            this.db.run(`
                INSERT INTO credits (track_id, person_name, role, instrument, created_at)
                VALUES (?, ?, ?, ?, ?)
            `, [trackId, personName, role, instrument, now], function(err) {
                if (err) reject(err);
                else resolve(this.lastID);
            });
        });
    }

    async removeCredit(creditId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM credits WHERE id = ?',
                [creditId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getAlbumInfo(trackId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT a.*, ar.name as artist_name
                FROM albums a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                JOIN tracks t ON a.id = t.album_id
                WHERE t.id = ?
            `, [trackId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = { Track, TrackRepository };