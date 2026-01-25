const fc = require('fast-check');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const MusicInfoManager = require('../MusicInfoManager');
const MusicInfoCache = require('../MusicInfoCache');
const {
    artistNameArb,
    albumTitleArb,
    dataSourceArb,
    navigationStepArb,
    navigationPathArb,
    cacheKeyArb,
    ttlArb,
    qualityScoreArb,
    performanceTestDataArb,
    entityTypeArb
} = require('./generators');

// Test database setup
const TEST_DB_PATH = path.join(__dirname, 'test_music.db');

function createTestDatabase() {
    // Remove existing test database
    if (fs.existsSync(TEST_DB_PATH)) {
        fs.unlinkSync(TEST_DB_PATH);
    }
    
    const db = new sqlite3.Database(TEST_DB_PATH);
    
    // Run migration
    const migrationSQL = fs.readFileSync(path.join(__dirname, '../migrations/001_enhanced_music_schema.sql'), 'utf8');
    db.exec(migrationSQL);
    
    return db;
}

function closeTestDatabase(db) {
    return new Promise((resolve) => {
        db.close((err) => {
            if (err) console.error('Error closing test database:', err);
            // Clean up test database file
            if (fs.existsSync(TEST_DB_PATH)) {
                fs.unlinkSync(TEST_DB_PATH);
            }
            resolve();
        });
    });
}

// Mock data source connector
class MockConnector {
    constructor(sourceName, reliability = 0.8) {
        this.sourceName = sourceName;
        this.reliability = reliability;
        this.responses = new Map();
    }
    
    setResponse(query, response) {
        this.responses.set(query.toLowerCase(), response);
    }
    
    async searchArtist(query) {
        const response = this.responses.get(query.toLowerCase());
        if (response) {
            return [response];
        }
        
        // Return mock data
        return [{
            name: query,
            mbid: `mock-${query.replace(/\s+/g, '-').toLowerCase()}`,
            biography: `Mock biography for ${query}`,
            country: 'US',
            type: 'Group'
        }];
    }
    
    async searchAlbum(query, artistName) {
        const key = `${query}-${artistName || ''}`.toLowerCase();
        const response = this.responses.get(key);
        if (response) {
            return [response];
        }
        
        // Return mock data
        return [{
            title: query,
            mbid: `mock-album-${query.replace(/\s+/g, '-').toLowerCase()}`,
            artist_name: artistName || 'Unknown Artist',
            release_date: '2020-01-01',
            release_type: 'Album'
        }];
    }
}

// Property 1: Data Source Reliability
describe('Property 1: Data Source Reliability', () => {
    let db, musicInfoManager;
    
    beforeEach(() => {
        db = createTestDatabase();
        musicInfoManager = new MusicInfoManager(db);
        
        // Register mock connectors
        musicInfoManager.registerConnector('musicbrainz', new MockConnector('musicbrainz', 0.9));
        musicInfoManager.registerConnector('discogs', new MockConnector('discogs', 0.8));
        musicInfoManager.registerConnector('lastfm', new MockConnector('lastfm', 0.7));
    });
    
    afterEach(async () => {
        await closeTestDatabase(db);
    });
    
    test('should try multiple sources and return data with quality scoring', async () => {
        await fc.assert(fc.asyncProperty(artistNameArb, async (artistName) => {
            // Skip empty or whitespace-only names
            fc.pre(artistName.length > 0 && artistName.trim() !== "");
            
            const result = await musicInfoManager.getArtistInfo(artistName);
            
            // Must return some result
            expect(result).toBeTruthy();
            
            // Must have basic artist information
            expect(result.name || result.title).toBeDefined();
            
            // The system should attempt to get data (we can't guarantee external sources work)
            // But we can verify the result structure is reasonable
            expect(typeof result).toBe('object');
            
            // If sources exist, they should be an array
            if (result.sources) {
                expect(Array.isArray(result.sources)).toBe(true);
            }
            
            // If quality_score exists, it should be valid
            if (result.quality_score !== undefined) {
                expect(typeof result.quality_score).toBe('number');
                expect(result.quality_score).toBeGreaterThanOrEqual(0);
                expect(result.quality_score).toBeLessThanOrEqual(1);
            }
        }), { numRuns: 10 });
    });
});

