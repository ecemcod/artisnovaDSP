const axios = require('axios');

class MusicBrainzConnector {
    constructor(options = {}) {
        this.baseURL = options.baseURL || 'https://musicbrainz.org/ws/2';
        this.userAgent = options.userAgent || 'ArtisNova/1.0.0 (contact@example.com)';
        this.rateLimit = options.rateLimit || 1000; // 1 request per second
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
            const response = await axios.get(`${this.baseURL}/${endpoint}`, {
                params: {
                    fmt: 'json',
                    ...params
                },
                headers: {
                    'User-Agent': this.userAgent
                },
                timeout: this.timeout
            });

            return response.data;
        } catch (error) {
            console.error(`MusicBrainzConnector: Request failed for ${endpoint}:`, error.message);
            throw error;
        }
    }

    async searchArtist(query, limit = 25) {
        try {
            console.log(`MusicBrainzConnector: Searching for artist "${query}"`);
            
            const data = await this.makeRequest('artist', {
                query: query,
                limit: limit
            });

            if (!data.artists || data.artists.length === 0) {
                return [];
            }

            return data.artists
                .filter(artist => {
                    // Filter out junk artists
                    const name = (artist.name || '').trim();
                    const isJunk = name.length <= 1 ||
                        /^[\/\.\s\-\,]+$/.test(name) ||
                        ['unknown', '[unknown]', 'unknown artist', '[no artist]'].includes(name.toLowerCase());
                    return !isJunk;
                })
                .map(artist => this.transformArtist(artist));
        } catch (error) {
            console.error(`MusicBrainzConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtist(mbid, includes = ['genres', 'tags']) {
        try {
            console.log(`MusicBrainzConnector: Getting artist details for MBID "${mbid}"`);
            
            const data = await this.makeRequest(`artist/${mbid}`, {
                inc: includes.join('+')
            });

            return this.transformArtist(data);
        } catch (error) {
            console.error(`MusicBrainzConnector: Artist details failed for MBID "${mbid}":`, error.message);
            return null;
        }
    }

    async getArtistReleases(mbid, limit = 50) {
        try {
            console.log(`MusicBrainzConnector: Getting releases for artist MBID "${mbid}"`);
            
            const data = await this.makeRequest(`release`, {
                artist: mbid,
                limit: limit,
                inc: 'release-groups+labels'
            });

            if (!data.releases || data.releases.length === 0) {
                return [];
            }

            return data.releases.map(release => this.transformRelease(release));
        } catch (error) {
            console.error(`MusicBrainzConnector: Artist releases failed for MBID "${mbid}":`, error.message);
            return [];
        }
    }

    async searchRelease(query, artistName = null, limit = 25) {
        try {
            let searchQuery = query;
            if (artistName) {
                searchQuery = `release:"${query}" AND artist:"${artistName}"`;
            }
            
            console.log(`MusicBrainzConnector: Searching for release "${searchQuery}"`);
            
            const data = await this.makeRequest('release', {
                query: searchQuery,
                limit: limit,
                inc: 'artist-credits+labels+release-groups'
            });

            if (!data.releases || data.releases.length === 0) {
                return [];
            }

            return data.releases.map(release => this.transformRelease(release));
        } catch (error) {
            console.error(`MusicBrainzConnector: Release search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getRelease(mbid, includes = ['artist-credits', 'labels', 'recordings']) {
        try {
            console.log(`MusicBrainzConnector: Getting release details for MBID "${mbid}"`);
            
            const data = await this.makeRequest(`release/${mbid}`, {
                inc: includes.join('+')
            });

            return this.transformRelease(data);
        } catch (error) {
            console.error(`MusicBrainzConnector: Release details failed for MBID "${mbid}":`, error.message);
            return null;
        }
    }

    async searchLabel(query, limit = 25) {
        try {
            console.log(`MusicBrainzConnector: Searching for label "${query}"`);
            
            const data = await this.makeRequest('label', {
                query: query,
                limit: limit
            });

            if (!data.labels || data.labels.length === 0) {
                return [];
            }

            return data.labels.map(label => this.transformLabel(label));
        } catch (error) {
            console.error(`MusicBrainzConnector: Label search failed for "${query}":`, error.message);
            return [];
        }
    }

    async getArtistImage(mbid) {
        try {
            console.log(`MusicBrainzConnector: Getting artist image for MBID "${mbid}"`);
            
            // Try to get artist image from Cover Art Archive
            const response = await axios.get(`https://coverartarchive.org/artist/${mbid}`, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            if (response.data && response.data.images && response.data.images.length > 0) {
                // Return the first available image
                const image = response.data.images[0];
                return {
                    url: image.image,
                    thumbnails: image.thumbnails || {}
                };
            }
            
            return null;
        } catch (error) {
            // Cover Art Archive returns 404 if no images found, which is normal
            if (error.response && error.response.status === 404) {
                console.log(`MusicBrainzConnector: No artist image found for MBID "${mbid}"`);
            } else {
                console.error(`MusicBrainzConnector: Artist image request failed for MBID "${mbid}":`, error.message);
            }
            return null;
        }
    }

    async getReleaseArtwork(mbid) {
        try {
            console.log(`MusicBrainzConnector: Getting release artwork for MBID "${mbid}"`);
            
            const response = await axios.get(`https://coverartarchive.org/release/${mbid}`, {
                timeout: this.timeout,
                headers: {
                    'User-Agent': this.userAgent
                }
            });

            if (response.data && response.data.images && response.data.images.length > 0) {
                // Return front cover if available, otherwise first image
                const frontCover = response.data.images.find(img => img.front === true);
                const image = frontCover || response.data.images[0];
                
                return {
                    url: image.image,
                    thumbnails: image.thumbnails || {}
                };
            }
            
            return null;
        } catch (error) {
            if (error.response && error.response.status === 404) {
                console.log(`MusicBrainzConnector: No release artwork found for MBID "${mbid}"`);
            } else {
                console.error(`MusicBrainzConnector: Release artwork request failed for MBID "${mbid}":`, error.message);
            }
            return null;
        }
    }

    // Get album credits (personnel information)
    async getAlbumCredits(albumId) {
        try {
            console.log(`MusicBrainzConnector: Fetching credits for album "${albumId}"`);

            // First try to find the release by searching
            const searchUrl = `${this.baseUrl}/release/?query=${encodeURIComponent(albumId)}&fmt=json&inc=artist-credits+recordings+artist-rels+work-rels`;
            
            await this.rateLimiter();
            const searchResponse = await axios.get(searchUrl, { 
                headers: this.headers,
                timeout: 10000 
            });

            if (!searchResponse.data.releases || searchResponse.data.releases.length === 0) {
                return { credits: [], source: 'musicbrainz' };
            }

            const release = searchResponse.data.releases[0];
            
            // Get detailed release information with relationships
            const releaseUrl = `${this.baseUrl}/release/${release.id}?fmt=json&inc=artist-credits+recordings+artist-rels+work-rels+recording-rels`;
            
            await this.rateLimiter();
            const releaseResponse = await axios.get(releaseUrl, { 
                headers: this.headers,
                timeout: 10000 
            });

            const releaseData = releaseResponse.data;
            const credits = [];

            // Extract artist credits from the release
            if (releaseData['artist-credit']) {
                releaseData['artist-credit'].forEach(credit => {
                    if (credit.artist) {
                        credits.push({
                            name: credit.artist.name,
                            role: 'Artist',
                            type: 'primary'
                        });
                    }
                });
            }

            // Extract credits from relationships
            if (releaseData.relations) {
                releaseData.relations.forEach(relation => {
                    if (relation.artist && relation.type) {
                        credits.push({
                            name: relation.artist.name,
                            role: relation.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                            type: 'contributor',
                            attributes: relation.attributes || []
                        });
                    }
                });
            }

            // Extract credits from recordings (tracks)
            if (releaseData.media) {
                releaseData.media.forEach(medium => {
                    if (medium.tracks) {
                        medium.tracks.forEach(track => {
                            if (track.recording && track.recording.relations) {
                                track.recording.relations.forEach(relation => {
                                    if (relation.artist && relation.type) {
                                        credits.push({
                                            name: relation.artist.name,
                                            role: relation.type.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
                                            type: 'track-contributor',
                                            track: track.title,
                                            attributes: relation.attributes || []
                                        });
                                    }
                                });
                            }
                        });
                    }
                });
            }

            // Remove duplicates and group by role
            const uniqueCredits = credits.reduce((acc, credit) => {
                const key = `${credit.name}-${credit.role}`;
                if (!acc[key]) {
                    acc[key] = credit;
                } else {
                    // Merge track information if it exists
                    if (credit.track && !acc[key].track) {
                        acc[key].track = credit.track;
                    }
                }
                return acc;
            }, {});

            return {
                credits: Object.values(uniqueCredits),
                source: 'musicbrainz',
                total: Object.keys(uniqueCredits).length
            };

        } catch (error) {
            console.error('MusicBrainzConnector: Error fetching album credits:', error.message);
            return { credits: [], source: 'musicbrainz', error: error.message };
        }
    }

    // Transform MusicBrainz artist data to internal format
    transformArtist(artist) {
        const genres = [];
        
        // Extract genres from tags
        if (artist.tags && Array.isArray(artist.tags)) {
            genres.push(...artist.tags.map(tag => tag.name));
        }
        
        // Extract genres from genres field (if available)
        if (artist.genres && Array.isArray(artist.genres)) {
            genres.push(...artist.genres.map(genre => genre.name));
        }

        return {
            mbid: artist.id,
            name: artist.name,
            sort_name: artist['sort-name'],
            disambiguation: artist.disambiguation || null,
            type: artist.type,
            gender: artist.gender || null,
            country: artist.country || (artist.area && artist.area.name) || null,
            area: artist.area && artist.area.name || null,
            begin_date: this.formatDate(artist['life-span'] && artist['life-span'].begin),
            end_date: this.formatDate(artist['life-span'] && artist['life-span'].end),
            biography: null, // MusicBrainz doesn't provide biographies
            image_url: null, // MusicBrainz doesn't provide images directly
            genres: [...new Set(genres)], // Remove duplicates
            source: 'musicbrainz'
        };
    }

    // Transform MusicBrainz release data to internal format
    transformRelease(release) {
        const artistName = release['artist-credit'] && release['artist-credit'].length > 0 ?
            release['artist-credit'][0].name : 'Unknown Artist';
        
        const labelName = release['label-info'] && release['label-info'].length > 0 ?
            release['label-info'][0].label && release['label-info'][0].label.name : null;
        
        const catalogNumber = release['label-info'] && release['label-info'].length > 0 ?
            release['label-info'][0]['catalog-number'] : null;

        return {
            mbid: release.id,
            title: release.title,
            disambiguation: release.disambiguation || null,
            artist_name: artistName,
            release_date: this.formatDate(release.date),
            release_type: release['release-group'] && release['release-group']['primary-type'] || null,
            status: release.status,
            label_name: labelName,
            catalog_number: catalogNumber,
            barcode: release.barcode || null,
            artwork_url: null, // Would need separate Cover Art Archive API call
            track_count: release['track-count'] || null,
            disc_count: release['media'] ? release['media'].length : null,
            tracks: this.extractTracks(release.media),
            source: 'musicbrainz'
        };
    }

    // Transform MusicBrainz label data to internal format
    transformLabel(label) {
        return {
            mbid: label.id,
            name: label.name,
            sort_name: label['sort-name'],
            type: label.type,
            label_code: label['label-code'] || null,
            country: label.country || (label.area && label.area.name) || null,
            founded_year: this.extractYear(label['life-span'] && label['life-span'].begin),
            dissolved_year: this.extractYear(label['life-span'] && label['life-span'].end),
            description: null, // MusicBrainz doesn't provide descriptions
            website: null, // Would need to extract from relations
            source: 'musicbrainz'
        };
    }

    // Extract tracks from media array
    extractTracks(media) {
        if (!media || !Array.isArray(media)) return [];
        
        const tracks = [];
        media.forEach((disc, discIndex) => {
            if (disc.tracks && Array.isArray(disc.tracks)) {
                disc.tracks.forEach(track => {
                    tracks.push({
                        mbid: track.id,
                        title: track.title,
                        position: track.position,
                        disc_number: discIndex + 1,
                        duration: track.length || null, // in milliseconds
                        artist_credit: track['artist-credit'] ? 
                            track['artist-credit'].map(ac => ac.name) : null
                    });
                });
            }
        });
        
        return tracks;
    }

    // Format date string
    formatDate(dateStr) {
        if (!dateStr) return null;
        
        // MusicBrainz dates can be partial (YYYY, YYYY-MM, YYYY-MM-DD)
        const parts = dateStr.split('-');
        if (parts.length === 1 && parts[0].length === 4) {
            return `${parts[0]}-01-01`; // Default to January 1st
        } else if (parts.length === 2) {
            return `${parts[0]}-${parts[1]}-01`; // Default to 1st of month
        }
        
        return dateStr;
    }

    // Extract year from date string
    extractYear(dateStr) {
        if (!dateStr) return null;
        const year = parseInt(dateStr.split('-')[0]);
        return isNaN(year) ? null : year;
    }

    // Get source reliability score
    getReliabilityScore() {
        return 0.9; // MusicBrainz is highly reliable
    }
}

module.exports = MusicBrainzConnector;