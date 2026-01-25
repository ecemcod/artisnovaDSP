# Music Information Enhancement - Design Document

## 1. Architecture Overview

### 1.1 System Architecture
The enhanced music information system follows a layered architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend Layer                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   Music Info    │ │   Navigation    │ │     Search      ││
│  │   Components    │ │    Router       │ │   Interface     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   API Gateway Layer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   Music Info    │ │     Cache       │ │   Data Source   ││
│  │   Controller    │ │   Manager       │ │   Aggregator    ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                  Data Service Layer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   MusicBrainz   │ │    Discogs      │ │    Last.fm      ││
│  │   Connector     │ │   Connector     │ │   Connector     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │     iTunes      │ │    Spotify      │ │   Wikipedia     ││
│  │   Connector     │ │   Connector     │ │   Connector     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Storage Layer                             │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐│
│  │   SQLite DB     │ │   File Cache    │ │   Image Cache   ││
│  │   (Metadata)    │ │   (JSON Data)   │ │   (Artwork)     ││
│  └─────────────────┘ └─────────────────┘ └─────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Core Components

#### 1.2.1 Music Information Manager
- **Purpose**: Central orchestrator for music metadata operations
- **Responsibilities**: 
  - Coordinate data fetching from multiple sources
  - Implement data quality scoring and source prioritization
  - Manage caching strategies and cache invalidation
  - Handle error recovery and fallback mechanisms

#### 1.2.2 Navigation Router
- **Purpose**: Handle client-side routing for music information views
- **Responsibilities**:
  - Manage navigation state and history
  - Implement deep linking and URL generation
  - Handle breadcrumb navigation
  - Support search and filtering

#### 1.2.3 Data Source Connectors
- **Purpose**: Abstract external API interactions
- **Responsibilities**:
  - Implement rate limiting and retry logic
  - Handle API-specific data transformation
  - Manage authentication and API keys
  - Provide consistent error handling

## 2. Database Design

### 2.1 Enhanced Schema

```sql
-- Artists table with comprehensive metadata
CREATE TABLE artists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,           -- MusicBrainz ID
    name TEXT NOT NULL,
    sort_name TEXT,
    disambiguation TEXT,
    type TEXT,                  -- Person, Group, Orchestra, etc.
    gender TEXT,
    country TEXT,
    area TEXT,
    begin_date TEXT,
    end_date TEXT,
    biography TEXT,
    image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Albums/Releases table
CREATE TABLE albums (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    title TEXT NOT NULL,
    disambiguation TEXT,
    artist_id INTEGER,
    release_date TEXT,
    release_type TEXT,          -- Album, Single, EP, etc.
    status TEXT,                -- Official, Promotion, etc.
    label_id INTEGER,
    catalog_number TEXT,
    barcode TEXT,
    artwork_url TEXT,
    track_count INTEGER,
    disc_count INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    FOREIGN KEY (label_id) REFERENCES labels(id)
);

-- Record Labels table
CREATE TABLE labels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    name TEXT NOT NULL,
    sort_name TEXT,
    type TEXT,                  -- Original Production, Bootleg Production, etc.
    label_code INTEGER,
    country TEXT,
    founded_year INTEGER,
    dissolved_year INTEGER,
    description TEXT,
    website TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Tracks table
CREATE TABLE tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mbid TEXT UNIQUE,
    title TEXT NOT NULL,
    album_id INTEGER,
    position INTEGER,
    disc_number INTEGER DEFAULT 1,
    duration INTEGER,           -- in milliseconds
    artist_credit TEXT,         -- JSON array of credited artists
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (album_id) REFERENCES albums(id)
);

-- Genres and Tags
CREATE TABLE genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL,
    parent_id INTEGER,          -- For hierarchical genres
    description TEXT,
    FOREIGN KEY (parent_id) REFERENCES genres(id)
);

-- Many-to-many relationships
CREATE TABLE artist_genres (
    artist_id INTEGER,
    genre_id INTEGER,
    weight INTEGER DEFAULT 1,   -- Relevance weight
    PRIMARY KEY (artist_id, genre_id),
    FOREIGN KEY (artist_id) REFERENCES artists(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
);

CREATE TABLE album_genres (
    album_id INTEGER,
    genre_id INTEGER,
    weight INTEGER DEFAULT 1,
    PRIMARY KEY (album_id, genre_id),
    FOREIGN KEY (album_id) REFERENCES albums(id),
    FOREIGN KEY (genre_id) REFERENCES genres(id)
);

-- Credits and Personnel
CREATE TABLE credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    track_id INTEGER,
    album_id INTEGER,           -- For album-level credits
    person_name TEXT NOT NULL,
    role TEXT NOT NULL,         -- Producer, Engineer, Composer, etc.
    instrument TEXT,            -- If applicable
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (track_id) REFERENCES tracks(id),
    FOREIGN KEY (album_id) REFERENCES albums(id)
);

-- Data source tracking and quality
CREATE TABLE data_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,  -- artist, album, track, etc.
    entity_id INTEGER NOT NULL,
    source_name TEXT NOT NULL,  -- musicbrainz, discogs, lastfm, etc.
    source_id TEXT,             -- ID in the external system
    quality_score REAL DEFAULT 0.5,
    last_updated DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_hash TEXT              -- For change detection
);

-- Cache management
CREATE TABLE cache_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cache_key TEXT UNIQUE NOT NULL,
    data TEXT NOT NULL,         -- JSON data
    expires_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 0,
    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User interactions and preferences
CREATE TABLE user_corrections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    field_name TEXT NOT NULL,
    original_value TEXT,
    corrected_value TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX idx_artists_name ON artists(name);
CREATE INDEX idx_artists_mbid ON artists(mbid);
CREATE INDEX idx_albums_title ON albums(title);
CREATE INDEX idx_albums_artist ON albums(artist_id);
CREATE INDEX idx_tracks_album ON tracks(album_id);
CREATE INDEX idx_data_sources_entity ON data_sources(entity_type, entity_id);
CREATE INDEX idx_cache_key ON cache_entries(cache_key);
CREATE INDEX idx_cache_expires ON cache_entries(expires_at);
```