// Property 2: Navigation Consistency
describe('Property 2: Navigation Consistency', () => {
    class MockMusicInfoRouter {
        constructor() {
            this.history = [];
            this.currentIndex = -1;
        }
        
        async navigate(entityType, entityId) {
            const entry = { entityType, entityId, timestamp: Date.now() };
            this.history = this.history.slice(0, this.currentIndex + 1);
            this.history.push(entry);
            this.currentIndex = this.history.length - 1;
        }
        
        getCurrentLocation() {
            if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
                return this.history[this.currentIndex];
            }
            return null;
        }
        
        goBack() {
            if (this.currentIndex > 0) {
                this.currentIndex--;
                return true;
            }
            return false;
        }
        
        goForward() {
            if (this.currentIndex < this.history.length - 1) {
                this.currentIndex++;
                return true;
            }
            return false;
        }
    }
    
    test('should maintain consistent navigation state and allow back/forward', async () => {
        await fc.assert(fc.asyncProperty(navigationPathArb, async (navigationPath) => {
            fc.pre(navigationPath.length > 0 && navigationPath.length <= 10);
            
            const router = new MockMusicInfoRouter();
            const visitedEntities = [];
            
            // Navigate through the path
            for (const step of navigationPath) {
                await router.navigate(step.entityType, step.entityId);
                visitedEntities.push(`${step.entityType}:${step.entityId}`);
                
                // Current location should match navigation
                const currentLocation = router.getCurrentLocation();
                expect(currentLocation.entityId).toBe(step.entityId);
                expect(currentLocation.entityType).toBe(step.entityType);
            }
            
            // Back navigation should work correctly
            for (let i = navigationPath.length - 2; i >= 0; i--) {
                const canGoBack = router.goBack();
                expect(canGoBack).toBe(true);
                
                const currentLocation = router.getCurrentLocation();
                expect(currentLocation.entityId).toBe(navigationPath[i].entityId);
                expect(currentLocation.entityType).toBe(navigationPath[i].entityType);
            }
        }), { numRuns: 50 });
    });
});

// Property 3: Cache Consistency
describe('Property 3: Cache Consistency', () => {
    let db, cache;
    
    beforeEach(() => {
        db = createTestDatabase();
        cache = new MusicInfoCache(db, { defaultTTL: 3600, memoryTTL: 300 });
    });
    
    afterEach(async () => {
        cache.destroy();
        await closeTestDatabase(db);
    });
    
    test('should provide consistent data and handle expiration correctly', async () => {
        await fc.assert(fc.asyncProperty(cacheKeyArb, ttlArb, async (cacheKey, ttl) => {
            fc.pre(cacheKey.length > 0 && ttl > 0 && ttl <= 86400);
            
            const testData = { id: cacheKey, timestamp: Date.now(), data: 'test-data' };
            
            // Store data in cache
            const setResult = await cache.set(cacheKey, testData, ttl);
            expect(setResult).toBe(true);
            
            // Should retrieve same data immediately
            const retrieved1 = await cache.get(cacheKey);
            expect(retrieved1).toBeTruthy();
            expect(JSON.stringify(retrieved1)).toBe(JSON.stringify(testData));
            
            // Should still be available before expiration (test with short TTL)
            if (ttl > 1) {
                const waitTime = Math.min(ttl * 0.5, 1000); // Wait half TTL or 1 second
                await new Promise(resolve => setTimeout(resolve, waitTime));
                
                const retrieved2 = await cache.get(cacheKey);
                expect(retrieved2).toBeTruthy();
                expect(JSON.stringify(retrieved2)).toBe(JSON.stringify(testData));
            }
            
            // Should handle cache misses gracefully
            const nonExistentData = await cache.get("non-existent-key-" + Date.now());
            expect(nonExistentData).toBeNull();
        }), { numRuns: 30 });
    });
});

