const axios = require('axios');

class iTunesConnector {
    constructor() {
        this.baseUrl = 'https://itunes.apple.com/search';
        this.timeout = 5000;
    }

    async searchArtist(query, options = {}) {
        try {
            console.log(`iTunesConnector: Searching for artist "${query}"`);
            
            const response = await axios.get(this.baseUrl, {
                params: {
                    term: query,
                    entity: 'musicArtist',
                    limit: options.limit || 10
                },
                timeout: this.timeout
            });

            const results = response.data.results || [];
            return results.map(artist => this.transformArtistData(artist));
        } catch (error) {
            console.error(`iTunesConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async searchAlbum(artist, album, options = {}) {
        try {
            console.log(`iTunesConnector: Searching for album "${album}" by "${artist}"`);
            
            const searchTerm = artist && album ? `${artist} ${album}` : album || artist;
            const response = await axios.get(this.baseUrl, {
                params: {
                    term: searchTerm,
                    entity: 'album',
                    limit: options.limit || 10
                },
                timeout: this.timeout
            });

            const results = response.data.results || [];
            return results.map(album => this.transformAlbumData(album));
        } catch (error) {
            console.error(`iTunesConnector: Album search failed for "${album}" by "${artist}":`, error.message);
            return [];
        }
    }

    async getArtworkUrl(artist, album, size = 600) {
        try {
            const albums = await this.searchAlbum(artist, album, { limit: 1 });
            if (albums.length > 0 && albums[0].artworkUrl) {
                // iTunes artwork URLs can be resized by changing the size parameter
                return albums[0].artworkUrl.replace(/\d+x\d+/, `${size}x${size}`);
            }
            return null;
        } catch (error) {
            console.error(`iTunesConnector: Artwork fetch failed for "${album}" by "${artist}":`, error.message);
            return null;
        }
    }

    transformArtistData(data) {
        return {
            id: data.artistId,
            name: data.artistName,
            primaryGenre: data.primaryGenreName,
            genres: [data.primaryGenreName].filter(Boolean),
            artworkUrl: null, // iTunes doesn't provide artist artwork in search results
            iTunesUrl: data.artistLinkUrl,
            source: 'itunes',
            confidence: this.calculateConfidence(data),
            raw: data
        };
    }

    transformAlbumData(data) {
        return {
            id: data.collectionId,
            name: data.collectionName,
            artist: data.artistName,
            artistId: data.artistId,
            releaseDate: data.releaseDate ? new Date(data.releaseDate).getFullYear() : null,
            trackCount: data.trackCount,
            primaryGenre: data.primaryGenreName,
            genres: [data.primaryGenreName].filter(Boolean),
            artworkUrl: data.artworkUrl100 || data.artworkUrl60,
            iTunesUrl: data.collectionViewUrl,
            price: data.collectionPrice,
            currency: data.currency,
            country: data.country,
            source: 'itunes',
            confidence: this.calculateConfidence(data),
            raw: data
        };
    }

    // Get artist discography
    async getArtistDiscography(artistName) {
        try {
            console.log(`iTunesConnector: Getting discography for "${artistName}"`);
            
            const response = await axios.get(this.baseUrl, {
                params: {
                    term: artistName,
                    entity: 'album',
                    limit: 50
                },
                timeout: this.timeout
            });

            const results = response.data.results || [];
            const albums = results
                .filter(item => item.wrapperType === 'collection')
                .map(album => ({
                    id: album.collectionId,
                    title: album.collectionName,
                    artist_name: album.artistName,
                    release_date: album.releaseDate,
                    release_type: this.mapCollectionType(album.collectionType),
                    artwork_url: album.artworkUrl100?.replace('100x100', '600x600'),
                    track_count: album.trackCount,
                    label_name: album.copyright,
                    genres: [album.primaryGenreName].filter(Boolean),
                    confidence: this.calculateAlbumConfidence(album)
                }));

            return { albums, source: 'itunes' };
        } catch (error) {
            console.error(`iTunesConnector: Discography fetch failed for "${artistName}":`, error.message);
            return { albums: [], source: 'itunes' };
        }
    }

    // Get similar artists (iTunes doesn't provide this, so return empty)
    async getSimilarArtists(artistName) {
        console.log(`iTunesConnector: Similar artists not supported for "${artistName}"`);
        return { artists: [], source: 'itunes' };
    }

    mapCollectionType(type) {
        switch (type?.toLowerCase()) {
            case 'album': return 'album';
            case 'single': return 'single';
            case 'ep': return 'ep';
            case 'compilation': return 'compilation';
            default: return 'album';
        }
    }

    calculateAlbumConfidence(album) {
        let confidence = 0.6; // Base confidence for iTunes
        
        if (album.collectionName && album.artistName) confidence += 0.1;
        if (album.artworkUrl100) confidence += 0.1;
        if (album.releaseDate) confidence += 0.1;
        if (album.trackCount > 0) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    calculateConfidence(data) {
        let confidence = 0.6; // Base confidence for iTunes
        
        // Higher confidence for exact matches and complete data
        if (data.artistName && data.collectionName) confidence += 0.1;
        if (data.artworkUrl100) confidence += 0.1;
        if (data.releaseDate) confidence += 0.1;
        if (data.trackCount > 0) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    // Utility method for backward compatibility with existing code
    async getArtworkFromITunes(artist, album) {
        return await this.getArtworkUrl(artist, album);
    }
}

module.exports = iTunesConnector;