### 2.2 Data Quality Scoring

Data quality scores are calculated based on:
- **Source Reliability**: MusicBrainz (0.9), Discogs (0.8), Last.fm (0.7), etc.
- **Data Completeness**: More complete records get higher scores
- **Freshness**: Recently updated data scores higher
- **User Validation**: User-confirmed data gets bonus points
- **Cross-Source Consistency**: Data confirmed by multiple sources scores higher

## 3. API Design

### 3.1 REST Endpoints

```typescript
// Enhanced music information endpoints
GET /api/music/artist/:id
GET /api/music/artist/search?q=:query
GET /api/music/artist/:id/albums
GET /api/music/artist/:id/similar
GET /api/music/artist/:id/biography

GET /api/music/album/:id
GET /api/music/album/search?q=:query
GET /api/music/album/:id/tracks
GET /api/music/album/:id/credits
GET /api/music/album/:id/reviews

GET /api/music/label/:id
GET /api/music/label/search?q=:query
GET /api/music/label/:id/releases

GET /api/music/genre/:id
GET /api/music/genre/:id/artists
GET /api/music/genre/:id/albums

// Navigation and discovery
GET /api/music/discover/similar-artists/:id
GET /api/music/discover/related-albums/:id
GET /api/music/discover/genre-network/:id

// Search and filtering
GET /api/music/search?q=:query&type=:type&filters=:filters
GET /api/music/autocomplete?q=:query

// Cache and performance
POST /api/music/preload
GET /api/music/cache/stats
DELETE /api/music/cache/:key
```

### 3.2 Data Source Integration

#### 3.2.1 MusicBrainz Integration
```typescript
interface MusicBrainzConnector {
    searchArtist(query: string): Promise<Artist[]>;
    getArtist(mbid: string, includes?: string[]): Promise<Artist>;
    getArtistReleases(mbid: string): Promise<Release[]>;
    searchRelease(query: string): Promise<Release[]>;
    getRelease(mbid: string, includes?: string[]): Promise<Release>;
}
```

#### 3.2.2 Discogs Integration
```typescript
interface DiscogsConnector {
    searchArtist(query: string): Promise<DiscogsArtist[]>;
    getArtist(id: number): Promise<DiscogsArtist>;
    getArtistReleases(id: number): Promise<DiscogsRelease[]>;
    searchRelease(query: string): Promise<DiscogsRelease[]>;
    getRelease(id: number): Promise<DiscogsRelease>;
    getLabel(id: number): Promise<DiscogsLabel>;
}
```

