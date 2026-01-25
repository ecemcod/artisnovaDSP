const fc = require('fast-check');

// Music entity generators for property-based testing

// Artist name generator
const artistNameArb = fc.oneof(
    fc.constantFrom(
        'The Beatles', 'Led Zeppelin', 'Pink Floyd', 'Queen', 'The Rolling Stones',
        'Bob Dylan', 'David Bowie', 'Radiohead', 'Nirvana', 'The Who',
        'Miles Davis', 'John Coltrane', 'Billie Holiday', 'Ella Fitzgerald',
        'Mozart', 'Beethoven', 'Bach', 'Chopin', 'Vivaldi'
    ),
    fc.string({ minLength: 2, maxLength: 50 }).filter(s => s.trim().length > 1)
);

// Album title generator
const albumTitleArb = fc.oneof(
    fc.constantFrom(
        'Abbey Road', 'Dark Side of the Moon', 'Led Zeppelin IV', 'Nevermind',
        'OK Computer', 'Kind of Blue', 'Pet Sounds', 'Revolver', 'The Wall',
        'Thriller', 'Back in Black', 'Hotel California', 'Rumours'
    ),
    fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0)
);

// Genre generator
const genreArb = fc.constantFrom(
    'Rock', 'Pop', 'Jazz', 'Classical', 'Electronic', 'Hip Hop', 'Country',
    'Blues', 'Folk', 'Reggae', 'Punk', 'Metal', 'Alternative', 'Indie',
    'R&B', 'Soul', 'Funk', 'Disco', 'House', 'Techno', 'Ambient'
);

// Data source generator
const dataSourceArb = fc.record({
    name: fc.constantFrom('musicbrainz', 'discogs', 'lastfm', 'itunes', 'spotify', 'wikipedia'),
    reliability: fc.float({ min: Math.fround(0.1), max: Math.fround(1.0) }).filter(x => !isNaN(x)),
    data: fc.record({
        id: fc.string({ minLength: 5, maxLength: 36 }),
        name: artistNameArb,
        confidence: fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }).filter(x => !isNaN(x))
    })
});

// Navigation step generator
const navigationStepArb = fc.record({
    entityType: fc.constantFrom('artist', 'album', 'label', 'genre'),
    entityId: fc.string({ minLength: 1, maxLength: 36 }),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() })
});

// Navigation path generator (sequence of navigation steps)
const navigationPathArb = fc.array(navigationStepArb, { minLength: 1, maxLength: 10 });

// Cache key generator
const cacheKeyArb = fc.oneof(
    fc.string({ minLength: 5, maxLength: 100 }).filter(s => !s.includes(':')),
    fc.record({
        type: fc.constantFrom('artist', 'album', 'label', 'genre', 'search'),
        query: fc.string({ minLength: 1, maxLength: 50 }),
        options: fc.record({
            limit: fc.integer({ min: 1, max: 100 }),
            offset: fc.integer({ min: 0, max: 1000 })
        }, { requiredKeys: [] })
    }).map(obj => `${obj.type}:${obj.query}:${JSON.stringify(obj.options)}`)
);

// TTL generator (time to live in seconds)
const ttlArb = fc.integer({ min: 1, max: 86400 }); // 1 second to 24 hours

// Quality score generator
const qualityScoreArb = fc.float({ min: Math.fround(0.0), max: Math.fround(1.0) }).filter(x => !isNaN(x));

