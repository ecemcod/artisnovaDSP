const sqlite3 = require('sqlite3').verbose();

class Album {
    constructor(data = {}) {
        this.id = data.id || null;
        this.mbid = data.mbid || null;
        this.title = data.title || '';
        this.disambiguation = data.disambiguation || null;
        this.artist_id = data.artist_id || null;
        this.release_date = data.release_date || null;
        this.release_type = data.release_type || null;
        this.status = data.status || null;
        this.label_id = data.label_id || null;
        this.catalog_number = data.catalog_number || null;
        this.barcode = data.barcode || null;
        this.artwork_url = data.artwork_url || null;
        this.track_count = data.track_count || null;
        this.disc_count = data.disc_count || 1;
        this.created_at = data.created_at || null;
        this.updated_at = data.updated_at || null;
    }

    static fromRow(row) {
        return new Album(row);
    }

    toJSON() {
        return {
            id: this.id,
            mbid: this.mbid,
            title: this.title,
            disambiguation: this.disambiguation,
            artist_id: this.artist_id,
            release_date: this.release_date,
            release_type: this.release_type,
            status: this.status,
            label_id: this.label_id,
            catalog_number: this.catalog_number,
            barcode: this.barcode,
            artwork_url: this.artwork_url,
            track_count: this.track_count,
            disc_count: this.disc_count,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

class AlbumRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM albums WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Album.fromRow(row) : null);
                }
            );
        });
    }

    async findByMbid(mbid) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM albums WHERE mbid = ?',
                [mbid],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Album.fromRow(row) : null);
                }
            );
        });
    }

    async findByTitle(title) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM albums WHERE title LIKE ? ORDER BY title',
                [`%${title}%`],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Album.fromRow(row)));
                }
            );
        });
    }

    async findByArtist(artistId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM albums WHERE artist_id = ? ORDER BY release_date DESC',
                [artistId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Album.fromRow(row)));
                }
            );
        });
    }

    async search(query, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT a.*, ar.name as artist_name
                FROM albums a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.title LIKE ? OR ar.name LIKE ?
                ORDER BY 
                    CASE 
                        WHEN a.title = ? THEN 1
                        WHEN a.title LIKE ? THEN 2
                        WHEN ar.name LIKE ? THEN 3
                        ELSE 4
                    END,
                    a.title
                LIMIT ?
            `, [
                `%${query}%`, `%${query}%`,
                query, `${query}%`, `${query}%`,
                limit
            ], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => Album.fromRow(row)));
            });
        });
    }

    async create(album) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            album.created_at = now;
            album.updated_at = now;

            this.db.run(`
                INSERT INTO albums (
                    mbid, title, disambiguation, artist_id, release_date,
                    release_type, status, label_id, catalog_number, barcode,
                    artwork_url, track_count, disc_count, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                album.mbid, album.title, album.disambiguation, album.artist_id,
                album.release_date, album.release_type, album.status, album.label_id,
                album.catalog_number, album.barcode, album.artwork_url,
                album.track_count, album.disc_count, album.created_at, album.updated_at
            ], function(err) {
                if (err) reject(err);
                else {
                    album.id = this.lastID;
                    resolve(new Album(album));
                }
            });
        });
    }

    async update(id, updates) {
        return new Promise((resolve, reject) => {
            updates.updated_at = new Date().toISOString();
            
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            this.db.run(
                `UPDATE albums SET ${fields} WHERE id = ?`,
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
                'DELETE FROM albums WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getTracks(albumId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM tracks WHERE album_id = ? ORDER BY disc_number, position',
                [albumId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getCredits(albumId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM credits WHERE album_id = ? ORDER BY role, person_name',
                [albumId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async getGenres(albumId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT g.*, ag.weight
                FROM genres g
                JOIN album_genres ag ON g.id = ag.genre_id
                WHERE ag.album_id = ?
                ORDER BY ag.weight DESC, g.name
            `, [albumId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addGenre(albumId, genreId, weight = 1) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO album_genres (album_id, genre_id, weight) VALUES (?, ?, ?)',
                [albumId, genreId, weight],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async removeGenre(albumId, genreId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM album_genres WHERE album_id = ? AND genre_id = ?',
                [albumId, genreId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getArtist(albumId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT ar.*
                FROM artists ar
                JOIN albums al ON ar.id = al.artist_id
                WHERE al.id = ?
            `, [albumId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getLabel(albumId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT l.*
                FROM labels l
                JOIN albums al ON l.id = al.label_id
                WHERE al.id = ?
            `, [albumId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = { Album, AlbumRepository };