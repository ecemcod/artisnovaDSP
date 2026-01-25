const axios = require('axios');

class SpotifyConnector {
    constructor(options = {}) {
        this.baseURL = 'https://api.spotify.com/v1';
        this.clientId = options.clientId || null;
        this.clientSecret = options.clientSecret || null;
        this.accessToken = null;
        this.tokenExpiry = null;
        this.timeout = options.timeout || 5000;
        this.rateLimit = options.rateLimit || 100; // Spotify allows higher rate limits
        this.lastRequest = 0;
    }

    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        // Use public client credentials flow (no user auth needed for search)
        const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
        
        try {
            const response = await axios.post('https://accounts.spotify.com/api/token', 
                'grant_type=client_credentials',
                {
                    headers: {
                        'Authorization': `Basic ${credentials}`,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000) - 60000; // 1 minute buffer
            return this.accessToken;
        } catch (error) {
            console.warn('SpotifyConnector: Failed to get access token:', error.message);
            return null;
        }
    }

    async makeRequest(endpoint, params = {}) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        if (timeSinceLastRequest < this.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, this.rateLimit - timeSinceLastRequest));
        }
        this.lastRequest = Date.now();

        const token = await this.getAccessToken();
        if (!token) {
            console.warn('SpotifyConnector: No access token available');
            return null;
        }

        try {
            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                params: params,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/json'
                },
                timeout: this.timeout
            });

            return response.data;
        } catch (error) {
            console.warn(`SpotifyConnector: Request failed for ${endpoint}:`, error.message);
            return null;
        }
    }

    async searchArtist(query, limit = 25) {
        try {
            console.log(`SpotifyConnector: Searching for artist "${query}"`);
            
            const data = await this.makeRequest('search', {
                q: query,
                type: 'artist',
                limit: limit
            });

            if (!data || !data.artists || !data.artists.items || data.artists.items.length === 0) {
                console.log(`SpotifyConnector: No artists found for "${query}"`);
                return [];
            }

            return data.artists.items.map(artist => this.transformArtistSearchResult(artist));
        } catch (error) {
            console.warn(`SpotifyConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtist(id) {
        try {
            console.log(`SpotifyConnector: Getting artist details for ID "${id}"`);
            
            const data = await this.makeRequest(`artists/${id}`);
            if (!data) return null;

            return this.transformArtist(data);
        } catch (error) {
            console.warn(`SpotifyConnector: Artist details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    async getArtistAlbums(id, limit = 50) {
        try {
            console.log(`SpotifyConnector: Getting albums for artist ID "${id}"`);
            
            const data = await this.makeRequest(`artists/${id}/albums`, {
                include_groups: 'album,single,compilation',
                market: 'US',
                limit: limit
            });

            if (!data || !data.items || data.items.length === 0) {
                console.log(`SpotifyConnector: No albums found for artist ID "${id}"`);
                return [];
            }

            return data.items.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.warn(`SpotifyConnector: Artist albums failed for ID "${id}":`, error.message);
            return [];
        }
    }

    async searchAlbum(query, artistName = null, limit = 25) {
        try {
            let searchQuery = query;
            if (artistName) {
                searchQuery = `album:"${query}" artist:"${artistName}"`;
            }
            
            console.log(`SpotifyConnector: Searching for album "${searchQuery}"`);
            
            const data = await this.makeRequest('search', {
                q: searchQuery,
                type: 'album',
                limit: limit
            });

            if (!data || !data.albums || !data.albums.items || data.albums.items.length === 0) {
                console.log(`SpotifyConnector: No albums found for "${searchQuery}"`);
                return [];
            }

            return data.albums.items.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.warn(`SpotifyConnector: Album search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getAlbum(id) {
        try {
            console.log(`SpotifyConnector: Getting album details for ID "${id}"`);
            
            const data = await this.makeRequest(`albums/${id}`);
            if (!data) return null;

            return this.transformAlbum(data);
        } catch (error) {
            console.warn(`SpotifyConnector: Album details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    // Transform Spotify artist search result to internal format
    transformArtistSearchResult(artist) {
        return {
            spotify_id: artist.id,
            name: artist.name,
            image_url: this.getBestImage(artist.images),
            popularity: artist.popularity,
            followers: artist.followers ? artist.followers.total : 0,
            genres: artist.genres || [],
            source: 'spotify'
        };
    }

    // Transform Spotify artist data to internal format
    transformArtist(artist) {
        return {
            spotify_id: artist.id,
            name: artist.name,
            image_url: this.getBestImage(artist.images),
            popularity: artist.popularity,
            followers: artist.followers ? artist.followers.total : 0,
            genres: artist.genres || [],
            source: 'spotify'
        };
    }

    // Transform Spotify album search result to internal format
    transformAlbumSearchResult(album) {
        return {
            spotify_id: album.id,
            title: album.name,
            artist_name: album.artists && album.artists.length > 0 ? album.artists[0].name : 'Unknown Artist',
            artist_id: album.artists && album.artists.length > 0 ? album.artists[0].id : null,
            release_date: album.release_date,
            release_type: this.mapAlbumType(album.album_type),
            artwork_url: this.getBestImage(album.images),
            track_count: album.total_tracks,
            popularity: album.popularity || 0,
            source: 'spotify'
        };
    }

    // Transform Spotify album data to internal format
    transformAlbum(album) {
        const tracks = album.tracks && album.tracks.items ? 
            album.tracks.items.map((track, index) => ({
                spotify_id: track.id,
                position: track.track_number || index + 1,
                title: track.name,
                duration: track.duration_ms ? Math.round(track.duration_ms / 1000) : null,
                artist_name: track.artists && track.artists.length > 0 ? track.artists[0].name : album.artists[0].name,
                explicit: track.explicit || false
            })) : [];

        return {
            spotify_id: album.id,
            title: album.name,
            artist_name: album.artists && album.artists.length > 0 ? album.artists[0].name : 'Unknown Artist',
            artist_id: album.artists && album.artists.length > 0 ? album.artists[0].id : null,
            release_date: album.release_date,
            release_type: this.mapAlbumType(album.album_type),
            artwork_url: this.getBestImage(album.images),
            track_count: album.total_tracks,
            tracks: tracks,
            genres: album.genres || [],
            popularity: album.popularity || 0,
            label_name: album.label || null,
            copyright: album.copyrights && album.copyrights.length > 0 ? album.copyrights[0].text : null,
            source: 'spotify'
        };
    }

    // Get the best quality image from Spotify images array
    getBestImage(images) {
        if (!images || images.length === 0) return null;
        
        // Sort by size (largest first) and return the URL
        const sortedImages = images.sort((a, b) => (b.width || 0) - (a.width || 0));
        return sortedImages[0].url;
    }

    // Map Spotify album types to internal format
    mapAlbumType(spotifyType) {
        switch (spotifyType) {
            case 'album': return 'Album';
            case 'single': return 'Single';
            case 'compilation': return 'Compilation';
            default: return 'Album';
        }
    }

    // Get source reliability score
    getReliabilityScore() {
        return 0.85; // Spotify has excellent metadata and artwork
    }
}

module.exports = SpotifyConnector;