const axios = require('axios');

class WikipediaConnector {
    constructor() {
        this.baseUrl = 'https://en.wikipedia.org/w/api.php';
        this.timeout = 5000;
    }

    async searchArtist(query, options = {}) {
        try {
            console.log(`WikipediaConnector: Searching for artist "${query}"`);
            
            // Try multiple search strategies
            const searchVariants = [
                `${query} (musician)`,
                `${query} (band)`,
                `${query} (singer)`,
                query
            ];

            for (const searchTerm of searchVariants) {
                const result = await this.searchPage(searchTerm);
                if (result) {
                    const artistData = await this.getArtistInfo(result.title);
                    if (artistData) {
                        return [artistData];
                    }
                }
            }

            return [];
        } catch (error) {
            console.error(`WikipediaConnector: Artist search failed for "${query}":`, error.message);
            return [];
        }
    }

    async searchPage(query) {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    action: 'query',
                    list: 'search',
                    srsearch: query,
                    format: 'json',
                    origin: '*',
                    srlimit: 1
                },
                timeout: this.timeout
            });

            const results = response.data?.query?.search || [];
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            console.error(`WikipediaConnector: Page search failed for "${query}":`, error.message);
            return null;
        }
    }

    async getArtistInfo(title) {
        try {
            console.log(`WikipediaConnector: Getting info for page "${title}"`);
            
            // Get page extract (biography)
            const extractResponse = await axios.get(this.baseUrl, {
                params: {
                    action: 'query',
                    prop: 'extracts|pageimages',
                    exintro: true,
                    explaintext: true,
                    piprop: 'original',
                    titles: title,
                    format: 'json',
                    origin: '*'
                },
                timeout: this.timeout
            });

            const pages = extractResponse.data?.query?.pages || {};
            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];

            if (!page || page.missing) {
                return null;
            }

            // Get additional metadata from infobox if available
            const infoboxData = await this.getInfoboxData(title);

            return this.transformArtistData({
                title: page.title,
                extract: page.extract,
                image: page.original?.source,
                ...infoboxData
            });
        } catch (error) {
            console.error(`WikipediaConnector: Failed to get artist info for "${title}":`, error.message);
            return null;
        }
    }

    async getInfoboxData(title) {
        try {
            // Get page content to extract infobox data
            const response = await axios.get(this.baseUrl, {
                params: {
                    action: 'query',
                    prop: 'revisions',
                    rvprop: 'content',
                    rvslots: 'main',
                    titles: title,
                    format: 'json',
                    origin: '*'
                },
                timeout: this.timeout
            });

            const pages = response.data?.query?.pages || {};
            const pageId = Object.keys(pages)[0];
            const page = pages[pageId];
            
            if (!page || !page.revisions) {
                return {};
            }

            const content = page.revisions[0].slots.main['*'];
            return this.parseInfobox(content);
        } catch (error) {
            console.error(`WikipediaConnector: Failed to get infobox data for "${title}":`, error.message);
            return {};
        }
    }

    parseInfobox(content) {
        const infobox = {};
        
        try {
            // Extract basic information from infobox patterns
            const patterns = {
                origin: /\|\s*origin\s*=\s*([^\n\|]+)/i,
                formed: /\|\s*(?:years_active|formed)\s*=\s*([^\n\|]+)/i,
                genre: /\|\s*genre\s*=\s*([^\n\|]+)/i,
                label: /\|\s*label\s*=\s*([^\n\|]+)/i,
                website: /\|\s*website\s*=\s*([^\n\|]+)/i
            };

            for (const [key, pattern] of Object.entries(patterns)) {
                const match = content.match(pattern);
                if (match) {
                    // Clean up the extracted value
                    let value = match[1].trim()
                        .replace(/\[\[([^\]]+)\]\]/g, '$1') // Remove wiki links
                        .replace(/\{\{[^}]+\}\}/g, '') // Remove templates
                        .replace(/<[^>]+>/g, '') // Remove HTML tags
                        .trim();
                    
                    if (value && value !== '') {
                        infobox[key] = value;
                    }
                }
            }
        } catch (error) {
            console.error('WikipediaConnector: Error parsing infobox:', error.message);
        }

        return infobox;
    }

    transformArtistData(data) {
        // Extract genres from the genre field
        const genres = [];
        if (data.genre) {
            genres.push(...data.genre.split(/[,;]/).map(g => g.trim()).filter(Boolean));
        }

        // Extract formation year from formed field
        let formedYear = null;
        if (data.formed) {
            const yearMatch = data.formed.match(/(\d{4})/);
            if (yearMatch) {
                formedYear = parseInt(yearMatch[1]);
            }
        }

        return {
            id: data.title.replace(/\s+/g, '_'),
            name: data.title.replace(/\s*\([^)]+\)$/, ''), // Remove disambiguation
            biography: data.extract,
            origin: data.origin,
            formed: formedYear,
            genres: genres,
            labels: data.label ? [data.label] : [],
            website: data.website,
            imageUrl: data.image,
            wikipediaUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(data.title)}`,
            source: 'wikipedia',
            confidence: this.calculateConfidence(data),
            raw: data
        };
    }

    calculateConfidence(data) {
        let confidence = 0.5; // Base confidence for Wikipedia
        
        // Higher confidence for more complete data
        if (data.extract && data.extract.length > 100) confidence += 0.2;
        if (data.origin) confidence += 0.1;
        if (data.formed) confidence += 0.1;
        if (data.genre) confidence += 0.1;
        
        return Math.min(confidence, 1.0);
    }

    // Utility method for backward compatibility
    async fetchWikipediaBio(artistName) {
        try {
            const results = await this.searchArtist(artistName);
            return results.length > 0 ? results[0].biography : null;
        } catch (error) {
            console.error(`WikipediaConnector: Bio fetch failed for "${artistName}":`, error.message);
            return null;
        }
    }
}

module.exports = WikipediaConnector;