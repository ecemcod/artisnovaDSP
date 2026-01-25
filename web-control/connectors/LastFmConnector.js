const axios = require('axios');

class LastFmConnector {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://ws.audioscrobbler.com/2.0/';
        this.apiKey = options.apiKey || null; // Last.fm API key required
        this.rateLimit = options.rateLimit || 200; // 5 requests per second
        this.lastRequest = 0;
        this.timeout = options.timeout || 5000;
    }

    async makeRequest(method, params = {}) {
        if (!this.apiKey) {
            throw new Error('LastFmConnector: API key is required');
        }

        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        if (timeSinceLastRequest < this.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, this.rateLimit - timeSinceLastRequest));
        }
        this.lastRequest = Date.now();

        try {
            const response = await axios.get(this.baseURL, {
                params: {
                    method: method,
                    api_key: this.apiKey,
                    format: 'json',
                    ...params
                },
                timeout: this.timeout
            });

            return response.data;
        } catch (error) {
            console.error(`LastFmConnector: Request failed for ${method}:`, error.message);
            throw error;
        }
    }

    async searchArtist(query, limit = 30) {
        try {
            console.log(`LastFmConnector: Searching for artist "${query}"`);
            
            const data = await this.makeRequest('artist.search', {
                artist: query,
                limit: limit
            });

            if (!data.results || !data.results.artistmatches || !data.results.artistmatches.artist) {
                return [];
            }

            const artists = Array.isArray(data.results.artistmatches.artist) ? 
                data.results.artistmatches.artist : [data.results.artistmatches.artist];

            return artists.map(artist => this.transformArtistSearchResult(artist));
        } catch (error) {
            console.error(`LastFmConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtistInfo(artistName) {
        try {
            console.log(`LastFmConnector: Getting artist info for "${artistName}"`);
            
            const data = await this.makeRequest('artist.getinfo', {
                artist: artistName,
                autocorrect: 1
            });

            if (!data.artist) {
                return null;
            }

            return this.transformArtist(data.artist);
        } catch (error) {
            console.error(`LastFmConnector: Artist info failed for "${artistName}":`, error.message);
            return null;
        }
    }

    async getSimilarArtists(artistName, limit = 20) {
        try {
            console.log(`LastFmConnector: Getting similar artists for "${artistName}"`);
            
            const data = await this.makeRequest('artist.getsimilar', {
                artist: artistName,
                limit: limit,
                autocorrect: 1
            });

            if (!data.similarartists || !data.similarartists.artist) {
                return [];
            }

            const artists = Array.isArray(data.similarartists.artist) ? 
                data.similarartists.artist : [data.similarartists.artist];

            return artists.map(artist => this.transformSimilarArtist(artist));
        } catch (error) {
            console.error(`LastFmConnector: Similar artists failed for "${artistName}":`, error.message);
            return [];
        }
    }

    async getArtistTopTags(artistName, limit = 10) {
        try {
            console.log(`LastFmConnector: Getting top tags for artist "${artistName}"`);
            
            const data = await this.makeRequest('artist.gettoptags', {
                artist: artistName,
                limit: limit,
                autocorrect: 1
            });

            if (!data.toptags || !data.toptags.tag) {
                return [];
            }

            const tags = Array.isArray(data.toptags.tag) ? 
                data.toptags.tag : [data.toptags.tag];

            return tags.map(tag => ({
                name: tag.name,
                count: parseInt(tag.count) || 0,
                url: tag.url
            }));
        } catch (error) {
            console.error(`LastFmConnector: Artist top tags failed for "${artistName}":`, error.message);
            return [];
        }
    }

    async getArtistTopAlbums(artistName, limit = 20) {
        try {
            console.log(`LastFmConnector: Getting top albums for artist "${artistName}"`);
            
            const data = await this.makeRequest('artist.gettopalbums', {
                artist: artistName,
                limit: limit,
                autocorrect: 1
            });

            if (!data.topalbums || !data.topalbums.album) {
                return [];
            }

            const albums = Array.isArray(data.topalbums.album) ? 
                data.topalbums.album : [data.topalbums.album];

            return albums.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.error(`LastFmConnector: Artist top albums failed for "${artistName}":`, error.message);
            return [];
        }
    }

    async searchAlbum(query, artistName = null, limit = 30) {
        try {
            console.log(`LastFmConnector: Searching for album "${query}" by "${artistName || 'any artist'}"`);
            
            const data = await this.makeRequest('album.search', {
                album: query,
                limit: limit
            });

            if (!data.results || !data.results.albummatches || !data.results.albummatches.album) {
                return [];
            }

            const albums = Array.isArray(data.results.albummatches.album) ? 
                data.results.albummatches.album : [data.results.albummatches.album];

            // Filter by artist if specified
            let filteredAlbums = albums;
            if (artistName) {
                const artistLower = artistName.toLowerCase();
                filteredAlbums = albums.filter(album => 
                    album.artist && album.artist.toLowerCase().includes(artistLower)
                );
            }

            return filteredAlbums.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.error(`LastFmConnector: Album search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getAlbumInfo(artistName, albumName) {
        try {
            console.log(`LastFmConnector: Getting album info for "${albumName}" by "${artistName}"`);
            
            const data = await this.makeRequest('album.getinfo', {
                artist: artistName,
                album: albumName,
                autocorrect: 1
            });

            if (!data.album) {
                return null;
            }

            return this.transformAlbum(data.album);
        } catch (error) {
            console.error(`LastFmConnector: Album info failed for "${albumName}" by "${artistName}":`, error.message);
            return null;
        }
    }

    async getAlbumTopTags(artistName, albumName, limit = 10) {
        try {
            console.log(`LastFmConnector: Getting top tags for album "${albumName}" by "${artistName}"`);
            
            const data = await this.makeRequest('album.gettoptags', {
                artist: artistName,
                album: albumName,
                limit: limit,
                autocorrect: 1
            });

            if (!data.toptags || !data.toptags.tag) {
                return [];
            }

            const tags = Array.isArray(data.toptags.tag) ? 
                data.toptags.tag : [data.toptags.tag];

            return tags.map(tag => ({
                name: tag.name,
                count: parseInt(tag.count) || 0,
                url: tag.url
            }));
        } catch (error) {
            console.error(`LastFmConnector: Album top tags failed for "${albumName}":`, error.message);
            return [];
        }
    }

    // Transform Last.fm artist search result to internal format
    transformArtistSearchResult(artist) {
        return {
            name: artist.name,
            mbid: artist.mbid || null,
            url: artist.url,
            image_url: this.extractImageUrl(artist.image),
            listeners: parseInt(artist.listeners) || 0,
            source: 'lastfm'
        };
    }

    // Transform Last.fm artist data to internal format
    transformArtist(artist) {
        const tags = [];
        
        // Extract tags
        if (artist.tags && artist.tags.tag) {
            const tagList = Array.isArray(artist.tags.tag) ? artist.tags.tag : [artist.tags.tag];
            tags.push(...tagList.map(tag => tag.name));
        }

        return {
            name: artist.name,
            mbid: artist.mbid || null,
            biography: this.cleanBiography(artist.bio && artist.bio.content),
            url: artist.url,
            image_url: this.extractImageUrl(artist.image),
            listeners: parseInt(artist.stats && artist.stats.listeners) || 0,
            playcount: parseInt(artist.stats && artist.stats.playcount) || 0,
            genres: tags,
            similar_artists: artist.similar && artist.similar.artist ? 
                artist.similar.artist.map(a => a.name) : [],
            source: 'lastfm'
        };
    }

    // Transform Last.fm similar artist data to internal format
    transformSimilarArtist(artist) {
        return {
            name: artist.name,
            mbid: artist.mbid || null,
            url: artist.url,
            image_url: this.extractImageUrl(artist.image),
            match: parseFloat(artist.match) || 0,
            source: 'lastfm'
        };
    }

    // Transform Last.fm album search result to internal format
    transformAlbumSearchResult(album) {
        return {
            title: album.name,
            artist_name: album.artist,
            mbid: album.mbid || null,
            url: album.url,
            image_url: this.extractImageUrl(album.image),
            listeners: parseInt(album.listeners) || 0,
            playcount: parseInt(album.playcount) || 0,
            source: 'lastfm'
        };
    }

    // Transform Last.fm album data to internal format
    transformAlbum(album) {
        const tags = [];
        
        // Extract tags
        if (album.tags && album.tags.tag) {
            const tagList = Array.isArray(album.tags.tag) ? album.tags.tag : [album.tags.tag];
            tags.push(...tagList.map(tag => tag.name));
        }

        // Extract tracks
        const tracks = [];
        if (album.tracks && album.tracks.track) {
            const trackList = Array.isArray(album.tracks.track) ? album.tracks.track : [album.tracks.track];
            tracks.push(...trackList.map((track, index) => ({
                position: index + 1,
                title: track.name,
                duration: track.duration ? parseInt(track.duration) * 1000 : null, // Convert to milliseconds
                url: track.url,
                artist_credit: track.artist && track.artist.name ? [track.artist.name] : null
            })));
        }

        return {
            title: album.name,
            artist_name: album.artist,
            mbid: album.mbid || null,
            url: album.url,
            image_url: this.extractImageUrl(album.image),
            listeners: parseInt(album.listeners) || 0,
            playcount: parseInt(album.playcount) || 0,
            genres: tags,
            tracks: tracks,
            wiki: album.wiki ? {
                published: album.wiki.published,
                summary: this.cleanBiography(album.wiki.summary),
                content: this.cleanBiography(album.wiki.content)
            } : null,
            source: 'lastfm'
        };
    }

    // Extract the best quality image URL from Last.fm image array
    extractImageUrl(images) {
        if (!images || !Array.isArray(images)) return null;
        
        // Prefer larger images: extralarge > large > medium > small
        const sizePreference = ['extralarge', 'large', 'medium', 'small'];
        
        for (const size of sizePreference) {
            const image = images.find(img => img.size === size);
            if (image && image['#text']) {
                return image['#text'];
            }
        }
        
        // Fallback to first available image
        return images.length > 0 && images[0]['#text'] ? images[0]['#text'] : null;
    }

    // Get artist discography (Last.fm provides top albums)
    async getArtistDiscography(artistName) {
        try {
            console.log(`LastFmConnector: Getting discography for "${artistName}"`);
            
            const data = await this.makeRequest('artist.gettopalbums', {
                artist: artistName,
                limit: 50
            });

            if (!data.topalbums || !data.topalbums.album) {
                return { albums: [], source: 'lastfm' };
            }

            const albums = (Array.isArray(data.topalbums.album) ? data.topalbums.album : [data.topalbums.album])
                .map(album => ({
                    id: album.mbid || `lastfm-${album.name}-${album.artist.name}`.replace(/\s+/g, '-').toLowerCase(),
                    title: album.name,
                    artist_name: album.artist.name,
                    artwork_url: this.extractImageUrl(album.image, 'large'),
                    playcount: parseInt(album.playcount) || 0,
                    listeners: parseInt(album.listeners) || 0,
                    mbid: album.mbid,
                    url: album.url,
                    confidence: this.calculateAlbumConfidence(album)
                }))
                .filter(album => album.title && album.title.trim() !== '');

            return { albums, source: 'lastfm' };
        } catch (error) {
            console.error(`LastFmConnector: Discography fetch failed for "${artistName}":`, error.message);
            return { albums: [], source: 'lastfm' };
        }
    }

    // Get similar artists
    async getSimilarArtists(artistName) {
        try {
            console.log(`LastFmConnector: Getting similar artists for "${artistName}"`);
            
            const data = await this.makeRequest('artist.getsimilar', {
                artist: artistName,
                limit: 20
            });

            if (!data.similarartists || !data.similarartists.artist) {
                return { artists: [], source: 'lastfm' };
            }

            const artists = (Array.isArray(data.similarartists.artist) ? data.similarartists.artist : [data.similarartists.artist])
                .map(artist => ({
                    id: artist.mbid || artist.name.replace(/\s+/g, '-').toLowerCase(),
                    name: artist.name,
                    similarity_score: parseFloat(artist.match) || 0.5,
                    image_url: this.extractImageUrl(artist.image, 'large'),
                    mbid: artist.mbid,
                    url: artist.url,
                    listeners: parseInt(artist.listeners) || 0,
                    playcount: parseInt(artist.playcount) || 0,
                    confidence: this.calculateSimilarityConfidence(artist)
                }))
                .filter(artist => artist.name && artist.name.trim() !== '');

            return { artists, source: 'lastfm' };
        } catch (error) {
            console.error(`LastFmConnector: Similar artists fetch failed for "${artistName}":`, error.message);
            return { artists: [], source: 'lastfm' };
        }
    }

    calculateAlbumConfidence(album) {
        let confidence = 0.7; // Base confidence for Last.fm
        
        if (album.mbid) confidence += 0.1;
        if (album.playcount && parseInt(album.playcount) > 1000) confidence += 0.1;
        if (album.listeners && parseInt(album.listeners) > 100) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    calculateSimilarityConfidence(artist) {
        let confidence = 0.7; // Base confidence for Last.fm
        
        if (artist.mbid) confidence += 0.1;
        if (artist.match && parseFloat(artist.match) > 0.7) confidence += 0.1;
        if (artist.listeners && parseInt(artist.listeners) > 1000) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    // Clean Last.fm biography text (remove HTML tags and Last.fm links)
    cleanBiography(text) {
        if (!text) return null;
        
        return text
            .replace(/<[^>]*>/g, '') // Remove HTML tags
            .replace(/\s*<a href="[^"]*">Read more on Last\.fm<\/a>\s*/g, '') // Remove Last.fm links
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
    }

    // Get source reliability score
    getReliabilityScore() {
        return 0.7; // Last.fm is good for biographies and tags but less reliable for structured data
    }
}

module.exports = LastFmConnector;