const { ArtistRepository } = require('./models/Artist');
const { AlbumRepository } = require('./models/Album');
const { LabelRepository } = require('./models/Label');
const { TrackRepository } = require('./models/Track');
const { GenreRepository } = require('./models/Genre');
const { DataSourceRepository } = require('./models/DataSource');
const { CacheRepository } = require('./models/Cache');

class MusicInfoManager {
    constructor(db) {
        this.db = db;
        this.artistRepo = new ArtistRepository(db);
        this.albumRepo = new AlbumRepository(db);
        this.labelRepo = new LabelRepository(db);
        this.trackRepo = new TrackRepository(db);
        this.genreRepo = new GenreRepository(db);
        this.dataSourceRepo = new DataSourceRepository(db);
        this.cacheRepo = new CacheRepository(db);
        
        // Data source connectors (to be implemented in Phase 2)
        this.connectors = new Map();
        
        // Quality scoring weights
        this.sourceWeights = {
            'musicbrainz': 0.9,
            'discogs': 0.8,
            'lastfm': 0.7,
            'itunes': 0.6,
            'spotify': 0.6,
            'wikipedia': 0.5,
            'theaudiodb': 0.4
        };
    }

    // Register data source connectors
    registerConnector(sourceName, connector) {
        this.connectors.set(sourceName, connector);
        console.log(`MusicInfoManager: Registered connector for ${sourceName}`);
    }

    // Get artist information with data aggregation
    async getArtistInfo(query, options = {}) {
        const cacheKey = `artist:${query}:${JSON.stringify(options)}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached && !options.forceRefresh) {
                console.log(`MusicInfoManager: Cache hit for artist "${query}"`);
                return this.enhanceArtistData(cached.data);
            }

            console.log(`MusicInfoManager: Fetching artist info for "${query}"`);
            
            // Try local database first
            let localArtists = await this.artistRepo.search(query, 5);
            let bestMatch = this.findBestMatch(localArtists, query);
            
            if (bestMatch && !options.forceRefresh) {
                const result = await this.enhanceArtistData(bestMatch);
                await this.cacheRepo.set(cacheKey, result, 3600); // Cache for 1 hour
                return result;
            }

            // Fetch from external sources
            const aggregatedData = await this.aggregateArtistData(query);
            
            if (aggregatedData) {
                // Store in database
                const artist = await this.storeArtistData(aggregatedData);
                const result = await this.enhanceArtistData(artist);
                
                // Cache the result
                await this.cacheRepo.set(cacheKey, result, 3600);
                return result;
            }

            // Return local match if no external data found
            if (bestMatch) {
                const result = await this.enhanceArtistData(bestMatch);
                await this.cacheRepo.set(cacheKey, result, 1800); // Cache for 30 minutes
                return result;
            }

            return null;
        } catch (error) {
            console.error(`MusicInfoManager: Error getting artist info for "${query}":`, error);
            
            // Try to return cached data even if stale
            const staleCache = await this.cacheRepo.get(cacheKey);
            if (staleCache) {
                console.log(`MusicInfoManager: Returning stale cache for "${query}"`);
                return { ...staleCache.data, isStale: true };
            }
            
            throw error;
        }
    }

    // Enhanced artist data with images and additional metadata
    async enhanceArtistData(artist) {
        if (!artist) return null;

        try {
            // Try to get artist image if we have an MBID and no image yet
            if (artist.mbid && !artist.image_url) {
                const imageData = await this.connectors.musicbrainz.getArtistImage(artist.mbid);
                if (imageData) {
                    artist.image_url = imageData.thumbnails.small || imageData.url;
                    
                    // Update the database with the image
                    await this.artistRepo.update(artist.id, { image_url: artist.image_url });
                }
            }

            // Get related albums
            if (!artist.albums) {
                artist.albums = await this.albumRepo.getByArtistId(artist.id);
                
                // Enhance album data with artwork
                for (let album of artist.albums) {
                    if (album.mbid && !album.artwork_url) {
                        const artworkData = await this.connectors.musicbrainz.getReleaseArtwork(album.mbid);
                        if (artworkData) {
                            album.artwork_url = artworkData.thumbnails.small || artworkData.url;
                            await this.albumRepo.update(album.id, { artwork_url: album.artwork_url });
                        }
                    }
                }
            }

            // Get genres
            if (!artist.genres) {
                artist.genres = await this.genreRepo.getByArtistId(artist.id);
            }

            // Get data sources
            if (!artist.sources) {
                artist.sources = await this.dataSourceRepo.getByEntity('artist', artist.id);
            }

            // Calculate quality score
            artist.quality_score = this.calculateQualityScore(artist);

            return artist;
        } catch (error) {
            console.error(`MusicInfoManager: Error enhancing artist data:`, error);
            return artist; // Return original data if enhancement fails
        }
    }

    // Get album information from multiple sources
    async getAlbumInfo(query, artistName = null, options = {}) {
        const cacheKey = `album:${query}:${artistName || ''}:${JSON.stringify(options)}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached && !options.forceRefresh) {
                console.log(`MusicInfoManager: Cache hit for album "${query}"`);
                return this.enhanceAlbumData(cached.data);
            }

