import axios from 'axios';

// Simplified unified interfaces for all music data
export interface UnifiedArtist {
  id: string;
  name: string;
  image_url?: string;
  biography?: string;
  country?: string;
  type?: string;
  albums_count?: number;
  genres?: string[];
  source: string;
  weight: number;
  qobuz_id?: string;
  // Additional properties for compatibility
  begin_date?: string;
  end_date?: string;
  quality_score?: number;
  albums?: Array<{
    id: string;
    title: string;
    artwork_url?: string;
    release_date?: string;
    track_count?: number;
  }>;
  sources?: Array<{
    name: string;
    weight: number;
  }>;
  // Properties for SimilarArtists component
  artworkUrl?: string;
  similarity?: number;
  listeners?: number;
  playcount?: number;
  description?: string;
}

export interface UnifiedAlbum {
  id: string;
  title: string;
  artist_name?: string;
  artwork_url?: string;
  release_date?: string;
  track_count?: number;
  label_name?: string;
  description?: string;
  source: string;
  weight: number;
  qobuz_id?: string;
  // Additional properties for compatibility
  release_type?: string;
  catalog_number?: string;
  quality_score?: number;
  genres?: string[];
  tracks?: Array<{
    id: string;
    position: number;
    title: string;
    duration?: number;
    credits?: Array<{
      id: string;
      name: string;
      role: string;
      instruments?: string[];
    }>;
  }>;
  credits?: Array<{
    id: string;
    name: string;
    role: string;
    instruments?: string[];
  }>;
  sources?: Array<{
    name: string;
    weight: number;
  }>;
  // Properties for ArtistDiscography component
  artworkUrl?: string;
  type?: string;
  year?: string;
  trackCount?: number;
  label?: string;
}

export interface SearchResults {
  artists: UnifiedArtist[];
  albums: UnifiedAlbum[];
  tracks?: UnifiedTrack[];
}

export interface UnifiedTrack {
  id: string;
  title: string;
  artist_name?: string;
  album_title?: string;
  duration?: number;
  track_number?: number;
  source: string;
  weight: number;
  qobuz_id?: string;
}

export interface LyricsResult {
  lyrics: string | null;
  source: string;
  synchronized?: boolean;
  weight: number;
}

/**
 * Centralized Music Data Provider
 * Handles all music data fetching with automatic Qobuz prioritization
 */
class MusicDataProvider {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private readonly CACHE_TTL = 3600000; // 1 hour

  // Source priority weights (Qobuz always first)
  private readonly sourceWeights: Record<string, number> = {
    'qobuz': 1.0,
    'musicbrainz': 0.75,
    'discogs': 0.65,
    'lastfm': 0.55,
    'itunes': 0.35,
    'spotify': 0.45,
    'wikipedia': 0.3,
    'lrclib': 0.4
  };

  constructor() {
    console.log('MusicDataProvider: Initializing...');
  }