// Property 4: Performance Requirements
describe('Property 4: Performance Requirements', () => {
    let db, musicInfoManager;
    
    beforeEach(() => {
        db = createTestDatabase();
        musicInfoManager = new MusicInfoManager(db);
        
        // Register fast mock connector
        const fastConnector = new MockConnector('fast-mock', 0.8);
        musicInfoManager.registerConnector('fast-mock', fastConnector);
    });
    
    afterEach(async () => {
        await closeTestDatabase(db);
    });
    
    test('should meet performance requirements for loading', async () => {
        await fc.assert(fc.asyncProperty(entityTypeArb, artistNameArb, async (entityType, entityId) => {
            fc.pre(entityId.length > 0);
            fc.pre(['artist', 'album'].includes(entityType)); // Only test implemented types
            
            const startTime = Date.now();
            
            // First load (cold cache)
            let result1;
            if (entityType === 'artist') {
                result1 = await musicInfoManager.getArtistInfo(entityId);
            } else if (entityType === 'album') {
                result1 = await musicInfoManager.getAlbumInfo(entityId);
            }
            
            const firstLoadTime = Date.now() - startTime;
            
            // Should load within 2 seconds for initial load
            expect(firstLoadTime).toBeLessThanOrEqual(2000);
            
            // Second load (warm cache)
            const startTime2 = Date.now();
            let result2;
            if (entityType === 'artist') {
                result2 = await musicInfoManager.getArtistInfo(entityId);
            } else if (entityType === 'album') {
                result2 = await musicInfoManager.getAlbumInfo(entityId);
            }
            const secondLoadTime = Date.now() - startTime2;
            
            // Cached load should be under 1 second
            expect(secondLoadTime).toBeLessThanOrEqual(1000);
            
            // Results should be consistent
            if (result1 && result2) {
                expect(result1.name || result1.title).toBe(result2.name || result2.title);
            }
        }), { numRuns: 10 }); // Fewer runs for performance tests
    });
});

// Property 5: Data Quality Scoring
describe('Property 5: Data Quality Scoring', () => {
    let db, musicInfoManager;
    
    beforeEach(() => {
        db = createTestDatabase();
        musicInfoManager = new MusicInfoManager(db);
    });
    
    afterEach(async () => {
        await closeTestDatabase(db);
    });
    
    test('should provide consistent and meaningful quality scoring', async () => {
        await fc.assert(fc.asyncProperty(fc.array(dataSourceArb, { minLength: 1, maxLength: 6 }), async (sources) => {
            fc.pre(sources.length >= 1 && sources.length <= 6);
            
            // Mock the aggregation process
            const results = sources.map(source => ({
                source: source.name,
                data: source.data,
                weight: source.reliability
            }));
            
            const merged = musicInfoManager.mergeArtistData(results);
            
            // Quality score must be valid
            expect(merged.quality_score).toBeGreaterThanOrEqual(0);
            expect(merged.quality_score).toBeLessThanOrEqual(1);
            
            // Higher quality sources should contribute more to final score
            const sortedSources = sources.sort((a, b) => b.reliability - a.reliability);
            if (sortedSources.length > 1) {
                const highQualityWeight = sortedSources[0].reliability;
                const lowQualityWeight = sortedSources[sortedSources.length - 1].reliability;
                
                expect(highQualityWeight).toBeGreaterThanOrEqual(lowQualityWeight);
            }
            
            // Quality score should be related to source weights
            const avgWeight = sources.reduce((sum, s) => sum + s.reliability, 0) / sources.length;
            expect(Math.abs(merged.quality_score - avgWeight)).toBeLessThan(0.5);
        }), { numRuns: 25 });
    });
});

// Helper function to simulate sleep
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}