#### 3.2.3 Data Aggregation Strategy
```typescript
class MusicDataAggregator {
    async getArtistInfo(query: string): Promise<ArtistInfo> {
        const sources = [
            this.musicbrainz.searchArtist(query),
            this.discogs.searchArtist(query),
            this.lastfm.getArtistInfo(query),
            this.wikipedia.searchArtist(query)
        ];
        
        const results = await Promise.allSettled(sources);
        return this.mergeArtistData(results);
    }
    
    private mergeArtistData(results: PromiseSettledResult<any>[]): ArtistInfo {
        // Implement data merging logic with quality scoring
        // Prioritize sources based on reliability and completeness
        // Handle conflicts and inconsistencies
    }
}
```

## 4. Frontend Design

### 4.1 Component Architecture

```typescript
// Main music information container
interface MusicInfoProps {
    currentTrack: TrackInfo;
    navigationMode: 'embedded' | 'fullscreen';
}

// Navigation-aware components
interface NavigableMusicInfoProps extends MusicInfoProps {
    onNavigate: (type: EntityType, id: string) => void;
    navigationHistory: NavigationEntry[];
    currentView: MusicInfoView;
}

// Entity-specific components
interface ArtistViewProps {
    artistId: string;
    showDiscography?: boolean;
    showSimilarArtists?: boolean;
    onNavigateToAlbum: (albumId: string) => void;
    onNavigateToArtist: (artistId: string) => void;
}

interface AlbumViewProps {
    albumId: string;
    showTracks?: boolean;
    showCredits?: boolean;
    onNavigateToArtist: (artistId: string) => void;
    onNavigateToLabel: (labelId: string) => void;
}

interface LabelViewProps {
    labelId: string;
    showReleases?: boolean;
    onNavigateToAlbum: (albumId: string) => void;
    onNavigateToArtist: (artistId: string) => void;
}
```

### 4.2 Navigation System

```typescript
// Music information router
class MusicInfoRouter {
    private history: NavigationEntry[] = [];
    private currentIndex: number = -1;
    
    navigate(type: EntityType, id: string, context?: NavigationContext): void {
        const entry: NavigationEntry = {
            type,
            id,
            context,
            timestamp: Date.now()
        };
        
        // Add to history
        this.history = this.history.slice(0, this.currentIndex + 1);
        this.history.push(entry);
        this.currentIndex = this.history.length - 1;
        
        // Update URL and trigger navigation
        this.updateURL(entry);
        this.triggerNavigation(entry);
    }
    
    goBack(): boolean {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this.triggerNavigation(this.history[this.currentIndex]);
            return true;
        }
        return false;
    }
    
    goForward(): boolean {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            this.triggerNavigation(this.history[this.currentIndex]);
            return true;
        }
        return false;
    }
}

// Deep linking support
interface MusicInfoRoute {
    path: string;
    component: React.ComponentType<any>;
    params: Record<string, string>;
}

const musicInfoRoutes: MusicInfoRoute[] = [
    { path: '/music/artist/:id', component: ArtistView, params: {} },
    { path: '/music/album/:id', component: AlbumView, params: {} },
    { path: '/music/label/:id', component: LabelView, params: {} },
    { path: '/music/genre/:id', component: GenreView, params: {} },
    { path: '/music/search/:query', component: SearchResults, params: {} }
];
```

### 4.3 Caching Strategy

```typescript
// Multi-level caching system
class MusicInfoCache {
    private memoryCache: Map<string, CacheEntry> = new Map();
    private persistentCache: PersistentCache;
    private imageCache: ImageCache;
    
    async get<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
        // 1. Check memory cache
        const memoryEntry = this.memoryCache.get(key);
        if (memoryEntry && !this.isExpired(memoryEntry)) {
            return memoryEntry.data;
        }
        
        // 2. Check persistent cache
        const persistentEntry = await this.persistentCache.get(key);
        if (persistentEntry && !this.isExpired(persistentEntry)) {
            // Promote to memory cache
            this.memoryCache.set(key, persistentEntry);
            return persistentEntry.data;
        }
        
        // 3. Fetch from source
        const data = await fetcher();
        const entry: CacheEntry = {
            data,
            timestamp: Date.now(),
            expiresAt: Date.now() + this.getTTL(key)
        };
        
        // Store in both caches
        this.memoryCache.set(key, entry);
        await this.persistentCache.set(key, entry);
        
        return data;
    }
    
    // Preload related content
    async preloadRelated(entityType: EntityType, entityId: string): void {
        const preloadTasks = this.getPreloadTasks(entityType, entityId);
        await Promise.allSettled(preloadTasks);
    }
}
```

