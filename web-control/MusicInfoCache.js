const { CacheRepository } = require('./models/Cache');

class MusicInfoCache {
    constructor(db, options = {}) {
        this.cacheRepo = new CacheRepository(db);
        this.memoryCache = new Map();
        this.options = {
            maxMemoryEntries: options.maxMemoryEntries || 1000,
            defaultTTL: options.defaultTTL || 3600, // 1 hour
            memoryTTL: options.memoryTTL || 300, // 5 minutes
            cleanupInterval: options.cleanupInterval || 300000, // 5 minutes
            ...options
        };
        
        // Start cleanup interval
        this.startCleanupInterval();
    }

    async get(key, fetcher = null) {
        try {
            // 1. Check memory cache first
            const memoryEntry = this.memoryCache.get(key);
            if (memoryEntry && !this.isMemoryEntryExpired(memoryEntry)) {
                console.log(`MusicInfoCache: Memory cache hit for "${key}"`);
                return memoryEntry.data;
            }

            // 2. Check persistent cache
            const persistentEntry = await this.cacheRepo.get(key);
            if (persistentEntry) {
                console.log(`MusicInfoCache: Persistent cache hit for "${key}"`);
                
                // Promote to memory cache
                this.setMemoryCache(key, persistentEntry.data, this.options.memoryTTL);
                
                return persistentEntry.data;
            }

            // 3. Fetch from source if fetcher provided
            if (fetcher && typeof fetcher === 'function') {
                console.log(`MusicInfoCache: Cache miss for "${key}", fetching from source`);
                
                const data = await fetcher();
                if (data !== null && data !== undefined) {
                    // Store in both caches
                    await this.set(key, data, this.options.defaultTTL);
                    return data;
                }
            }

            return null;
        } catch (error) {
            console.error(`MusicInfoCache: Error getting cache entry for "${key}":`, error);
            return null;
        }
    }

    async set(key, data, ttlSeconds = null) {
        try {
            const ttl = ttlSeconds || this.options.defaultTTL;
            
            // Store in persistent cache
            await this.cacheRepo.set(key, data, ttl);
            
            // Store in memory cache
            this.setMemoryCache(key, data, Math.min(ttl, this.options.memoryTTL));
            
            console.log(`MusicInfoCache: Cached "${key}" with TTL ${ttl}s`);
            return true;
        } catch (error) {
            console.error(`MusicInfoCache: Error setting cache entry for "${key}":`, error);
            return false;
        }
    }

    async delete(key) {
        try {
            // Remove from memory cache
            this.memoryCache.delete(key);
            
            // Remove from persistent cache
            const result = await this.cacheRepo.delete(key);
            
            console.log(`MusicInfoCache: Deleted "${key}"`);
            return result;
        } catch (error) {
            console.error(`MusicInfoCache: Error deleting cache entry for "${key}":`, error);
            return false;
        }
    }

    async exists(key) {
        try {
            // Check memory cache first
            const memoryEntry = this.memoryCache.get(key);
            if (memoryEntry && !this.isMemoryEntryExpired(memoryEntry)) {
                return true;
            }

            // Check persistent cache
            return await this.cacheRepo.exists(key);
        } catch (error) {
            console.error(`MusicInfoCache: Error checking cache existence for "${key}":`, error);
            return false;
        }
    }

    async clear(pattern = null) {
        try {
            if (pattern) {
                // Clear memory cache entries matching pattern
                for (const [key] of this.memoryCache) {
                    if (this.matchesPattern(key, pattern)) {
                        this.memoryCache.delete(key);
                    }
                }
                
                // Clear persistent cache entries matching pattern
                return await this.cacheRepo.deleteByPattern(pattern);
            } else {
                // Clear all
                this.memoryCache.clear();
                return await this.cacheRepo.clear();
            }
        } catch (error) {
            console.error(`MusicInfoCache: Error clearing cache:`, error);
            return 0;
        }
    }

    async getStats() {
        try {
            const persistentStats = await this.cacheRepo.getStats();
            const memoryStats = {
                memory_entries: this.memoryCache.size,
                memory_max_entries: this.options.maxMemoryEntries,
                memory_usage_percent: (this.memoryCache.size / this.options.maxMemoryEntries) * 100
            };
            
            return {
                ...persistentStats,
                ...memoryStats
            };
        } catch (error) {
            console.error('MusicInfoCache: Error getting cache stats:', error);
            return null;
        }
    }

