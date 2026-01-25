const sqlite3 = require('sqlite3').verbose();

class Label {
    constructor(data = {}) {
        this.id = data.id || null;
        this.mbid = data.mbid || null;
        this.name = data.name || '';
        this.sort_name = data.sort_name || null;
        this.type = data.type || null;
        this.label_code = data.label_code || null;
        this.country = data.country || null;
        this.founded_year = data.founded_year || null;
        this.dissolved_year = data.dissolved_year || null;
        this.description = data.description || null;
        this.website = data.website || null;
        this.created_at = data.created_at || null;
        this.updated_at = data.updated_at || null;
    }

    static fromRow(row) {
        return new Label(row);
    }

    toJSON() {
        return {
            id: this.id,
            mbid: this.mbid,
            name: this.name,
            sort_name: this.sort_name,
            type: this.type,
            label_code: this.label_code,
            country: this.country,
            founded_year: this.founded_year,
            dissolved_year: this.dissolved_year,
            description: this.description,
            website: this.website,
            created_at: this.created_at,
            updated_at: this.updated_at
        };
    }
}

class LabelRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM labels WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Label.fromRow(row) : null);
                }
            );
        });
    }

    async findByMbid(mbid) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM labels WHERE mbid = ?',
                [mbid],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Label.fromRow(row) : null);
                }
            );
        });
    }

    async findByName(name) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM labels WHERE name LIKE ? ORDER BY name',
                [`%${name}%`],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Label.fromRow(row)));
                }
            );
        });
    }

    async search(query, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM labels 
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
                else resolve(rows.map(row => Label.fromRow(row)));
            });
        });
    }

    async create(label) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            label.created_at = now;
            label.updated_at = now;

            this.db.run(`
                INSERT INTO labels (
                    mbid, name, sort_name, type, label_code, country,
                    founded_year, dissolved_year, description, website,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                label.mbid, label.name, label.sort_name, label.type,
                label.label_code, label.country, label.founded_year,
                label.dissolved_year, label.description, label.website,
                label.created_at, label.updated_at
            ], function(err) {
                if (err) reject(err);
                else {
                    label.id = this.lastID;
                    resolve(new Label(label));
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
                `UPDATE labels SET ${fields} WHERE id = ?`,
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
                'DELETE FROM labels WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getReleases(labelId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT a.*, ar.name as artist_name
                FROM albums a
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE a.label_id = ?
                ORDER BY a.release_date DESC
                LIMIT ?
            `, [labelId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getArtists(labelId) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT DISTINCT ar.*
                FROM artists ar
                JOIN albums a ON ar.id = a.artist_id
                WHERE a.label_id = ?
                ORDER BY ar.name
            `, [labelId], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getStatistics(labelId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    COUNT(DISTINCT a.id) as total_releases,
                    COUNT(DISTINCT a.artist_id) as total_artists,
                    MIN(a.release_date) as first_release,
                    MAX(a.release_date) as latest_release
                FROM albums a
                WHERE a.label_id = ?
            `, [labelId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }
}

module.exports = { Label, LabelRepository };