## 5. Performance Optimization

### 5.1 Loading Strategies

```typescript
// Progressive loading with skeleton screens
interface LoadingState {
    basic: boolean;      // Basic info (name, image)
    detailed: boolean;   // Detailed info (bio, discography)
    related: boolean;    // Related content (similar artists, etc.)
}

// Image optimization
interface ImageLoadingStrategy {
    placeholder: string;     // Low-res placeholder
    progressive: string[];   // Progressive quality levels
    fallbacks: string[];     // Fallback sources
}

// Background preloading
class ContentPreloader {
    private preloadQueue: PreloadTask[] = [];
    private isProcessing: boolean = false;
    
    queuePreload(task: PreloadTask): void {
        this.preloadQueue.push(task);
        this.processQueue();
    }
    
    private async processQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;
        
        while (this.preloadQueue.length > 0) {
            const task = this.preloadQueue.shift()!;
            await this.executePreloadTask(task);
        }
        
        this.isProcessing = false;
    }
}
```

### 5.2 Error Handling and Resilience

```typescript
// Graceful degradation strategy
class MusicInfoErrorHandler {
    async handleDataFetchError(
        error: Error,
        context: FetchContext
    ): Promise<FallbackData | null> {
        // Log error for monitoring
        this.logError(error, context);
        
        // Try fallback sources
        for (const fallback of context.fallbacks) {
            try {
                return await fallback.fetch();
            } catch (fallbackError) {
                continue;
            }
        }
        
        // Return cached data if available
        const cachedData = await this.getCachedData(context.cacheKey);
        if (cachedData) {
            return { ...cachedData, isStale: true };
        }
        
        // Return minimal fallback
        return this.getMinimalFallback(context);
    }
}
```

## 6. Correctness Properties

Based on the prework analysis, the following correctness properties must be maintained:

### Property 1: Data Source Reliability
**Validates: Requirements 2.3**
```typescript
// Property: When fetching music data, the system must try multiple sources 
// and return data with appropriate quality scoring
property("data_source_reliability", async (artistName: string) => {
    assume(artistName.length > 0 && artistName.trim() !== "");
    
    const result = await musicInfoManager.getArtistInfo(artistName);
    
    // Must have attempted multiple sources
    assert(result.sourcesAttempted.length >= 2);
    
    // Must have quality score
    assert(result.qualityScore >= 0 && result.qualityScore <= 1);
    
    // If data exists, must have source attribution
    if (result.data) {
        assert(result.primarySource !== null);
        assert(result.sourceAttribution.length > 0);
    }
});
```

### Property 2: Navigation Consistency
**Validates: Requirements 2.2**
```typescript
// Property: Navigation between music entities must maintain consistent state
// and allow proper back/forward functionality
property("navigation_consistency", async (navigationPath: NavigationStep[]) => {
    assume(navigationPath.length > 0 && navigationPath.length <= 10);
    
    const router = new MusicInfoRouter();
    const visitedEntities: string[] = [];
    
    // Navigate through the path
    for (const step of navigationPath) {
        await router.navigate(step.entityType, step.entityId);
        visitedEntities.push(`${step.entityType}:${step.entityId}`);
        
        // Current location should match navigation
        assert(router.getCurrentLocation().entityId === step.entityId);
        assert(router.getCurrentLocation().entityType === step.entityType);
    }
    
    // Back navigation should work correctly
    for (let i = navigationPath.length - 2; i >= 0; i--) {
        const canGoBack = router.goBack();
        assert(canGoBack === true);
        
        const currentLocation = router.getCurrentLocation();
        assert(currentLocation.entityId === navigationPath[i].entityId);
        assert(currentLocation.entityType === navigationPath[i].entityType);
    }
});
```

