const axios = require('axios');

class LrcLibConnector {
    constructor(options = {}) {
        this.baseURL = 'https://lrclib.net/api';
        this.timeout = options.timeout || 15000;
        this.userAgent = options.userAgent || 'ArtisNova-DSP/1.2.2';
    }

    async makeRequest(endpoint, params = {}) {
        try {
            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                params: params,
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json'
                },
                timeout: this.timeout
            });

            return response.data;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return null;
            }
            console.warn(`LrcLibConnector: Request failed for ${endpoint} with params ${JSON.stringify(params)}:`, error.message);
            return null;
        }
    }

    normalizeMetadata(artist, track) {
        if (!artist || !track) return { artist: '', track: '' };

        let cleanArtist = artist
            .split(/[\\\/,;&]/)[0]
            .replace(/\s+(feat|ft)\.?\s+.*/i, '')
            .trim();

        let cleanTrack = track
            .replace(/\s*\((Live|Remastered|Deluxe|Deluxe Edition|Special Edition|Expanded|Anniversary|Remaster|Bonus Track Version|Radio Edit|Edit|Duet With.*)\)\s*$/i, '')
            .replace(/\s*\[(Live|Remastered|Deluxe|Special Edition)\]\s*$/i, '')
            .replace(/\s*-\s*(Live|Remastered|Deluxe|Single Version|Radio Edit).*/i, '')
            .trim();

        return { artist: cleanArtist, track: cleanTrack };
    }

    async getLyrics(trackName, artistName, albumName = null) {
        const { artist: cleanArtist, track: cleanTrack } = this.normalizeMetadata(artistName, trackName);
        console.log(`LrcLibConnector: Checking lyrics for "${cleanArtist}" - "${cleanTrack}"`);

        // Strategy A1: Direct Get with All Data
        console.log(`LrcLibConnector: Strategy A1 (Get with Album)`);
        let data = await this.makeRequest('get', {
            artist_name: cleanArtist,
            track_name: cleanTrack,
            album_name: albumName
        });

        if (data && (data.plainLyrics || data.syncedLyrics)) {
            return this.transformLyrics(data);
        }

        // Strategy A2: Direct Get without Album (More flexible)
        if (albumName) {
            console.log(`LrcLibConnector: Strategy A2 (Get without Album)`);
            data = await this.makeRequest('get', {
                artist_name: cleanArtist,
                track_name: cleanTrack
            });

            if (data && (data.plainLyrics || data.syncedLyrics)) {
                return this.transformLyrics(data);
            }
        }

        // Strategy B: Search with Normalized Concatenation
        console.log(`LrcLibConnector: Trying Strategy B (Search Normalized)`);
        let searchData = await this.makeRequest('search', {
            q: `${cleanArtist} ${cleanTrack}`.replace(/\//g, ' ')
        });

        if (Array.isArray(searchData) && searchData.length > 0) {
            return this.transformLyrics(searchData[0]);
        }

        // Strategy C: Medley handling (split by /)
        if (cleanTrack.includes('/')) {
            const parts = cleanTrack.split('/').map(p => p.trim()).filter(p => p.length >= 3);
            console.log(`LrcLibConnector: Strategy C - Medley detected: ${parts.join(', ')}`);
            for (const part of parts) {
                console.log(`LrcLibConnector: Strategy C - Trying component: "${cleanArtist} ${part}"`);
                let medleySearchData = await this.makeRequest('search', {
                    q: `${cleanArtist} ${part}`.replace(/\//g, ' ')
                });

                if (Array.isArray(medleySearchData) && medleySearchData.length > 0) {
                    console.log(`LrcLibConnector: Strategy C - SUCCESS for component "${part}"`);
                    return this.transformLyrics(medleySearchData[0]);
                }
            }
        }

        return null;
    }

    transformLyrics(data) {
        return {
            lyrics: data.plainLyrics || data.syncedLyrics,
            synchronized: !!data.syncedLyrics,
            instrumental: !!data.instrumental,
            source: 'lrclib',
            lrclib_id: data.id
        };
    }

    getReliabilityScore() {
        return 0.7; // LrcLib is reliable for community-sourced lyrics
    }
}

module.exports = LrcLibConnector;
