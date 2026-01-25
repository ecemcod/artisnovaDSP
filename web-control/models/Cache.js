const sqlite3 = require('sqlite3').verbose();

class CacheEntry {
    constructor(data = {}) {
        this.id = data.id || null;
        this.cache_key = data.cache_key || '';
        this.data = data.data || '';
        this.expires_at = data.expires_at || null;
        this.created_at = data.created_at || null;
        this.access_count = data.access_count || 0;
        this.last_accessed = data.last_accessed || null;
    }

    static fromRow(row) {
        const entry = new CacheEntry(row);
        // Parse JSON data if it's a string
        if (entry.data && typeof entry.data === 'string') {
            try {
                entry.data = JSON.parse(entry.data);
            } catch (e) {
                // Keep as string if not valid JSON
            }
        }
        return entry;
    }

    toJSON() {
        return {
            id: this.id,
            cache_key: this.cache_key,
            data: this.data,
            expires_at: this.expires_at,
            created_at: this.created_at,
            access_count: this.access_count,
            last_accessed: this.last_accessed
        };
    }

    isExpired() {
        if (!this.expires_at) return false;
        return new Date(this.expires_at) < new Date();
    }
}

class CacheRepository {
    constructor(db) {
        this.db = db;
    }

    async get(key) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT * FROM cache_entries WHERE cache_key = ?',
                [key],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!row) {
                        resolve(null);
                        return;
                    }
                    
                    const entry = CacheEntry.fromRow(row);
                    
                    // Check if expired
                    if (entry.isExpired()) {
                        // Delete expired entry and return null
                        this.delete(key).catch(() => {}); // Ignore delete errors
                        resolve(null);
                        return;
                    }
                    
                    // Update access statistics
                    this.updateAccess(key).catch(() => {}); // Ignore update errors
                    
                    resolve(entry);
                }
            );
        });
    }

    async set(key, data, ttlSeconds = null) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            let expiresAt = null;
            
            if (ttlSeconds) {
                expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
            }
            
            // Serialize data if it's an object
            let serializedData = data;
            if (typeof data === 'object' && data !== null) {
                serializedData = JSON.stringify(data);
            }

            this.db.run(`
                INSERT OR REPLACE INTO cache_entries (
                    cache_key, data, expires_at, created_at, access_count, last_accessed
                ) VALUES (?, ?, ?, ?, 0, ?)
            `, [key, serializedData, expiresAt, now, now], function(err) {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    async delete(key) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM cache_entries WHERE cache_key = ?',
                [key],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async clear() {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM cache_entries',
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async exists(key) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT 1 FROM cache_entries WHERE cache_key = ? AND (expires_at IS NULL OR expires_at > ?)',
                [key, new Date().toISOString()],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(!!row);
                }
            );
        });
    }

    async updateAccess(key) {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            this.db.run(
                'UPDATE cache_entries SET access_count = access_count + 1, last_accessed = ? WHERE cache_key = ?',
                [now, key],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async cleanupExpired() {
        return new Promise((resolve, reject) => {
            const now = new Date().toISOString();
            
            this.db.run(
                'DELETE FROM cache_entries WHERE expires_at IS NOT NULL AND expires_at <= ?',
                [now],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async getStats() {
        return new Promise((resolve, reject) => {
            this.db.get(`
                SELECT 
                    COUNT(*) as total_entries,
                    COUNT(CASE WHEN expires_at IS NULL OR expires_at > ? THEN 1 END) as active_entries,
                    COUNT(CASE WHEN expires_at IS NOT NULL AND expires_at <= ? THEN 1 END) as expired_entries,
                    SUM(access_count) as total_accesses,
                    AVG(access_count) as avg_accesses,
                    MAX(last_accessed) as last_access,
                    MIN(created_at) as oldest_entry
                FROM cache_entries
            `, [new Date().toISOString(), new Date().toISOString()], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    async getTopAccessed(limit = 10) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT cache_key, access_count, last_accessed FROM cache_entries ORDER BY access_count DESC LIMIT ?',
                [limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    }

    async evictLeastUsed(count = 10) {
        return new Promise((resolve, reject) => {
            this.db.run(`
                DELETE FROM cache_entries 
                WHERE cache_key IN (
                    SELECT cache_key FROM cache_entries 
                    ORDER BY access_count ASC, last_accessed ASC 
                    LIMIT ?
                )
            `, [count], function(err) {
                if (err) reject(err);
                else resolve(this.changes);
            });
        });
    }

    async getByPattern(pattern) {
        return new Promise((resolve, reject) => {
            this.db.all(
                'SELECT * FROM cache_entries WHERE cache_key LIKE ? AND (expires_at IS NULL OR expires_at > ?)',
                [pattern, new Date().toISOString()],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows.map(row => CacheEntry.fromRow(row)));
                }
            );
        });
    }

    async deleteByPattern(pattern) {
        return new Promise((resolve, reject) => {
            this.db.run(
                'DELETE FROM cache_entries WHERE cache_key LIKE ?',
                [pattern],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes);
                }
            );
        });
    }

    async setTTL(key, ttlSeconds) {
        return new Promise((resolve, reject) => {
            const expiresAt = new Date(Date.now() + (ttlSeconds * 1000)).toISOString();
            
            this.db.run(
                'UPDATE cache_entries SET expires_at = ? WHERE cache_key = ?',
                [expiresAt, key],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.changes > 0);
                }
            );
        });
    }

    async getTTL(key) {
        return new Promise((resolve, reject) => {
            this.db.get(
                'SELECT expires_at FROM cache_entries WHERE cache_key = ?',
                [key],
                (err, row) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    
                    if (!row || !row.expires_at) {
                        resolve(-1); // No expiration
                        return;
                    }
                    
                    const expiresAt = new Date(row.expires_at);
                    const now = new Date();
                    const ttlMs = expiresAt.getTime() - now.getTime();
                    
                    if (ttlMs <= 0) {
                        resolve(0); // Expired
                    } else {
                        resolve(Math.floor(ttlMs / 1000)); // TTL in seconds
                    }
                }
            );
        });
    }
}

module.exports = { CacheEntry, CacheRepository };