### Property 3: Cache Consistency
**Validates: Requirements 2.5**
```typescript
// Property: Cache must provide consistent data and handle expiration correctly
property("cache_consistency", async (cacheKey: string, ttl: number) => {
    assume(cacheKey.length > 0 && ttl > 0 && ttl <= 86400); // Max 24 hours
    
    const cache = new MusicInfoCache();
    const testData = { id: cacheKey, timestamp: Date.now() };
    
    // Store data in cache
    await cache.set(cacheKey, testData, ttl);
    
    // Should retrieve same data immediately
    const retrieved1 = await cache.get(cacheKey);
    assert(JSON.stringify(retrieved1) === JSON.stringify(testData));
    
    // Should still be available before expiration
    if (ttl > 1) {
        await sleep(Math.min(ttl * 0.5, 1000)); // Wait half TTL or 1 second
        const retrieved2 = await cache.get(cacheKey);
        assert(retrieved2 !== null);
        assert(JSON.stringify(retrieved2) === JSON.stringify(testData));
    }
    
    // Should handle cache misses gracefully
    const nonExistentData = await cache.get("non-existent-key");
    assert(nonExistentData === null);
});
```

### Property 4: Performance Requirements
**Validates: Requirements 3.4**
```typescript
// Property: Music information loading must meet performance requirements
property("performance_requirements", async (entityType: EntityType, entityId: string) => {
    assume(entityId.length > 0);
    assume(["artist", "album", "label"].includes(entityType));
    
    const startTime = Date.now();
    
    // First load (cold cache)
    const result1 = await musicInfoManager.getEntityInfo(entityType, entityId);
    const firstLoadTime = Date.now() - startTime;
    
    // Should load within 2 seconds for initial load
    assert(firstLoadTime <= 2000);
    
    // Second load (warm cache)
    const startTime2 = Date.now();
    const result2 = await musicInfoManager.getEntityInfo(entityType, entityId);
    const secondLoadTime = Date.now() - startTime2;
    
    // Cached load should be under 1 second
    assert(secondLoadTime <= 1000);
    
    // Results should be consistent
    if (result1 && result2) {
        assert(result1.id === result2.id);
        assert(result1.name === result2.name);
    }
});
```

### Property 5: Data Quality Scoring
**Validates: Requirements 2.3**
```typescript
// Property: Data quality scoring must be consistent and meaningful
property("data_quality_scoring", async (sources: DataSource[]) => {
    assume(sources.length >= 1 && sources.length <= 6);
    
    const aggregator = new MusicDataAggregator();
    const result = await aggregator.aggregateData(sources);
    
    // Quality score must be valid
    assert(result.qualityScore >= 0 && result.qualityScore <= 1);
    
    // Higher quality sources should contribute more to final score
    const sortedSources = sources.sort((a, b) => b.reliability - a.reliability);
    if (sortedSources.length > 1) {
        const highQualityContribution = result.sourceContributions[sortedSources[0].name];
        const lowQualityContribution = result.sourceContributions[sortedSources[sortedSources.length - 1].name];
        
        assert(highQualityContribution >= lowQualityContribution);
    }
    
    // Complete data should score higher than incomplete data
    const completenessScore = calculateCompleteness(result.data);
    assert(result.qualityScore >= completenessScore * 0.5); // At least half based on completeness
});
```

## 7. Testing Strategy

### 7.1 Property-Based Testing Framework
- **Framework**: fast-check for TypeScript/JavaScript
- **Test Categories**: Data integrity, navigation behavior, caching logic, performance requirements
- **Test Data Generation**: Smart generators for music entities, navigation paths, and API responses

### 7.2 Integration Testing
- **API Integration**: Mock external services for consistent testing
- **Database Testing**: Test schema migrations and data relationships
- **Cache Testing**: Verify cache behavior under various load conditions

### 7.3 Performance Testing
- **Load Testing**: Simulate concurrent users accessing music information
- **Memory Testing**: Verify cache size limits and garbage collection
- **Network Testing**: Test behavior under various network conditions

## 8. Implementation Phases

### Phase 1: Core Infrastructure
- Enhanced database schema
- Basic data source connectors
- Caching system foundation
- Property-based test framework setup

### Phase 2: Data Integration
- MusicBrainz and Discogs integration
- Data quality scoring system
- Error handling and fallback mechanisms
- Cache optimization

### Phase 3: Navigation System
- Client-side routing implementation
- Navigation history and breadcrumbs
- Deep linking support
- Search functionality

### Phase 4: Enhanced UI
- Rich visual components
- Progressive loading
- Mobile responsiveness
- Performance optimization

### Phase 5: Advanced Features
- User corrections system
- Preloading strategies
- Analytics and monitoring
- Final performance tuning