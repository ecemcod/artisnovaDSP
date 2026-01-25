const axios = require('axios');

class DiscogsConnector {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://api.discogs.com';
        this.userAgent = options.userAgent || 'ArtisNova/1.0.0 +http://example.com';
        this.token = options.token || null; // Discogs API token for higher rate limits
        this.rateLimit = options.rateLimit || 1000; // 1 request per second for unauthenticated
        this.lastRequest = 0;
        this.timeout = options.timeout || 5000;
    }

    async makeRequest(endpoint, params = {}) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        if (timeSinceLastRequest < this.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, this.rateLimit - timeSinceLastRequest));
        }
        this.lastRequest = Date.now();

        try {
            const headers = {
                'User-Agent': this.userAgent
            };

            if (this.token) {
                headers['Authorization'] = `Discogs token=${this.token}`;
            }

            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                params: params,
                headers: headers,
                timeout: this.timeout
            });

            return response.data;
        } catch (error) {
            console.error(`DiscogsConnector: Request failed for ${endpoint}:`, error.message);
            throw error;
        }
    }

    async searchArtist(query, limit = 25) {
        try {
            console.log(`DiscogsConnector: Searching for artist "${query}"`);
            
            const data = await this.makeRequest('database/search', {
                q: query,
                type: 'artist',
                per_page: limit
            });

            if (!data.results || data.results.length === 0) {
                return [];
            }

            return data.results.map(artist => this.transformArtistSearchResult(artist));
        } catch (error) {
            console.error(`DiscogsConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtist(id) {
        try {
            console.log(`DiscogsConnector: Getting artist details for ID "${id}"`);
            
            const data = await this.makeRequest(`artists/${id}`);
            return this.transformArtist(data);
        } catch (error) {
            console.error(`DiscogsConnector: Artist details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    async getArtistReleases(id, limit = 50) {
        try {
            console.log(`DiscogsConnector: Getting releases for artist ID "${id}"`);
            
            const data = await this.makeRequest(`artists/${id}/releases`, {
                per_page: limit,
                sort: 'year',
                sort_order: 'desc'
            });

            if (!data.releases || data.releases.length === 0) {
                return [];
            }

            return data.releases.map(release => this.transformReleaseSearchResult(release));
        } catch (error) {
            console.error(`DiscogsConnector: Artist releases failed for ID "${id}":`, error.message);
            return [];
        }
    }

    async searchRelease(query, artistName = null, limit = 25) {
        try {
            let searchQuery = query;
            if (artistName) {
                searchQuery = `${query} ${artistName}`;
            }
            
            console.log(`DiscogsConnector: Searching for release "${searchQuery}"`);
            
            const data = await this.makeRequest('database/search', {
                q: searchQuery,
                type: 'release',
                per_page: limit
            });

            if (!data.results || data.results.length === 0) {
                return [];
            }

            return data.results.map(release => this.transformReleaseSearchResult(release));
        } catch (error) {
            console.error(`DiscogsConnector: Release search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getRelease(id) {
        try {
            console.log(`DiscogsConnector: Getting release details for ID "${id}"`);
            
            const data = await this.makeRequest(`releases/${id}`);
            return this.transformRelease(data);
        } catch (error) {
            console.error(`DiscogsConnector: Release details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    async searchLabel(query, limit = 25) {
        try {
            console.log(`DiscogsConnector: Searching for label "${query}"`);
            
            const data = await this.makeRequest('database/search', {
                q: query,
                type: 'label',
                per_page: limit
            });

            if (!data.results || data.results.length === 0) {
                return [];
            }

            return data.results.map(label => this.transformLabelSearchResult(label));
        } catch (error) {
            console.error(`DiscogsConnector: Label search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getLabel(id) {
        try {
            console.log(`DiscogsConnector: Getting label details for ID "${id}"`);
            
            const data = await this.makeRequest(`labels/${id}`);
            return this.transformLabel(data);
        } catch (error) {
            console.error(`DiscogsConnector: Label details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    // Transform Discogs artist search result to internal format
    transformArtistSearchResult(artist) {
        return {
            discogs_id: artist.id,
            name: artist.title,
            image_url: artist.thumb || artist.cover_image || null,
            resource_url: artist.resource_url,
            source: 'discogs'
        };
    }

    // Transform Discogs artist data to internal format
    transformArtist(artist) {
        const genres = [];
        
        // Extract genres
        if (artist.genres && Array.isArray(artist.genres)) {
            genres.push(...artist.genres);
        }
        
        // Extract styles as genres
        if (artist.styles && Array.isArray(artist.styles)) {
            genres.push(...artist.styles);
        }

        return {
            discogs_id: artist.id,
            name: artist.name,
            real_name: artist.realname || null,
            biography: artist.profile || null,
            image_url: artist.images && artist.images.length > 0 ? 
                artist.images[0].uri : null,
            genres: [...new Set(genres)], // Remove duplicates
            aliases: artist.aliases ? artist.aliases.map(alias => alias.name) : [],
            members: artist.members ? artist.members.map(member => member.name) : [],
            urls: artist.urls || [],
            source: 'discogs'
        };
    }

    // Transform Discogs release search result to internal format
    transformReleaseSearchResult(release) {
        return {
            discogs_id: release.id,
            title: release.title,
            artist_name: this.extractArtistName(release.title),
            year: release.year || null,
            format: release.format ? release.format.join(', ') : null,
            label: release.label ? release.label.join(', ') : null,
            catalog_number: release.catno || null,
            image_url: release.thumb || release.cover_image || null,
            resource_url: release.resource_url,
            source: 'discogs'
        };
    }

    // Transform Discogs release data to internal format
    transformRelease(release) {
        const genres = [];
        
        // Extract genres
        if (release.genres && Array.isArray(release.genres)) {
            genres.push(...release.genres);
        }
        
        // Extract styles as genres
        if (release.styles && Array.isArray(release.styles)) {
            genres.push(...release.styles);
        }

        // Extract label information
        const labelInfo = release.labels && release.labels.length > 0 ? release.labels[0] : null;
        
        // Extract artist information
        const artistName = release.artists && release.artists.length > 0 ? 
            release.artists[0].name : 'Unknown Artist';

        return {
            discogs_id: release.id,
            title: release.title,
            artist_name: artistName,
            release_date: release.released || (release.year ? `${release.year}-01-01` : null),
            release_type: this.determineReleaseType(release.formats),
            label_name: labelInfo ? labelInfo.name : null,
            catalog_number: labelInfo ? labelInfo.catno : null,
            barcode: release.identifiers ? 
                this.extractIdentifier(release.identifiers, 'Barcode') : null,
            artwork_url: release.images && release.images.length > 0 ? 
                release.images[0].uri : null,
            track_count: release.tracklist ? release.tracklist.length : null,
            tracks: this.extractTracks(release.tracklist),
            credits: this.extractCredits(release.extraartists),
            genres: [...new Set(genres)],
            notes: release.notes || null,
            country: release.country || null,
            source: 'discogs'
        };
    }

    // Transform Discogs label search result to internal format
    transformLabelSearchResult(label) {
        return {
            discogs_id: label.id,
            name: label.title,
            image_url: label.thumb || label.cover_image || null,
            resource_url: label.resource_url,
            source: 'discogs'
        };
    }

    // Transform Discogs label data to internal format
    transformLabel(label) {
        return {
            discogs_id: label.id,
            name: label.name,
            description: label.profile || null,
            image_url: label.images && label.images.length > 0 ? 
                label.images[0].uri : null,
            contact_info: label.contact_info || null,
            parent_label: label.parent_label ? label.parent_label.name : null,
            sublabels: label.sublabels ? label.sublabels.map(sub => sub.name) : [],
            urls: label.urls || [],
            source: 'discogs'
        };
    }

    // Extract artist name from Discogs title format "Artist - Title"
    extractArtistName(title) {
        if (!title) return 'Unknown Artist';
        
        const parts = title.split(' - ');
        if (parts.length > 1) {
            return parts[0].trim();
        }
        
        return 'Unknown Artist';
    }

    // Determine release type from formats
    determineReleaseType(formats) {
        if (!formats || formats.length === 0) return null;
        
        const format = formats[0];
        const name = format.name ? format.name.toLowerCase() : '';
        
        if (name.includes('lp') || name.includes('album')) return 'Album';
        if (name.includes('single') || name.includes('7"')) return 'Single';
        if (name.includes('ep')) return 'EP';
        if (name.includes('compilation')) return 'Compilation';
        
        return format.name || null;
    }

    // Extract tracks from tracklist
    extractTracks(tracklist) {
        if (!tracklist || !Array.isArray(tracklist)) return [];
        
        return tracklist.map((track, index) => ({
            position: track.position || (index + 1).toString(),
            title: track.title,
            duration: track.duration || null,
            artist_credit: track.artists ? track.artists.map(a => a.name) : null
        }));
    }

    // Extract credits from extraartists
    extractCredits(extraartists) {
        if (!extraartists || !Array.isArray(extraartists)) return [];
        
        return extraartists.map(credit => ({
            person_name: credit.name,
            role: credit.role,
            tracks: credit.tracks || null
        }));
    }

    // Extract specific identifier from identifiers array
    extractIdentifier(identifiers, type) {
        if (!identifiers || !Array.isArray(identifiers)) return null;
        
        const identifier = identifiers.find(id => id.type === type);
        return identifier ? identifier.value : null;
    }

    // Get source reliability score
    getReliabilityScore() {
        return 0.8; // Discogs is quite reliable for release information
    }
}

module.exports = DiscogsConnector;