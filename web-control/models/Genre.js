const sqlite3 = require('sqlite3').verbose();

class Genre {
    constructor(data = {}) {
        this.id = data.id || null;
        this.name = data.name || '';
        this.parent_id = data.parent_id || null;
        this.description = data.description || null;
    }

    static fromRow(row) {
        return new Genre(row);
    }

    toJSON() {
        return {
            id: this.id,
            name: this.name,
            parent_id: this.parent_id,
            description: this.description
        };
    }
}

class GenreRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM genres WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Genre.fromRow(row) : null);
                }
            );
        });
    }

    async findByName(name) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM genres WHERE name = ?',
                [name],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? Genre.fromRow(row) : null);
                }
            );
        });
    }

    async search(query, limit = 20) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT * FROM genres 
                WHERE name LIKE ? OR description LIKE ?
                ORDER BY 
                    CASE 
                        WHEN name = ? THEN 1
                        WHEN name LIKE ? THEN 2
                        ELSE 3
                    END,
                    name
                LIMIT ?
            `, [
                `%${query}%`, `%${query}%`,
                query, `${query}%`,
                limit
            ], (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => Genre.fromRow(row)));
            });
        });
    }

    async getAll() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM genres ORDER BY name',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Genre.fromRow(row)));
                }
            );
        });
    }

    async getTopLevel() {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM genres WHERE parent_id IS NULL ORDER BY name',
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Genre.fromRow(row)));
                }
            );
        });
    }

    async getChildren(parentId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM genres WHERE parent_id = ? ORDER BY name',
                [parentId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => Genre.fromRow(row)));
                }
            );
        });
    }

    async getParent(genreId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT p.*
                FROM genres p
                JOIN genres c ON p.id = c.parent_id
                WHERE c.id = ?
            `, [genreId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? Genre.fromRow(row) : null);
            });
        });
    }

    async getHierarchy(genreId) {
        return new Promise((resolve, reject) => {
            const hierarchy = [];
            
            const getParentRecursive = (id) => {
                this.db.get(
                    'SELECT * FROM genres WHERE id = ?',
                    [id],
                    (err, row) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        
                        if (row) {
                            const genre = Genre.fromRow(row);
                            hierarchy.unshift(genre);
                            
                            if (genre.parent_id) {
                                getParentRecursive(genre.parent_id);
                            } else {
                                resolve(hierarchy);
                            }
                        } else {
                            resolve(hierarchy);
                        }
                    }
                );
            };
            
            getParentRecursive(genreId);
        });
    }

    async create(genre) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO genres (name, parent_id, description)
                VALUES (?, ?, ?)
            `, [
                genre.name, genre.parent_id, genre.description
            ], function(err) {
                if (err) reject(err);
                else {
                    genre.id = this.lastID;
                    resolve(new Genre(genre));
                }
            });
        });
    }

    async update(id, updates) {
        return new Promise((resolve, reject) => {
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            this.db.run(
                `UPDATE genres SET ${fields} WHERE id = ?`,
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
            // First check if this genre has children
            this.db.get(
                'SELECT COUNT(*) as count FROM genres WHERE parent_id = ?',
                [id],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (row.count > 0) {
                        reject(new Error('Cannot delete genre with child genres'));
                        return;
                    }
                    
                    // Delete the genre
                    this.db.run(
                        'DELETE FROM genres WHERE id = ?',
                        [id],
                        function(err) {
                            if (err) reject(err);
                            else resolve(this.changes > 0);
                        }
                    );
                }
            );
        });
    }

    async getArtists(genreId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT a.*, ag.weight
                FROM artists a
                JOIN artist_genres ag ON a.id = ag.artist_id
                WHERE ag.genre_id = ?
                ORDER BY ag.weight DESC, a.name
                LIMIT ?
            `, [genreId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getAlbums(genreId, limit = 50) {
        return new Promise((resolve, reject) => {
            this.db.all(`
                SELECT a.*, ag.weight, ar.name as artist_name
                FROM albums a
                JOIN album_genres ag ON a.id = ag.album_id
                LEFT JOIN artists ar ON a.artist_id = ar.id
                WHERE ag.genre_id = ?
                ORDER BY ag.weight DESC, a.release_date DESC
                LIMIT ?
            `, [genreId, limit], (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }

    async getStatistics(genreId) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    (SELECT COUNT(*) FROM artist_genres WHERE genre_id = ?) as artist_count,
                    (SELECT COUNT(*) FROM album_genres WHERE genre_id = ?) as album_count
            `, [genreId, genreId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async findOrCreate(name, parentId = null) {
        return new Promise(async (resolve, reject) => {
            try {
                // Try to find existing genre
                const existing = await this.findByName(name);
                if (existing) {
                    resolve(existing);
                    return;
                }
                
                // Create new genre
                const newGenre = await this.create({
                    name: name,
                    parent_id: parentId,
                    description: null
                });
                
                resolve(newGenre);
            } catch (error) {
                reject(error);
            }
        });
    }
}

module.exports = { Genre, GenreRepository };