  private getCacheKey(type: string, query: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${type}:${query}:${paramStr}`;
  }

  private getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data as T;
    }
    if (cached) {
      this.cache.delete(key); // Remove expired
    }
    return null;
  }

  private setCache<T>(key: string, data: T, ttl: number = this.CACHE_TTL): void {
    this.cache.set(key, { data, timestamp: Date.now(), ttl });
  }

  /**
   * Search for artists with Qobuz priority
   */
  async searchArtists(query: string, limit: number = 10): Promise<UnifiedArtist[]> {
    console.log('MusicDataProvider: searchArtists called with query:', query, 'limit:', limit);
    
    const cacheKey = this.getCacheKey('search_artists', query, { limit });
    const cached = this.getFromCache<UnifiedArtist[]>(cacheKey);
    if (cached) {
      console.log('MusicDataProvider: searchArtists returning cached result');
      return cached;
    }

    try {
      console.log('MusicDataProvider: Making API request to /api/music/search');
      const response = await axios.get('/api/music/search', {
        params: { q: query, type: 'artist', limit },
        timeout: 5000 // Add timeout to prevent hanging
      });

      console.log('MusicDataProvider: API response received:', response.data);

      const artists: UnifiedArtist[] = (response.data.artists || []).map((artist: any) => {
        try {
          return {
            id: artist.id || artist.qobuz_id || artist.name || 'unknown',
            name: artist.name || 'Unknown Artist',
            image_url: artist.image_url,
            biography: artist.biography,
            country: artist.country,
            type: artist.type,
            albums_count: artist.albums_count,
            genres: Array.isArray(artist.genres) ? artist.genres : [],
            source: artist.source || 'unknown',
            weight: typeof artist.weight === 'number' ? artist.weight : this.sourceWeights[artist.source as keyof typeof this.sourceWeights] || 0.5,
            qobuz_id: artist.qobuz_id,
            // Compatibility mappings
            artworkUrl: artist.image_url,
            similarity: typeof artist.weight === 'number' ? artist.weight : 0.5,
            listeners: artist.listeners,
            playcount: artist.playcount,
            description: artist.biography
          };
        } catch (mappingError) {
          console.error('MusicDataProvider: Error mapping artist:', mappingError, artist);
          return {
            id: 'error',
            name: 'Error',
            source: 'error',
            weight: 0,
            genres: []
          };
        }
      }).filter((artist: UnifiedArtist) => artist.id !== 'error'); // Filter out error entries

      // Sort by weight (Qobuz first)
      artists.sort((a, b) => b.weight - a.weight);

      console.log('MusicDataProvider: searchArtists processed', artists.length, 'artists');
      this.setCache(cacheKey, artists);
      return artists;
    } catch (error) {
      console.error('MusicDataProvider: Artist search failed:', error);
      return [];
    }
  }

  /**
   * Search for albums with Qobuz priority
   */
  async searchAlbums(query: string, artist?: string, limit: number = 10): Promise<UnifiedAlbum[]> {
    const cacheKey = this.getCacheKey('search_albums', query, { artist, limit });
    const cached = this.getFromCache<UnifiedAlbum[]>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get('/api/music/search', {
        params: { q: query, type: 'album', artist, limit }
      });

      const albums: UnifiedAlbum[] = (response.data.albums || []).map((album: any) => ({
        id: album.id || album.qobuz_id || album.title,
        title: album.title,
        artist_name: album.artist_name,
        artwork_url: album.artwork_url,
        release_date: album.release_date,
        track_count: album.track_count,
        label_name: album.label_name || album.label,
        description: album.description,
        source: album.source || 'unknown',
        weight: album.weight || this.sourceWeights[album.source as keyof typeof this.sourceWeights] || 0.5,
        qobuz_id: album.qobuz_id,
        // Compatibility mappings
        artworkUrl: album.artwork_url,
        type: album.type || 'album',
        year: album.release_date ? new Date(album.release_date).getFullYear().toString() : undefined,
        trackCount: album.track_count,
        label: album.label_name || album.label
      }));

      // Sort by weight (Qobuz first)
      albums.sort((a, b) => b.weight - a.weight);

      this.setCache(cacheKey, albums);
      return albums;
    } catch (error) {
      console.error('MusicDataProvider: Album search failed:', error);
      return [];
    }
  }

  /**
   * Get detailed artist information
   */
  async getArtistDetails(artistId: string): Promise<UnifiedArtist | null> {
    const cacheKey = this.getCacheKey('artist_details', artistId);
    const cached = this.getFromCache<UnifiedArtist>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`/api/music/artist/${encodeURIComponent(artistId)}`);
      
      if (!response.data) return null;

      const artist: UnifiedArtist = {
        id: response.data.id || artistId,
        name: response.data.name,
        image_url: response.data.image_url,
        biography: response.data.biography,
        country: response.data.country,
        type: response.data.type,
        albums_count: response.data.albums_count,
        genres: response.data.genres,
        source: response.data.source || 'unknown',
        weight: response.data.weight || this.sourceWeights[response.data.source as keyof typeof this.sourceWeights] || 0.5,
        qobuz_id: response.data.qobuz_id,
        // Compatibility mappings
        artworkUrl: response.data.image_url,
        similarity: response.data.weight || 0.5,
        listeners: response.data.listeners,
        playcount: response.data.playcount,
        description: response.data.biography
      };

      this.setCache(cacheKey, artist);
      return artist;
    } catch (error) {
      console.error('MusicDataProvider: Artist details failed:', error);
      return null;
    }
  }

  /**
   * Get detailed album information
   */
  async getAlbumDetails(albumId: string): Promise<UnifiedAlbum | null> {
    const cacheKey = this.getCacheKey('album_details', albumId);
    const cached = this.getFromCache<UnifiedAlbum>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get(`/api/music/album/${encodeURIComponent(albumId)}`);
      
      if (!response.data) return null;

      const album: UnifiedAlbum = {
        id: response.data.id || albumId,
        title: response.data.title,
        artist_name: response.data.artist_name,
        artwork_url: response.data.artwork_url,
        release_date: response.data.release_date,
        track_count: response.data.track_count,
        label_name: response.data.label_name,
        description: response.data.description,
        source: response.data.source || 'unknown',
        weight: response.data.weight || this.sourceWeights[response.data.source as keyof typeof this.sourceWeights] || 0.5,
        qobuz_id: response.data.qobuz_id,
        // Compatibility mappings
        artworkUrl: response.data.artwork_url,
        type: response.data.type || 'album',
        year: response.data.release_date ? new Date(response.data.release_date).getFullYear().toString() : undefined,
        trackCount: response.data.track_count,
        label: response.data.label_name || response.data.label
      };

      this.setCache(cacheKey, album);
      return album;
    } catch (error) {
      console.error('MusicDataProvider: Album details failed:', error);
      return null;
    }
  }

  /**
   * Get lyrics with Qobuz priority
   */
  async getLyrics(track: string, artist: string, album?: string): Promise<LyricsResult> {
    const cacheKey = this.getCacheKey('lyrics', `${track}-${artist}`, { album });
    const cached = this.getFromCache<LyricsResult>(cacheKey);
    if (cached) return cached;

    try {
      const response = await axios.get('/api/media/lyrics', {
        params: { track, artist, album }
      });

      const result: LyricsResult = {
        lyrics: response.data.plain || response.data.synced || null,
        source: response.data.source || 'lrclib',
        synchronized: !!response.data.synced,
        weight: response.data.weight || this.sourceWeights[response.data.source as keyof typeof this.sourceWeights] || 0.4
      };

      this.setCache(cacheKey, result, 24 * 60 * 60 * 1000); // 24 hours for lyrics
      return result;
    } catch (error) {
      console.error('MusicDataProvider: Lyrics failed:', error);
      return {
        lyrics: null,
        source: 'error',
        weight: 0
      };
    }
  }

  /**
   * Universal search (artists + albums)
   */
  async search(query: string, limit: number = 8): Promise<SearchResults> {
    const cacheKey = this.getCacheKey('universal_search', query, { limit });
    const cached = this.getFromCache<SearchResults>(cacheKey);
    if (cached) return cached;

    try {
      const [artists, albums] = await Promise.all([
        this.searchArtists(query, Math.ceil(limit / 2)),
        this.searchAlbums(query, undefined, Math.ceil(limit / 2))
      ]);

      const results: SearchResults = { artists, albums };
      this.setCache(cacheKey, results);
      return results;
    } catch (error) {
      console.error('MusicDataProvider: Universal search failed:', error);
      return { artists: [], albums: [] };
    }
  }

  /**
   * Get the best source badge for display
   */
  getSourceBadge(source: string, weight: number): { label: string; color: string; priority: 'high' | 'medium' | 'low' } {
    if (source === 'qobuz') {
      return { label: 'Qobuz Premium', color: 'blue', priority: 'high' };
    } else if (weight >= 0.7) {
      return { label: source.charAt(0).toUpperCase() + source.slice(1), color: 'green', priority: 'medium' };
    } else {
      return { label: source.charAt(0).toUpperCase() + source.slice(1), color: 'gray', priority: 'low' };
    }
  }

  /**
   * Clear cache (useful for development/testing)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

// Export singleton instance
export const musicDataProvider = new MusicDataProvider();
export default musicDataProvider;