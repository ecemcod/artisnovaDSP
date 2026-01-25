const sqlite3 = require('sqlite3').verbose();

class Artist {
    constructor(data = {}) {
        this.id = data.id || null;
        this.mbid = data.mbid || null;
        this.name = data.name || '';
        this.sort_name = data.sort_name || null;
        this.disambiguation = data.disambiguation || null;
        this.type = data.type || null;
        this.gender = data.gender || null;
        this.country = data.country || null;
        this.area = data.area || null;
        this.begin_date = data.begin_date || null;
        this.end_date = data.end_date || null;
        this.biography = data.biography || null;
        this.image_url = data.image_url || null;
        this.created_at = data.created_at || null;
        this.updated_at = data.updated_at || null;
    }

    static fromRow(row) {
        return new Artist(row);
    }

    toJSON() {
        return {
            id: this.id,
            mbid: this.mbid,
            name: this.name,
            sort_name: this.sort_name,
            disambiguation: this.disambiguation,
            type: this.type,
            gender: this.gender,
            country: this.country,
            area: this.area,
            begin_date: this.begin_date,
            end_date: this.end_date,
            biography: this.biography,
            image_url: this.image_url,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

class ArtistRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM artists WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Artist.fromRow(row) : null);
                }
            );
        });
    }

    async findByMbid(mbid) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM artists WHERE mbid = ?',
                [mbid],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Artist.fromRow(row) : null);
                }
            );
        });
    }

    async findByName(name) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM artists WHERE name LIKE ? ORDER BY name',
                [`%${name}%`],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Artist.fromRow(row)));
                }
            );
        });
    }

    async search(query, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM artists 
                WHERE name LIKE ? OR sort_name LIKE ?
                ORDER BY 
                    CASE 
                        WHEN name = ? THEN 1
                        WHEN name LIKE ? THEN 2
                        WHEN sort_name LIKE ? THEN 3
                        ELSE 4
                    END,
                    name
                LIMIT ?
            `, [
                `%${query}%`, `%${query}%`,
                query, `${query}%`, `${query}%`,
                limit
            ], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => Artist.fromRow(row)));
            });
        });
    }

    async create(artist) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            artist.created_at = now;
            artist.updated_at = now;

            this.db.run(`
                INSERT INTO artists (
                    mbid, name, sort_name, disambiguation, type, gender,
                    country, area, begin_date, end_date, biography, image_url,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                artist.mbid, artist.name, artist.sort_name, artist.disambiguation,
                artist.type, artist.gender, artist.country, artist.area,
                artist.begin_date, artist.end_date, artist.biography, artist.image_url,
                artist.created_at, artist.updated_at
            ], function(err) {
                if (err) reject(err);
                else {
                    artist.id = this.lastID;
                    resolve(new Artist(artist));
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
                `UPDATE artists SET ${fields} WHERE id = ?`,
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
                'DELETE FROM artists WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getGenres(artistId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT g.*, ag.weight
                FROM genres g
                JOIN artist_genres ag ON g.id = ag.genre_id
                WHERE ag.artist_id = ?
                ORDER BY ag.weight DESC, g.name
            `, [artistId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async addGenre(artistId, genreId, weight = 1) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'INSERT OR REPLACE INTO artist_genres (artist_id, genre_id, weight) VALUES (?, ?, ?)',
                [artistId, genreId, weight],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async removeGenre(artistId, genreId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM artist_genres WHERE artist_id = ? AND genre_id = ?',
                [artistId, genreId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getAlbums(artistId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM albums WHERE artist_id = ? ORDER BY release_date DESC',
                [artistId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }
}

module.exports = { Artist, ArtistRepository };