            console.log(`MusicInfoManager: Fetching album info for "${query}" by "${artistName || 'unknown'}"`);
            
            // Try local database first
            let localAlbums = await this.albumRepo.search(query, 5);
            let bestMatch = this.findBestMatch(localAlbums, query);
            
            if (bestMatch && !options.forceRefresh) {
                const result = await this.enhanceAlbumData(bestMatch);
                await this.cacheRepo.set(cacheKey, result, 3600);
                return result;
            }

            // Fetch from external sources
            const aggregatedData = await this.aggregateAlbumData(query, artistName);
            
            if (aggregatedData) {
                // Store in database
                const album = await this.storeAlbumData(aggregatedData);
                const result = await this.enhanceAlbumData(album);
                
                // Cache the result
                await this.cacheRepo.set(cacheKey, result, 3600);
                return result;
            }

            // Return local match if no external data found
            if (bestMatch) {
                const result = await this.enhanceAlbumData(bestMatch);
                await this.cacheRepo.set(cacheKey, result, 1800);
                return result;
            }

            return null;
        } catch (error) {
            console.error(`MusicInfoManager: Error getting album info for "${query}":`, error);
            
            // Try to return cached data even if stale
            const staleCache = await this.cacheRepo.get(cacheKey);
            if (staleCache) {
                console.log(`MusicInfoManager: Returning stale cache for "${query}"`);
                return { ...staleCache.data, isStale: true };
            }
            
            throw error;
        }
    }

    // Aggregate artist data from multiple sources
    async aggregateArtistData(query) {
        const sources = [];
        const results = [];

        // Collect data from all available connectors
        for (const [sourceName, connector] of this.connectors) {
            try {
                console.log(`MusicInfoManager: Querying ${sourceName} for artist "${query}"`);
                const data = await connector.searchArtist(query);
                if (data && data.length > 0) {
                    results.push({
                        source: sourceName,
                        data: data[0], // Take best match
                        weight: this.sourceWeights[sourceName] || 0.5
                    });
                }
            } catch (error) {
                console.warn(`MusicInfoManager: ${sourceName} failed for artist "${query}":`, error.message);
            }
        }

        if (results.length === 0) {
            return null;
        }

        // Merge data with quality scoring
        return this.mergeArtistData(results);
    }

    // Aggregate album data from multiple sources
    async aggregateAlbumData(query, artistName) {
        const sources = [];
        const results = [];

        // Collect data from all available connectors
        for (const [sourceName, connector] of this.connectors) {
            try {
                console.log(`MusicInfoManager: Querying ${sourceName} for album "${query}" by "${artistName || 'unknown'}"`);
                const data = await connector.searchAlbum ? 
                    await connector.searchAlbum(query, artistName) :
                    await connector.searchRelease(query, artistName);
                
                if (data && data.length > 0) {
                    results.push({
                        source: sourceName,
                        data: data[0], // Take best match
                        weight: this.sourceWeights[sourceName] || 0.5
                    });
                }
            } catch (error) {
                console.warn(`MusicInfoManager: ${sourceName} failed for album "${query}":`, error.message);
            }
        }

        if (results.length === 0) {
            return null;
        }

        // Merge data with quality scoring
        return this.mergeAlbumData(results);
    }

    // Merge artist data from multiple sources
    mergeArtistData(results) {
        const merged = {
            name: null,
            mbid: null,
            biography: null,
            country: null,
            begin_date: null,
            end_date: null,
            type: null,
            image_url: null,
            genres: [],
            sources: [],
            quality_score: 0
        };

        let totalWeight = 0;

        // Sort by weight (highest first)
        results.sort((a, b) => b.weight - a.weight);

        for (const result of results) {
            const { source, data, weight } = result;
            
            // Track sources
            merged.sources.push({
                name: source,
                weight: weight,
                data_hash: this.generateDataHash(data)
            });

            // Merge fields with weighted priority
            if (data.name && !merged.name) merged.name = data.name;
            if (data.mbid && !merged.mbid) merged.mbid = data.mbid;
            if (data.biography && !merged.biography) merged.biography = data.biography;
            if (data.country && !merged.country) merged.country = data.country;
            if (data.begin_date && !merged.begin_date) merged.begin_date = data.begin_date;
            if (data.end_date && !merged.end_date) merged.end_date = data.end_date;
            if (data.type && !merged.type) merged.type = data.type;
            if (data.image_url && !merged.image_url) merged.image_url = data.image_url;
            
            // Merge genres
            if (data.genres && Array.isArray(data.genres)) {
                merged.genres = [...merged.genres, ...data.genres];
            }

            totalWeight += weight;
        }

        // Calculate overall quality score
        merged.quality_score = results.length > 0 && !isNaN(totalWeight) ? totalWeight / results.length : 0;
        
        // Remove duplicate genres
        merged.genres = [...new Set(merged.genres)];

        return merged;
    }

    // Merge album data from multiple sources
    mergeAlbumData(results) {
        const merged = {
            title: null,
            mbid: null,
            artist_name: null,
            release_date: null,
            release_type: null,
            label_name: null,
            catalog_number: null,
            artwork_url: null,
            track_count: null,
            tracks: [],
            credits: [],
            genres: [],
            sources: [],
            quality_score: 0
        };

        let totalWeight = 0;

        // Sort by weight (highest first)
        results.sort((a, b) => b.weight - a.weight);

        for (const result of results) {
            const { source, data, weight } = result;
            
            // Track sources
            merged.sources.push({
                name: source,
                weight: weight,
                data_hash: this.generateDataHash(data)
            });

            // Merge fields with weighted priority
            if (data.title && !merged.title) merged.title = data.title;
            if (data.mbid && !merged.mbid) merged.mbid = data.mbid;
            if (data.artist_name && !merged.artist_name) merged.artist_name = data.artist_name;
            if (data.release_date && !merged.release_date) merged.release_date = data.release_date;
            if (data.release_type && !merged.release_type) merged.release_type = data.release_type;
            if (data.label_name && !merged.label_name) merged.label_name = data.label_name;
            if (data.catalog_number && !merged.catalog_number) merged.catalog_number = data.catalog_number;
            if (data.artwork_url && !merged.artwork_url) merged.artwork_url = data.artwork_url;
            if (data.track_count && !merged.track_count) merged.track_count = data.track_count;
            
            // Merge tracks and credits
            if (data.tracks && Array.isArray(data.tracks)) {
                merged.tracks = [...merged.tracks, ...data.tracks];
            }
            if (data.credits && Array.isArray(data.credits)) {
                merged.credits = [...merged.credits, ...data.credits];
            }
            if (data.genres && Array.isArray(data.genres)) {
                merged.genres = [...merged.genres, ...data.genres];
            }

            totalWeight += weight;
        }

        // Calculate overall quality score
        merged.quality_score = results.length > 0 && !isNaN(totalWeight) ? totalWeight / results.length : 0;
        
        // Remove duplicates
        merged.genres = [...new Set(merged.genres)];

        return merged;
    }

    // Store artist data in database
    async storeArtistData(data) {
        try {
            // Check if artist already exists
            let artist = null;
            if (data.mbid) {
                artist = await this.artistRepo.findByMbid(data.mbid);
            }
            
            if (!artist && data.name) {
                const existing = await this.artistRepo.findByName(data.name);
                artist = existing.length > 0 ? existing[0] : null;
            }

            const artistData = {
                mbid: data.mbid,
                name: data.name,
                biography: data.biography,
                country: data.country,
                begin_date: data.begin_date,
                end_date: data.end_date,
                type: data.type,
                image_url: data.image_url
            };

            if (artist) {
                // Update existing artist
                await this.artistRepo.update(artist.id, artistData);
                artist = await this.artistRepo.findById(artist.id);
            } else {
                // Create new artist
                artist = await this.artistRepo.create(artistData);
            }

            // Store data source information
            for (const source of data.sources) {
                await this.dataSourceRepo.upsert({
                    entity_type: 'artist',
                    entity_id: artist.id,
                    source_name: source.name,
                    quality_score: source.weight,
                    data_hash: source.data_hash
                });
            }

            // Store genres
            if (data.genres && data.genres.length > 0) {
                for (const genreName of data.genres) {
                    const genre = await this.genreRepo.findOrCreate(genreName);
                    await this.artistRepo.addGenre(artist.id, genre.id);
                }
            }

            return artist;
        } catch (error) {
            console.error('MusicInfoManager: Error storing artist data:', error);
            throw error;
        }
    }

    // Store album data in database
    async storeAlbumData(data) {
        try {
            // Find or create artist
            let artist = null;
            if (data.artist_name) {
                const artists = await this.artistRepo.findByName(data.artist_name);
                artist = artists.length > 0 ? artists[0] : await this.artistRepo.create({
                    name: data.artist_name
                });
            }

            // Find or create label
            let label = null;
            if (data.label_name) {
                const labels = await this.labelRepo.findByName(data.label_name);
                label = labels.length > 0 ? labels[0] : await this.labelRepo.create({
                    name: data.label_name
                });
            }

            // Check if album already exists
            let album = null;
            if (data.mbid) {
                album = await this.albumRepo.findByMbid(data.mbid);
            }
            
            if (!album && data.title) {
                const existing = await this.albumRepo.findByTitle(data.title);
                album = existing.length > 0 ? existing[0] : null;
            }

            const albumData = {
                mbid: data.mbid,
                title: data.title,
                artist_id: artist ? artist.id : null,
                release_date: data.release_date,
                release_type: data.release_type,
                label_id: label ? label.id : null,
                catalog_number: data.catalog_number,
                artwork_url: data.artwork_url,
                track_count: data.track_count
            };

            if (album) {
                // Update existing album
                await this.albumRepo.update(album.id, albumData);
                album = await this.albumRepo.findById(album.id);
            } else {
                // Create new album
                album = await this.albumRepo.create(albumData);
            }

            // Store data source information
            for (const source of data.sources) {
                await this.dataSourceRepo.upsert({
                    entity_type: 'album',
                    entity_id: album.id,
                    source_name: source.name,
                    quality_score: source.weight,
                    data_hash: source.data_hash
                });
            }

            // Store genres
            if (data.genres && data.genres.length > 0) {
                for (const genreName of data.genres) {
                    const genre = await this.genreRepo.findOrCreate(genreName);
                    await this.albumRepo.addGenre(album.id, genre.id);
                }
            }

            return album;
        } catch (error) {
            console.error('MusicInfoManager: Error storing album data:', error);
            throw error;
        }
    }

    // Enhance artist data with related information
    async enhanceArtistData(artist) {
        try {
            // Handle case where artist might not be an Artist instance
            const enhanced = artist && typeof artist.toJSON === 'function' ? 
                { ...artist.toJSON() } : 
                { ...artist };
            
            if (artist && artist.id) {
                // Get genres
                enhanced.genres = await this.artistRepo.getGenres(artist.id);
                
                // Get albums
                enhanced.albums = await this.artistRepo.getAlbums(artist.id);
                
                // Get data sources
                enhanced.sources = await this.dataSourceRepo.findByEntity('artist', artist.id);
            }
            
            return enhanced;
        } catch (error) {
            console.error('MusicInfoManager: Error enhancing artist data:', error);
            return artist && typeof artist.toJSON === 'function' ? 
                artist.toJSON() : 
                artist || {};
        }
    }

    // Enhance album data with related information
    async enhanceAlbumData(album) {
        try {
            // Handle case where album might not be an Album instance
            const enhanced = album && typeof album.toJSON === 'function' ? 
                { ...album.toJSON() } : 
                { ...album };
            
            if (album && album.id) {
                // Get artist
                enhanced.artist = await this.albumRepo.getArtist(album.id);
                
                // Get label
                enhanced.label = await this.albumRepo.getLabel(album.id);
                
                // Get tracks
                enhanced.tracks = await this.albumRepo.getTracks(album.id);
                
                // Get credits
                enhanced.credits = await this.albumRepo.getCredits(album.id);
                
                // Get genres
                enhanced.genres = await this.albumRepo.getGenres(album.id);
                
                // Get data sources
                enhanced.sources = await this.dataSourceRepo.findByEntity('album', album.id);
            }
            
            return enhanced;
        } catch (error) {
            console.error('MusicInfoManager: Error enhancing album data:', error);
            return album && typeof album.toJSON === 'function' ? 
                album.toJSON() : 
                album || {};
        }
    }

    // Find best match from search results
    findBestMatch(results, query) {
        if (!results || results.length === 0) return null;
        
        const queryLower = query.toLowerCase();
        
        // Exact match first
        for (const result of results) {
            if (result.name.toLowerCase() === queryLower) {
                return result;
            }
        }
        
        // Starts with match
        for (const result of results) {
            if (result.name.toLowerCase().startsWith(queryLower)) {
                return result;
            }
        }
        
        // Return first result as fallback
        return results[0];
    }

    // Generate data hash for change detection
    generateDataHash(data) {
        const crypto = require('crypto');
        const str = JSON.stringify(data, Object.keys(data).sort());
        return crypto.createHash('md5').update(str).digest('hex');
    }

    // Get cache statistics
    async getCacheStats() {
        return await this.cacheRepo.getStats();
    }

    // Clear cache
    async clearCache(pattern = null) {
        if (pattern) {
            return await this.cacheRepo.deleteByPattern(pattern);
        } else {
            return await this.cacheRepo.clear();
        }
    }

    // Cleanup expired cache entries
    async cleanupCache() {
        return await this.cacheRepo.cleanupExpired();
    }

    // Search for artists across all data sources
    async searchArtists(query, options = {}) {
        const cacheKey = `search:artists:${query}:${JSON.stringify(options)}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached && !options.forceRefresh) {
                console.log(`MusicInfoManager: Cache hit for artist search "${query}"`);
                return cached.data;
            }

            const results = [];
            const limit = options.limit || 10;
            const sources = options.sources || Array.from(this.connectors.keys());

            // Search across specified sources
            for (const sourceName of sources) {
                const connector = this.connectors.get(sourceName);
                if (!connector) continue;

                try {
                    console.log(`MusicInfoManager: Searching ${sourceName} for artists matching "${query}"`);
                    const sourceResults = await connector.searchArtist(query, { limit });
                    
                    if (sourceResults && sourceResults.length > 0) {
                        results.push(...sourceResults.map(result => ({
                            ...result,
                            source: sourceName,
                            weight: this.sourceWeights[sourceName] || 0.5
                        })));
                    }
                } catch (error) {
                    console.warn(`MusicInfoManager: ${sourceName} search failed for "${query}":`, error.message);
                }
            }

            // Sort by relevance and weight
            results.sort((a, b) => {
                const aScore = (a.confidence || 0.5) * (a.weight || 0.5);
                const bScore = (b.confidence || 0.5) * (b.weight || 0.5);
                return bScore - aScore;
            });

            // Limit results
            const limitedResults = results.slice(0, limit);

            // Cache results
            await this.cacheRepo.set(cacheKey, limitedResults, 3600); // 1 hour TTL

            return limitedResults;
        } catch (error) {
            console.error(`MusicInfoManager: Error searching artists for "${query}":`, error);
            return [];
        }
    }

    // Search for albums across all data sources
    async searchAlbums(query, options = {}) {
        const cacheKey = `search:albums:${query}:${JSON.stringify(options)}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached && !options.forceRefresh) {
                console.log(`MusicInfoManager: Cache hit for album search "${query}"`);
                return cached.data;
            }

            const results = [];
            const limit = options.limit || 10;
            const sources = options.sources || Array.from(this.connectors.keys());

            // Search across specified sources
            for (const sourceName of sources) {
                const connector = this.connectors.get(sourceName);
                if (!connector) continue;

                try {
                    console.log(`MusicInfoManager: Searching ${sourceName} for albums matching "${query}"`);
                    const sourceResults = await (connector.searchAlbum ? 
                        connector.searchAlbum(options.artist, query, { limit }) :
                        connector.searchRelease(options.artist, query, { limit }));
                    
                    if (sourceResults && sourceResults.length > 0) {
                        results.push(...sourceResults.map(result => ({
                            ...result,
                            source: sourceName,
                            weight: this.sourceWeights[sourceName] || 0.5
                        })));
                    }
                } catch (error) {
                    console.warn(`MusicInfoManager: ${sourceName} search failed for "${query}":`, error.message);
                }
            }

            // Sort by relevance and weight
            results.sort((a, b) => {
                const aScore = (a.confidence || 0.5) * (a.weight || 0.5);
                const bScore = (b.confidence || 0.5) * (b.weight || 0.5);
                return bScore - aScore;
            });

            // Limit results
            const limitedResults = results.slice(0, limit);

            // Cache results
            await this.cacheRepo.set(cacheKey, limitedResults, 3600); // 1 hour TTL

            return limitedResults;
        } catch (error) {
            console.error(`MusicInfoManager: Error searching albums for "${query}":`, error);
            return [];
        }
    }

    // Get album credits from multiple sources
    async getAlbumCredits(albumId) {
        const cacheKey = `credits:${albumId}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached) {
                console.log(`MusicInfoManager: Cache hit for album credits "${albumId}"`);
                return cached.data;
            }

            console.log(`MusicInfoManager: Fetching album credits for "${albumId}"`);

            // Try each connector until we get credits data
            for (const [sourceName, connector] of this.connectors) {
                try {
                    if (connector.getAlbumCredits) {
                        console.log(`MusicInfoManager: Fetching credits from ${sourceName}`);
                        const data = await connector.getAlbumCredits(albumId);
                        
                        if (data && data.credits && data.credits.length > 0) {
                            console.log(`MusicInfoManager: Got ${data.credits.length} credits from ${sourceName}`);
                            
                            // Cache the result
                            await this.cacheRepo.set(cacheKey, data, 24 * 60 * 60); // 24 hours
                            
                            return data;
                        }
                    }
                } catch (error) {
                    console.error(`MusicInfoManager: Error fetching credits from ${sourceName}:`, error.message);
                }
            }

            // Return empty credits if no data found
            const emptyResult = { credits: [], source: 'none' };
            await this.cacheRepo.set(cacheKey, emptyResult, 60 * 60); // Cache for 1 hour
            return emptyResult;

        } catch (error) {
            console.error(`MusicInfoManager: Error in getAlbumCredits:`, error);
            return { credits: [], source: 'error', error: error.message };
        }
    }

    // Get artist discography
    async getArtistDiscography(artistName) {
        const cacheKey = `discography:${artistName}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached) {
                console.log(`MusicInfoManager: Cache hit for discography "${artistName}"`);
                return cached.data;
            }

            console.log(`MusicInfoManager: Fetching discography for "${artistName}"`);
            
            // Try to get from local database first
            const localAlbums = await this.albumRepo.findByArtist(artistName);
            
            // Fetch from external sources
            const externalData = await this.fetchDiscographyFromSources(artistName);
            
            // Combine and deduplicate
            const allAlbums = [...localAlbums, ...(externalData.albums || [])];
            const uniqueAlbums = this.deduplicateAlbums(allAlbums);
            
            const result = {
                albums: uniqueAlbums,
                source: externalData.source || 'local',
                total: uniqueAlbums.length
            };

            // Cache the result
            await this.cacheRepo.set(cacheKey, result, 7200); // Cache for 2 hours
            
            return result;
        } catch (error) {
            console.error(`MusicInfoManager: Error getting discography for "${artistName}":`, error);
            return { albums: [], source: 'error', total: 0 };
        }
    }

    // Get similar artists
    async getSimilarArtists(artistName) {
        const cacheKey = `similar:${artistName}`;
        
        try {
            // Check cache first
            const cached = await this.cacheRepo.get(cacheKey);
            if (cached) {
                console.log(`MusicInfoManager: Cache hit for similar artists "${artistName}"`);
                return cached.data;
            }

            console.log(`MusicInfoManager: Fetching similar artists for "${artistName}"`);
            
            // Fetch from external sources
            const externalData = await this.fetchSimilarArtistsFromSources(artistName);
            
            const result = {
                artists: externalData.artists || [],
                source: externalData.source || 'multiple',
                total: (externalData.artists || []).length
            };

            // Cache the result
            await this.cacheRepo.set(cacheKey, result, 7200); // Cache for 2 hours
            
            return result;
        } catch (error) {
            console.error(`MusicInfoManager: Error getting similar artists for "${artistName}":`, error);
            return { artists: [], source: 'error', total: 0 };
        }
    }

    // Fetch discography from external sources
    async fetchDiscographyFromSources(artistName) {
        const results = [];
        let primarySource = 'unknown';

        for (const [sourceName, connector] of this.connectors) {
            try {
                if (connector.getArtistDiscography) {
                    console.log(`MusicInfoManager: Fetching discography from ${sourceName}`);
                    const data = await connector.getArtistDiscography(artistName);
                    
                    if (data && data.albums && data.albums.length > 0) {
                        results.push(...data.albums.map(album => ({
                            ...album,
                            source: sourceName,
                            weight: this.sourceWeights[sourceName] || 0.3
                        })));
                        
                        if (!primarySource || this.sourceWeights[sourceName] > this.sourceWeights[primarySource]) {
                            primarySource = sourceName;
                        }
                    }
                }
            } catch (error) {
                console.error(`MusicInfoManager: Error fetching discography from ${sourceName}:`, error.message);
            }
        }

        return {
            albums: results,
            source: primarySource
        };
    }

    // Fetch similar artists from external sources
    async fetchSimilarArtistsFromSources(artistName) {
        const results = [];
        let primarySource = 'unknown';

        for (const [sourceName, connector] of this.connectors) {
            try {
                if (connector.getSimilarArtists) {
                    console.log(`MusicInfoManager: Fetching similar artists from ${sourceName}`);
                    const data = await connector.getSimilarArtists(artistName);
                    
                    if (data && data.artists && data.artists.length > 0) {
                        results.push(...data.artists.map(artist => ({
                            ...artist,
                            source: sourceName,
                            weight: this.sourceWeights[sourceName] || 0.3
                        })));
                        
                        if (!primarySource || this.sourceWeights[sourceName] > this.sourceWeights[primarySource]) {
                            primarySource = sourceName;
                        }
                    }
                }
            } catch (error) {
                console.error(`MusicInfoManager: Error fetching similar artists from ${sourceName}:`, error.message);
            }
        }

        // Deduplicate and sort by similarity
        const uniqueArtists = this.deduplicateSimilarArtists(results);
        
        return {
            artists: uniqueArtists.slice(0, 20), // Limit to top 20
            source: primarySource
        };
    }

    // Deduplicate albums by title and release year
    deduplicateAlbums(albums) {
        const seen = new Map();
        const result = [];

        for (const album of albums) {
            const key = `${album.title?.toLowerCase()}-${album.release_date?.substring(0, 4) || 'unknown'}`;
            
            if (!seen.has(key)) {
                seen.set(key, album);
                result.push(album);
            } else {
                // Keep the one with higher weight/quality
                const existing = seen.get(key);
                if ((album.weight || 0) > (existing.weight || 0)) {
                    seen.set(key, album);
                    const index = result.findIndex(a => a === existing);
                    if (index !== -1) result[index] = album;
                }
            }
        }

        return result.sort((a, b) => {
            // Sort by release date (newest first)
            const aYear = a.release_date ? new Date(a.release_date).getFullYear() : 0;
            const bYear = b.release_date ? new Date(b.release_date).getFullYear() : 0;
            return bYear - aYear;
        });
    }

    // Deduplicate similar artists by name
    deduplicateSimilarArtists(artists) {
        const seen = new Map();
        const result = [];

        for (const artist of artists) {
            const key = artist.name?.toLowerCase();
            
            if (!seen.has(key)) {
                seen.set(key, artist);
                result.push(artist);
            } else {
                // Keep the one with higher similarity score
                const existing = seen.get(key);
                if ((artist.similarity_score || 0) > (existing.similarity_score || 0)) {
                    seen.set(key, artist);
                    const index = result.findIndex(a => a === existing);
                    if (index !== -1) result[index] = artist;
                }
            }
        }

        return result.sort((a, b) => (b.similarity_score || 0) - (a.similarity_score || 0));
    }

    // Clear specific cache entry
    async clearCacheEntry(key) {
        try {
            await this.cacheRepo.delete(key);
            console.log(`MusicInfoManager: Cleared cache entry "${key}"`);
        } catch (error) {
            console.error(`MusicInfoManager: Error clearing cache entry "${key}":`, error);
            throw error;
        }
    }

    // Get performance statistics
    async getPerformanceStats() {
        try {
            const cacheStats = await this.getCacheStats();
            
            // Calculate connector performance
            const connectorStats = {};
            for (const [name, connector] of this.connectors) {
                connectorStats[name] = {
                    reliability: connector.getReliabilityScore ? connector.getReliabilityScore() : 0.5,
                    avgResponseTime: this.getConnectorAvgResponseTime(name),
                    errorRate: this.getConnectorErrorRate(name),
                    lastUsed: this.getConnectorLastUsed(name)
                };
            }

            return {
                cache: cacheStats,
                connectors: connectorStats,
                totalRequests: this.totalRequests || 0,
                totalErrors: this.totalErrors || 0,
                avgResponseTime: this.calculateAvgResponseTime(),
                uptime: process.uptime(),
                memoryUsage: process.memoryUsage(),
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            console.error('MusicInfoManager: Error getting performance stats:', error);
            return {
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    // Helper methods for performance tracking
    getConnectorAvgResponseTime(connectorName) {
        // This would be implemented with actual timing data
        return Math.random() * 1000 + 200; // Mock data for now
    }

    getConnectorErrorRate(connectorName) {
        // This would be implemented with actual error tracking
        return Math.random() * 0.1; // Mock data for now
    }

    getConnectorLastUsed(connectorName) {
        // This would be implemented with actual usage tracking
        return new Date(Date.now() - Math.random() * 3600000).toISOString(); // Mock data for now
    }

    // User corrections system
    async submitCorrection(correction) {
        try {
            // In a real implementation, this would store in a proper corrections table
            const cacheKey = `correction:${correction.id}`;
            await this.cacheRepo.set(cacheKey, correction, 30 * 24 * 60 * 60); // 30 days
            
            console.log(`MusicInfoManager: Correction submitted for ${correction.entityType}:${correction.entityId}`);
            return correction;
        } catch (error) {
            console.error('MusicInfoManager: Error submitting correction:', error);
            throw error;
        }
    }

    async getCorrections(filters = {}) {
        try {
            // In a real implementation, this would query a proper corrections table
            // For now, return mock data
            return {
                corrections: [],
                total: 0,
                pending: 0,
                approved: 0,
                rejected: 0
            };
        } catch (error) {
            console.error('MusicInfoManager: Error getting corrections:', error);
            return { corrections: [], total: 0, pending: 0, approved: 0, rejected: 0 };
        }
    }

    calculateAvgResponseTime() {
        // This would be implemented with actual timing data
        return Math.random() * 500 + 100; // Mock data for now
    }
}

module.exports = MusicInfoManager;