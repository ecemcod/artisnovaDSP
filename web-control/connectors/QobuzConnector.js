const axios = require('axios');
const crypto = require('crypto');

class QobuzConnector {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://www.qobuz.com/api.json/0.2';
        this.appId = options.appId || null;
        this.appSecret = options.appSecret || null;
        this.userAuthToken = options.userAuthToken || null;
        this.timeout = options.timeout || 10000;
        this.rateLimit = options.rateLimit || 500; // 2 requests per second
        this.lastRequest = 0;
        
        // Default app credentials (these are public from web player)
        this.defaultAppId = '285473059';
        this.defaultAppSecret = null; // Will be extracted dynamically if needed
    }

    async makeRequest(endpoint, params = {}, requiresAuth = false) {
        // Rate limiting
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequest;
        if (timeSinceLastRequest < this.rateLimit) {
            await new Promise(resolve => setTimeout(resolve, this.rateLimit - timeSinceLastRequest));
        }
        this.lastRequest = Date.now();

        try {
            const requestParams = {
                app_id: this.appId || this.defaultAppId,
                ...params
            };

            if (requiresAuth && this.userAuthToken) {
                requestParams.user_auth_token = this.userAuthToken;
            }

            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                params: requestParams,
                timeout: this.timeout,
                headers: {
                    'User-Agent': 'ArtisNova/1.0.0',
                    'Accept': 'application/json'
                }
            });

            return response.data;
        } catch (error) {
            // Log but don't throw - let the calling methods handle gracefully
            console.warn(`QobuzConnector: Request failed for ${endpoint}:`, error.message);
            if (error.response && error.response.status === 400) {
                console.warn('QobuzConnector: Invalid credentials - Qobuz integration disabled');
            }
            return null; // Return null instead of throwing
        }
    }

    async searchArtist(query, limit = 25) {
        try {
            console.log(`QobuzConnector: Searching for artist "${query}"`);
            
            const data = await this.makeRequest('artist/search', {
                query: query,
                limit: limit
            });

            if (!data || !data.artists || !data.artists.items || data.artists.items.length === 0) {
                console.log(`QobuzConnector: No artists found for "${query}"`);
                return [];
            }

            return data.artists.items.map(artist => this.transformArtistSearchResult(artist));
        } catch (error) {
            console.warn(`QobuzConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtist(id) {
        try {
            console.log(`QobuzConnector: Getting artist details for ID "${id}"`);
            
            const data = await this.makeRequest('artist/get', {
                artist_id: id,
                extra: 'albums,appears_on,similar_artists'
            });

            if (!data) {
                console.log(`QobuzConnector: No artist data found for ID "${id}"`);
                return null;
            }

            return this.transformArtist(data);
        } catch (error) {
            console.warn(`QobuzConnector: Artist details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    async getArtistAlbums(id, limit = 50) {
        try {
            console.log(`QobuzConnector: Getting albums for artist ID "${id}"`);
            
            const data = await this.makeRequest('artist/get', {
                artist_id: id,
                extra: 'albums',
                limit: limit
            });

            if (!data || !data.albums || !data.albums.items) {
                console.log(`QobuzConnector: No albums found for artist ID "${id}"`);
                return [];
            }

            return data.albums.items.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.warn(`QobuzConnector: Artist albums failed for ID "${id}":`, error.message);
            return [];
        }
    }

    async searchAlbum(query, artistName = null, limit = 25) {
        try {
            let searchQuery = query;
            if (artistName) {
                searchQuery = `${query} ${artistName}`;
            }
            
            console.log(`QobuzConnector: Searching for album "${searchQuery}"`);
            
            const data = await this.makeRequest('album/search', {
                query: searchQuery,
                limit: limit
            });

            if (!data || !data.albums || !data.albums.items || data.albums.items.length === 0) {
                console.log(`QobuzConnector: No albums found for "${searchQuery}"`);
                return [];
            }

            return data.albums.items.map(album => this.transformAlbumSearchResult(album));
        } catch (error) {
            console.warn(`QobuzConnector: Album search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getAlbum(id) {
        try {
            console.log(`QobuzConnector: Getting album details for ID "${id}"`);
            
            const data = await this.makeRequest('album/get', {
                album_id: id
            });

            if (!data) {
                console.log(`QobuzConnector: No album data found for ID "${id}"`);
                return null;
            }

            return this.transformAlbum(data);
        } catch (error) {
            console.warn(`QobuzConnector: Album details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    async searchTrack(query, artistName = null, albumName = null, limit = 25) {
        try {
            let searchQuery = query;
            if (artistName) {
                searchQuery = `${query} ${artistName}`;
            }
            if (albumName) {
                searchQuery = `${searchQuery} ${albumName}`;
            }
            
            console.log(`QobuzConnector: Searching for track "${searchQuery}"`);
            
            const data = await this.makeRequest('track/search', {
                query: searchQuery,
                limit: limit
            });

            if (!data || !data.tracks || !data.tracks.items || data.tracks.items.length === 0) {
                console.log(`QobuzConnector: No tracks found for "${searchQuery}"`);
                return [];
            }

            return data.tracks.items.map(track => this.transformTrackSearchResult(track));
        } catch (error) {
            console.warn(`QobuzConnector: Track search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getTrack(id) {
        try {
            console.log(`QobuzConnector: Getting track details for ID "${id}"`);
            
            const data = await this.makeRequest('track/get', {
                track_id: id
            });

            if (!data) {
                console.log(`QobuzConnector: No track data found for ID "${id}"`);
                return null;
            }

            return this.transformTrack(data);
        } catch (error) {
            console.warn(`QobuzConnector: Track details failed for ID "${id}":`, error.message);
            return null;
        }
    }

    // Transform Qobuz artist search result to internal format
    transformArtistSearchResult(artist) {
        return {
            qobuz_id: artist.id,
            name: artist.name,
            image_url: this.getHighQualityImage(artist.image),
            albums_count: artist.albums_count || 0,
            source: 'qobuz'
        };
    }

    // Transform Qobuz artist data to internal format
    transformArtist(artist) {
        const similarArtists = artist.similar_artists ? 
            artist.similar_artists.items.map(similar => ({
                qobuz_id: similar.id,
                name: similar.name,
                image_url: this.getHighQualityImage(similar.image)
            })) : [];

        return {
            qobuz_id: artist.id,
            name: artist.name,
            biography: artist.biography ? artist.biography.content : null,
            image_url: this.getHighQualityImage(artist.image),
            albums_count: artist.albums_count || 0,
            similar_artists: similarArtists,
            genres: artist.genre ? [artist.genre.name] : [],
            source: 'qobuz'
        };
    }

    // Transform Qobuz album search result to internal format
    transformAlbumSearchResult(album) {
        return {
            qobuz_id: album.id,
            title: album.title,
            artist_name: album.artist ? album.artist.name : 'Unknown Artist',
            artist_id: album.artist ? album.artist.id : null,
            release_date: album.released_at ? new Date(album.released_at * 1000).toISOString().split('T')[0] : null,
            artwork_url: this.getHighQualityImage(album.image),
            track_count: album.tracks_count || 0,
            duration: album.duration || 0,
            label: album.label ? album.label.name : null,
            genre: album.genre ? album.genre.name : null,
            source: 'qobuz'
        };
    }

    // Transform Qobuz album data to internal format
    transformAlbum(album) {
        const tracks = album.tracks && album.tracks.items ? 
            album.tracks.items.map(track => this.transformTrackSearchResult(track)) : [];

        // Clean up description by removing HTML tags and TiVo attribution
        let cleanDescription = null;
        if (album.description) {
            cleanDescription = album.description
                .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newlines
                .replace(/<[^>]*>/g, '')        // Remove HTML tags
                .replace(/&copy;\s*TiVo\s*$/i, '') // Remove TiVo attribution
                .trim();
        }

        return {
            qobuz_id: album.id,
            title: album.title,
            artist_name: album.artist ? album.artist.name : 'Unknown Artist',
            artist_id: album.artist ? album.artist.id : null,
            release_date: album.released_at ? new Date(album.released_at * 1000).toISOString().split('T')[0] : null,
            release_type: this.determineReleaseType(album),
            artwork_url: this.getHighQualityImage(album.image),
            track_count: album.tracks_count || 0,
            duration: album.duration || 0,
            label_name: album.label ? album.label.name : null,
            catalog_number: album.upc || null,
            barcode: album.upc || null,
            tracks: tracks,
            credits: this.extractCredits(album),
            genres: album.genre ? [album.genre.name] : [],
            description: cleanDescription, // Rich description from TiVo/Qobuz
            copyright: album.copyright || null,
            source: 'qobuz'
        };
    }

    // Transform Qobuz track search result to internal format
    transformTrackSearchResult(track) {
        return {
            qobuz_id: track.id,
            title: track.title,
            artist_name: track.performer ? track.performer.name : 'Unknown Artist',
            artist_id: track.performer ? track.performer.id : null,
            album_title: track.album ? track.album.title : null,
            album_id: track.album ? track.album.id : null,
            track_number: track.track_number || null,
            disc_number: track.media_number || 1,
            duration: track.duration || 0,
            artwork_url: track.album ? this.getHighQualityImage(track.album.image) : null,
            source: 'qobuz'
        };
    }

    // Transform Qobuz track data to internal format
    transformTrack(track) {
        return {
            qobuz_id: track.id,
            title: track.title,
            artist_name: track.performer ? track.performer.name : 'Unknown Artist',
            artist_id: track.performer ? track.performer.id : null,
            album_title: track.album ? track.album.title : null,
            album_id: track.album ? track.album.id : null,
            track_number: track.track_number || null,
            disc_number: track.media_number || 1,
            duration: track.duration || 0,
            artwork_url: track.album ? this.getHighQualityImage(track.album.image) : null,
            composer: track.composer ? track.composer.name : null,
            copyright: track.copyright || null,
            isrc: track.isrc || null,
            source: 'qobuz'
        };
    }

    // Get high quality image URL from Qobuz image object
    getHighQualityImage(imageObj) {
        if (!imageObj) return null;
        
        // Qobuz provides different sizes, prefer larger ones
        if (imageObj.large) return imageObj.large;
        if (imageObj.medium) return imageObj.medium;
        if (imageObj.small) return imageObj.small;
        
        // If it's just a string URL
        if (typeof imageObj === 'string') return imageObj;
        
        return null;
    }

    // Determine release type from album data
    determineReleaseType(album) {
        if (!album.genre) return 'Album';
        
        const title = album.title ? album.title.toLowerCase() : '';
        const trackCount = album.tracks_count || 0;
        
        if (title.includes('single') || trackCount <= 3) return 'Single';
        if (title.includes('ep') || (trackCount > 3 && trackCount <= 7)) return 'EP';
        if (title.includes('compilation') || title.includes('best of')) return 'Compilation';
        if (title.includes('live')) return 'Live Album';
        
        return 'Album';
    }

    // Extract credits from album data
    extractCredits(album) {
        const credits = [];
        
        if (album.artist) {
            credits.push({
                person_name: album.artist.name,
                role: 'Primary Artist'
            });
        }
        
        if (album.composer) {
            credits.push({
                person_name: album.composer.name,
                role: 'Composer'
            });
        }
        
        return credits;
    }

    // Get source reliability score
    getReliabilityScore() {
        return 0.9; // Qobuz is very reliable for high-quality metadata
    }

    // Get track lyrics (if available)
    async getLyrics(trackId) {
        try {
            console.log(`QobuzConnector: Getting lyrics for track ID "${trackId}"`);
            
            const data = await this.makeRequest('track/getLyrics', {
                track_id: trackId
            });

            if (!data || !data.lyrics) {
                console.log(`QobuzConnector: No lyrics found for track ID "${trackId}"`);
                return null;
            }

            return {
                lyrics: data.lyrics,
                source: 'qobuz',
                synchronized: data.synchronized || false
            };
        } catch (error) {
            console.warn(`QobuzConnector: Lyrics request failed for track ID "${trackId}":`, error.message);
            return null;
        }
    }

    // Format duration from seconds to MM:SS
    formatDuration(seconds) {
        if (!seconds) return null;
        
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
}

module.exports = QobuzConnector;