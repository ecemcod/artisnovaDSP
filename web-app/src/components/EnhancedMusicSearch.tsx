import React, { useState, useEffect, useRef } from 'react';
import { Search, X, User, Disc, Clock, Loader } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';
import { musicDataProvider, type UnifiedArtist, type UnifiedAlbum } from '../utils/MusicDataProvider';

interface SearchResult {
  artists: UnifiedArtist[];
  albums: UnifiedAlbum[];
}

interface EnhancedMusicSearchProps {
  onArtistSelect?: (artistId: string, artistData: UnifiedArtist) => void;
  onAlbumSelect?: (albumId: string, albumData: UnifiedAlbum) => void;
  placeholder?: string;
  className?: string;
}

export const EnhancedMusicSearch: React.FC<EnhancedMusicSearchProps> = ({
  onArtistSelect,
  onAlbumSelect,
  placeholder = "Search artists, albums...",
  className = ""
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult>({ artists: [], albums: [] });
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  
  const searchRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    // Load recent searches from localStorage
    const saved = localStorage.getItem('artisNova_recentSearches');
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved));
      } catch (error) {
        console.error('Error loading recent searches:', error);
      }
    }
  }, []);

  useEffect(() => {
    // Save recent searches to localStorage
    localStorage.setItem('artisNova_recentSearches', JSON.stringify(recentSearches));
  }, [recentSearches]);

  useEffect(() => {
    // Click outside to close
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ artists: [], albums: [] });
      return;
    }

    setLoading(true);
    try {
      const data = await musicDataProvider.search(searchQuery, 8);
      setResults(data);
    } catch (error) {
      console.error('Search error:', error);
      setResults({ artists: [], albums: [] });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (value: string) => {
    setQuery(value);
    setShowResults(true);

    // Debounce search
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      performSearch(value);
    }, 200); // Reduced from 300ms to 200ms for faster search response
  };

  const handleSearch = (searchQuery: string) => {
    if (!searchQuery.trim()) return;

    // Add to recent searches
    const newRecent = [searchQuery, ...recentSearches.filter(s => s !== searchQuery)].slice(0, 5);
    setRecentSearches(newRecent);

    performSearch(searchQuery);
  };

  const handleArtistClick = (artist: UnifiedArtist) => {
    setQuery('');
    setShowResults(false);
    handleSearch(artist.name);
    onArtistSelect?.(artist.name, artist);
  };

  const handleAlbumClick = (album: UnifiedAlbum) => {
    setQuery('');
    setShowResults(false);
    handleSearch(album.title);
    onAlbumSelect?.(album.id, album);
  };

  const handleRecentSearchClick = (search: string) => {
    setQuery(search);
    handleSearch(search);
  };

  const clearSearch = () => {
    setQuery('');
    setResults({ artists: [], albums: [] });
    setShowResults(false);
    inputRef.current?.focus();
  };

  const hasResults = results.artists.length > 0 || results.albums.length > 0;
  const showRecentSearches = showResults && !query.trim() && recentSearches.length > 0;

  return (
    <div ref={searchRef} className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowResults(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleSearch(query);
            } else if (e.key === 'Escape') {
              setShowResults(false);
            }
          }}
          className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder={placeholder}
        />
        {query && (
          <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
            <button
              onClick={clearSearch}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-96 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-8">
              <Loader className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-gray-600">Searching...</span>
            </div>
          )}

          {/* Recent Searches */}
          {showRecentSearches && (
            <div className="p-4 border-b border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                <Clock className="w-4 h-4 mr-1" />
                Recent Searches
              </h3>
              <div className="space-y-1">
                {recentSearches.map((search, index) => (
                  <button
                    key={index}
                    onClick={() => handleRecentSearchClick(search)}
                    className="block w-full text-left px-2 py-1 text-sm text-gray-600 hover:bg-gray-50 rounded"
                  >
                    {search}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Artists Results */}
          {results.artists.length > 0 && (
            <div className="p-4">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <User className="w-4 h-4 mr-1" />
                Artists
              </h3>
              <div className="space-y-2">
                {results.artists.map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => handleArtistClick(artist)}
                    className="w-full flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                  >
                    <ProgressiveImage
                      src={artist.image_url}
                      alt={artist.name}
                      className="w-10 h-10 rounded-full"
                      fallbackType="artist"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {artist.name}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        {artist.source === 'qobuz' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Qobuz
                          </span>
                        )}
                        {artist.type && <span>{artist.type}</span>}
                        {artist.country && (
                          <>
                            {artist.type && <span>•</span>}
                            <span>{artist.country}</span>
                          </>
                        )}
                        {artist.albums_count && (
                          <>
                            <span>•</span>
                            <span>{artist.albums_count} albums</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Albums Results */}
          {results.albums.length > 0 && (
            <div className="p-4 border-t border-gray-100">
              <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                <Disc className="w-4 h-4 mr-1" />
                Albums
              </h3>
              <div className="space-y-2">
                {results.albums.map((album) => (
                  <button
                    key={album.id}
                    onClick={() => handleAlbumClick(album)}
                    className="w-full flex items-center space-x-3 p-2 hover:bg-gray-50 rounded-lg transition-colors text-left"
                  >
                    <ProgressiveImage
                      src={album.artwork_url}
                      alt={album.title}
                      className="w-10 h-10 rounded"
                      fallbackType="album"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {album.title}
                      </p>
                      <div className="flex items-center space-x-2 text-xs text-gray-500">
                        {album.source === 'qobuz' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            Qobuz
                          </span>
                        )}
                        {album.artist_name && <span>by {album.artist_name}</span>}
                        {album.release_date && (
                          <>
                            {album.artist_name && <span>•</span>}
                            <span>{album.release_date}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* No Results */}
          {!loading && query.trim() && !hasResults && (
            <div className="p-8 text-center">
              <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500">No results found for "{query}"</p>
              <p className="text-sm text-gray-400 mt-1">Try a different search term</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnhancedMusicSearch;