const sqlite3 = require('sqlite3').verbose();

class DataSource {
    constructor(data = {}) {
        this.id = data.id || null;
        this.entity_type = data.entity_type || '';
        this.entity_id = data.entity_id || null;
        this.source_name = data.source_name || '';
        this.source_id = data.source_id || null;
        this.quality_score = data.quality_score || 0.5;
        this.last_updated = data.last_updated || null;
        this.data_hash = data.data_hash || null;
    }

    static fromRow(row) {
        return new DataSource(row);
    }

    toJSON() {
        return {
            id: this.id,
            entity_type: this.entity_type,
            entity_id: this.entity_id,
            source_name: this.source_name,
            source_id: this.source_id,
            quality_score: this.quality_score,
            last_updated: this.last_updated,
            data_hash: this.data_hash
        };
    }
}

class DataSourceRepository {
    constructor(db) {
        this.db = db;
    }

    async findById(id) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM data_sources WHERE id = ?',
                [id],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? DataSource.fromRow(row) : null);
                }
            );
        });
    }

    async findByEntity(entityType, entityId) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM data_sources WHERE entity_type = ? AND entity_id = ? ORDER BY quality_score DESC',
                [entityType, entityId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => DataSource.fromRow(row)));
                }
            );
        });
    }

    async findBySource(sourceName, entityType = null) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM data_sources WHERE source_name = ?';
            let params = [sourceName];
            
            if (entityType) {
                query += ' AND entity_type = ?';
                params.push(entityType);
            }
            
            query += ' ORDER BY last_updated DESC';
            
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => DataSource.fromRow(row)));
            });
        });
    }

    async findByEntityAndSource(entityType, entityId, sourceName) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM data_sources WHERE entity_type = ? AND entity_id = ? AND source_name = ?',
                [entityType, entityId, sourceName],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? DataSource.fromRow(row) : null);
                }
            );
        });
    }

    async create(dataSource) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            dataSource.last_updated = now;

            this.db.run(`
                INSERT INTO data_sources (
                    entity_type, entity_id, source_name, source_id,
                    quality_score, last_updated, data_hash
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
                dataSource.entity_type, dataSource.entity_id, dataSource.source_name,
                dataSource.source_id, dataSource.quality_score, dataSource.last_updated,
                dataSource.data_hash
            ], function(err) {
                if (err) reject(err);
                else {
                    dataSource.id = this.lastID;
                    resolve(new DataSource(dataSource));
                }
            });
        });
    }

    async update(id, updates) {
        return new Promise((resolve, reject) => {
            updates.last_updated = new Date().toISOString();
            
            const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
            const values = Object.values(updates);
            values.push(id);

            this.db.run(
                `UPDATE data_sources SET ${fields} WHERE id = ?`,
                values,
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async upsert(dataSource) {
        return new Promise(async (resolve, reject) => {
            try {
                const existing = await this.findByEntityAndSource(
                    dataSource.entity_type,
                    dataSource.entity_id,
                    dataSource.source_name
                );
                
                if (existing) {
                    const updated = await this.update(existing.id, {
                        source_id: dataSource.source_id,
                        quality_score: dataSource.quality_score,
                        data_hash: dataSource.data_hash
                    });
                    
                    if (updated) {
                        const result = await this.findById(existing.id);
                        resolve(result);
                    } else {
                        reject(new Error('Failed to update data source'));
                    }
                } else {
                    const created = await this.create(dataSource);
                    resolve(created);
                }
            } catch (error) {
                reject(error);
            }
        });
    }

    async delete(id) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM data_sources WHERE id = ?',
                [id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async deleteByEntity(entityType, entityId) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM data_sources WHERE entity_type = ? AND entity_id = ?',
                [entityType, entityId],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async getBestSource(entityType, entityId) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM data_sources WHERE entity_type = ? AND entity_id = ? ORDER BY quality_score DESC LIMIT 1',
                [entityType, entityId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row ? DataSource.fromRow(row) : null);
                }
            );
        });
    }

    async getSourceStatistics(sourceName) {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    COUNT(*) as total_entries,
                    AVG(quality_score) as avg_quality,
                    MIN(quality_score) as min_quality,
                    MAX(quality_score) as max_quality,
                    COUNT(DISTINCT entity_type) as entity_types,
                    MAX(last_updated) as last_update
                FROM data_sources 
                WHERE source_name = ?
            `, [sourceName], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getStaleEntries(sourceName, maxAge = 86400000) { // 24 hours in milliseconds
        return new Promise((resolve, reject) => {
            const cutoffDate = new Date(Date.now() - maxAge).toISOString();
            
            this.db.all(
                'SELECT * FROM data_sources WHERE source_name = ? AND last_updated < ? ORDER BY last_updated',
                [sourceName, cutoffDate],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => DataSource.fromRow(row)));
                }
            );
        });
    }

    async updateQualityScore(id, newScore) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'UPDATE data_sources SET quality_score = ?, last_updated = ? WHERE id = ?',
                [newScore, new Date().toISOString(), id],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getQualityDistribution(sourceName = null) {
        return new Promise((resolve, reject) => {
            let query = `
                SELECT 
                    CASE 
                        WHEN quality_score >= 0.8 THEN 'high'
                        WHEN quality_score >= 0.6 THEN 'medium'
                        WHEN quality_score >= 0.4 THEN 'low'
                        ELSE 'very_low'
                    END as quality_range,
                    COUNT(*) as count
                FROM data_sources
            `;
            
            let params = [];
            if (sourceName) {
                query += ' WHERE source_name = ?';
                params.push(sourceName);
            }
            
            query += ' GROUP BY quality_range ORDER BY quality_score DESC';
            
            this.db.all(query, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
}

module.exports = { DataSource, DataSourceRepository };