// Artist data generator
const artistDataArb = fc.record({
    name: artistNameArb,
    mbid: fc.option(fc.uuid(), { nil: null }),
    biography: fc.option(fc.lorem({ maxCount: 100 }), { nil: null }),
    country: fc.option(fc.constantFrom('US', 'UK', 'DE', 'FR', 'IT', 'ES', 'CA', 'AU'), { nil: null }),
    begin_date: fc.option(fc.date({ min: new Date('1900-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]), { nil: null }),
    type: fc.option(fc.constantFrom('Person', 'Group', 'Orchestra', 'Choir'), { nil: null }),
    genres: fc.array(genreArb, { maxLength: 5 })
});

// Album data generator
const albumDataArb = fc.record({
    title: albumTitleArb,
    mbid: fc.option(fc.uuid(), { nil: null }),
    artist_name: artistNameArb,
    release_date: fc.option(fc.date({ min: new Date('1900-01-01'), max: new Date() }).map(d => d.toISOString().split('T')[0]), { nil: null }),
    release_type: fc.option(fc.constantFrom('Album', 'Single', 'EP', 'Compilation'), { nil: null }),
    track_count: fc.option(fc.integer({ min: 1, max: 50 }), { nil: null }),
    genres: fc.array(genreArb, { maxLength: 5 })
});

// API response generator
const apiResponseArb = fc.record({
    success: fc.boolean(),
    data: fc.option(fc.oneof(artistDataArb, albumDataArb), { nil: null }),
    error: fc.option(fc.string({ maxLength: 200 }), { nil: null }),
    source: fc.constantFrom('musicbrainz', 'discogs', 'lastfm', 'itunes'),
    timestamp: fc.integer({ min: Date.now() - 86400000, max: Date.now() }),
    responseTime: fc.integer({ min: 10, max: 5000 })
});

// Search query generator
const searchQueryArb = fc.oneof(
    artistNameArb,
    albumTitleArb,
    fc.string({ minLength: 1, maxLength: 50 }).filter(s => s.trim().length > 0)
);

// Entity type generator
const entityTypeArb = fc.constantFrom('artist', 'album', 'label', 'genre', 'track');

// Mock database record generators
const artistRecordArb = fc.record({
    id: fc.integer({ min: 1, max: 999999 }),
    name: artistNameArb,
    mbid: fc.option(fc.uuid(), { nil: null }),
    biography: fc.option(fc.lorem({ maxCount: 50 }), { nil: null }),
    country: fc.option(fc.constantFrom('US', 'UK', 'DE', 'FR'), { nil: null }),
    created_at: fc.date().map(d => d.toISOString()),
    updated_at: fc.date().map(d => d.toISOString())
});

const albumRecordArb = fc.record({
    id: fc.integer({ min: 1, max: 999999 }),
    title: albumTitleArb,
    mbid: fc.option(fc.uuid(), { nil: null }),
    artist_id: fc.integer({ min: 1, max: 999999 }),
    release_date: fc.option(fc.date().map(d => d.toISOString().split('T')[0]), { nil: null }),
    track_count: fc.option(fc.integer({ min: 1, max: 30 }), { nil: null }),
    created_at: fc.date().map(d => d.toISOString()),
    updated_at: fc.date().map(d => d.toISOString())
});

// Performance test data generator
const performanceTestDataArb = fc.record({
    entityType: entityTypeArb,
    entityId: fc.string({ minLength: 1, maxLength: 36 }),
    expectedMaxTime: fc.integer({ min: 100, max: 5000 }), // milliseconds
    cacheEnabled: fc.boolean(),
    concurrentRequests: fc.integer({ min: 1, max: 10 })
});

// Error scenario generator
const errorScenarioArb = fc.record({
    errorType: fc.constantFrom('network', 'timeout', 'invalid_response', 'rate_limit', 'not_found'),
    shouldRetry: fc.boolean(),
    retryCount: fc.integer({ min: 0, max: 3 }),
    fallbackAvailable: fc.boolean()
});

module.exports = {
    artistNameArb,
    albumTitleArb,
    genreArb,
    dataSourceArb,
    navigationStepArb,
    navigationPathArb,
    cacheKeyArb,
    ttlArb,
    qualityScoreArb,
    artistDataArb,
    albumDataArb,
    apiResponseArb,
    searchQueryArb,
    entityTypeArb,
    artistRecordArb,
    albumRecordArb,
    performanceTestDataArb,
    errorScenarioArb
};