    // Preload related content
    async preloadRelated(entityType, entityId, preloadTasks = []) {
        try {
            console.log(`MusicInfoCache: Preloading related content for ${entityType}:${entityId}`);
            
            const preloadPromises = preloadTasks.map(async (task) => {
                try {
                    const cacheKey = task.cacheKey || `${task.type}:${task.id}`;
                    const exists = await this.exists(cacheKey);
                    
                    if (!exists && task.fetcher) {
                        console.log(`MusicInfoCache: Preloading ${cacheKey}`);
                        const data = await task.fetcher();
                        if (data) {
                            await this.set(cacheKey, data, task.ttl || this.options.defaultTTL);
                        }
                    }
                } catch (error) {
                    console.warn(`MusicInfoCache: Preload failed for ${task.type}:${task.id}:`, error.message);
                }
            });
            
            await Promise.allSettled(preloadPromises);
            console.log(`MusicInfoCache: Preload completed for ${entityType}:${entityId}`);
        } catch (error) {
            console.error(`MusicInfoCache: Error preloading related content:`, error);
        }
    }

    // Memory cache management
    setMemoryCache(key, data, ttlSeconds) {
        // Check if we need to evict entries
        if (this.memoryCache.size >= this.options.maxMemoryEntries) {
            this.evictLeastRecentlyUsed();
        }
        
        const entry = {
            data: data,
            timestamp: Date.now(),
            expiresAt: Date.now() + (ttlSeconds * 1000),
            accessCount: 0
        };
        
        this.memoryCache.set(key, entry);
    }

    isMemoryEntryExpired(entry) {
        return Date.now() > entry.expiresAt;
    }

    evictLeastRecentlyUsed() {
        let oldestKey = null;
        let oldestTime = Date.now();
        
        for (const [key, entry] of this.memoryCache) {
            if (entry.timestamp < oldestTime) {
                oldestTime = entry.timestamp;
                oldestKey = key;
            }
        }
        
        if (oldestKey) {
            this.memoryCache.delete(oldestKey);
            console.log(`MusicInfoCache: Evicted LRU entry "${oldestKey}"`);
        }
    }

    cleanupMemoryCache() {
        const now = Date.now();
        const expiredKeys = [];
        
        for (const [key, entry] of this.memoryCache) {
            if (now > entry.expiresAt) {
                expiredKeys.push(key);
            }
        }
        
        for (const key of expiredKeys) {
            this.memoryCache.delete(key);
        }
        
        if (expiredKeys.length > 0) {
            console.log(`MusicInfoCache: Cleaned up ${expiredKeys.length} expired memory entries`);
        }
    }

    startCleanupInterval() {
        this.cleanupInterval = setInterval(async () => {
            try {
                // Cleanup memory cache
                this.cleanupMemoryCache();
                
                // Cleanup persistent cache
                const expiredCount = await this.cacheRepo.cleanupExpired();
                if (expiredCount > 0) {
                    console.log(`MusicInfoCache: Cleaned up ${expiredCount} expired persistent entries`);
                }
            } catch (error) {
                console.error('MusicInfoCache: Error during cleanup:', error);
            }
        }, this.options.cleanupInterval);
    }

    stopCleanupInterval() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }

    matchesPattern(key, pattern) {
        // Simple pattern matching with wildcards
        const regex = new RegExp(pattern.replace(/\*/g, '.*'));
        return regex.test(key);
    }

    // Generate cache keys
    static generateArtistKey(query, options = {}) {
        return `artist:${query}:${JSON.stringify(options)}`;
    }

    static generateAlbumKey(query, artistName = null, options = {}) {
        return `album:${query}:${artistName || ''}:${JSON.stringify(options)}`;
    }

    static generateLabelKey(query, options = {}) {
        return `label:${query}:${JSON.stringify(options)}`;
    }

    static generateGenreKey(query, options = {}) {
        return `genre:${query}:${JSON.stringify(options)}`;
    }

    static generateSearchKey(query, type, options = {}) {
        return `search:${type}:${query}:${JSON.stringify(options)}`;
    }

    // Batch operations
    async getMultiple(keys) {
        const results = {};
        
        for (const key of keys) {
            try {
                results[key] = await this.get(key);
            } catch (error) {
                console.warn(`MusicInfoCache: Error getting "${key}":`, error.message);
                results[key] = null;
            }
        }
        
        return results;
    }

    async setMultiple(entries) {
        const results = {};
        
        for (const [key, data, ttl] of entries) {
            try {
                results[key] = await this.set(key, data, ttl);
            } catch (error) {
                console.warn(`MusicInfoCache: Error setting "${key}":`, error.message);
                results[key] = false;
            }
        }
        
        return results;
    }

    // Destroy cache instance
    destroy() {
        this.stopCleanupInterval();
        this.memoryCache.clear();
    }
}

module.exports = MusicInfoCache;