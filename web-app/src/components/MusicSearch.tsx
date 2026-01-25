import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X, Clock, Loader2, Music, User, Disc, Tag } from 'lucide-react';
import { useNavigation } from './NavigationProvider';
import { debounce } from 'lodash';

interface SearchResult {
  type: 'artist' | 'album' | 'label' | 'genre';
  id: string;
  name: string;
  subtitle?: string;
  image?: string;
  source: string;
  confidence: number;
}

interface SearchHistory {
  query: string;
  timestamp: number;
  results: number;
}

interface MusicSearchProps {
  className?: string;
  placeholder?: string;
  autoFocus?: boolean;
  showFilters?: boolean;
  maxResults?: number;
}

export const MusicSearch: React.FC<MusicSearchProps> = ({
  className = '',
  placeholder = 'Search artists, albums, labels...',
  autoFocus = false,
  showFilters = true,
  maxResults = 20
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState<SearchHistory[]>([]);
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set(['artist', 'album']));
  
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const { navigate } = useNavigation();

  // Load search history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem('musicSearchHistory');
    if (saved) {
      try {
        setSearchHistory(JSON.parse(saved));
      } catch (error) {
        console.error('Failed to load search history:', error);
      }
    }
  }, []);

  // Save search history to localStorage
  const saveSearchHistory = useCallback((newHistory: SearchHistory[]) => {
    try {
      localStorage.setItem('musicSearchHistory', JSON.stringify(newHistory.slice(0, 10)));
    } catch (error) {
      console.error('Failed to save search history:', error);
    }
  }, []);

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce(async (searchQuery: string) => {
      if (!searchQuery.trim()) {
        setResults([]);
        setShowResults(false);
        return;
      }

      setIsLoading(true);
      try {
        const filterTypes = Array.from(activeFilters);
        const searchPromises = filterTypes.map(async (type) => {
          const response = await fetch(
            `/api/music/search?q=${encodeURIComponent(searchQuery)}&type=${type}&limit=${Math.ceil(maxResults / filterTypes.length)}`
          );
          const data = await response.json();
          return data[type + 's'] || [];
        });

        const allResults = await Promise.all(searchPromises);
        const combinedResults: SearchResult[] = [];

        allResults.forEach((typeResults, index) => {
          const type = filterTypes[index];
          typeResults.forEach((item: any) => {
            combinedResults.push({
              type: type as any,
              id: item.id || item.mbid || item.name,
              name: item.name || item.title,
              subtitle: type === 'album' ? item.artist : item.country || item.origin,
              image: item.image_url || item.artworkUrl || item.imageUrl,
              source: item.source,
              confidence: item.confidence || 0.5
            });
          });
        });

        // Sort by confidence and relevance
        combinedResults.sort((a, b) => {
          const aScore = a.confidence * (a.name.toLowerCase().includes(searchQuery.toLowerCase()) ? 1.2 : 1);
          const bScore = b.confidence * (b.name.toLowerCase().includes(searchQuery.toLowerCase()) ? 1.2 : 1);
          return bScore - aScore;
        });

        setResults(combinedResults.slice(0, maxResults));
        setShowResults(true);
        setSelectedIndex(-1);
      } catch (error) {
        console.error('Search failed:', error);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300),
    [activeFilters, maxResults]
  );

  // Handle input change
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);
    debouncedSearch(value);
  };

  // Handle result selection
  const handleResultSelect = (result: SearchResult) => {
    // Add to search history
    const historyEntry: SearchHistory = {
      query,
      timestamp: Date.now(),
      results: results.length
    };
    const newHistory = [historyEntry, ...searchHistory.filter(h => h.query !== query)];
    setSearchHistory(newHistory);
    saveSearchHistory(newHistory);

    // Navigate to result
    navigate(result.type, result.id, result, result.name);
    
    // Clear search
    setQuery('');
    setResults([]);
    setShowResults(false);
    inputRef.current?.blur();
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showResults) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, -1));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && results[selectedIndex]) {
          handleResultSelect(results[selectedIndex]);
        }
        break;
      case 'Escape':
        setShowResults(false);
        setSelectedIndex(-1);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle filter toggle
  const toggleFilter = (filter: string) => {
    const newFilters = new Set(activeFilters);
    if (newFilters.has(filter)) {
      newFilters.delete(filter);
    } else {
      newFilters.add(filter);
    }
    setActiveFilters(newFilters);
    
    // Re-search with new filters
    if (query.trim()) {
      debouncedSearch(query);
    }
  };

  // Clear search
  const clearSearch = () => {
    setQuery('');
    setResults([]);
    setShowResults(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // Get icon for result type
  const getResultIcon = (type: string) => {
    switch (type) {
      case 'artist': return <User className="w-4 h-4" />;
      case 'album': return <Disc className="w-4 h-4" />;
      case 'label': return <Music className="w-4 h-4" />;
      case 'genre': return <Tag className="w-4 h-4" />;
      default: return <Search className="w-4 h-4" />;
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => query && setShowResults(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          className="w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-4 h-4 text-gray-400" />
          </button>
        )}
        {isLoading && (
          <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-500 animate-spin" />
        )}
      </div>

      {/* Search Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mt-2">
          {['artist', 'album', 'label', 'genre'].map(filter => (
            <button
              key={filter}
              onClick={() => toggleFilter(filter)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                activeFilters.has(filter)
                  ? 'bg-blue-500 text-white border-blue-500'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}s
            </button>
          ))}
        </div>
      )}

      {/* Search Results */}
      {showResults && (
        <div
          ref={resultsRef}
          className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto z-50"
        >
          {results.length > 0 ? (
            <div className="py-2">
              {results.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleResultSelect(result)}
                  className={`w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center space-x-3 ${
                    index === selectedIndex ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex-shrink-0 text-gray-400">
                    {getResultIcon(result.type)}
                  </div>
                  {result.image && (
                    <img
                      src={result.image}
                      alt=""
                      className="w-10 h-10 rounded object-cover flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 truncate">{result.name}</div>
                    {result.subtitle && (
                      <div className="text-sm text-gray-500 truncate">{result.subtitle}</div>
                    )}
                    <div className="text-xs text-gray-400 capitalize">
                      {result.type} • {result.source}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : query && !isLoading ? (
            <div className="px-4 py-8 text-center text-gray-500">
              <Search className="w-8 h-8 mx-auto mb-2 text-gray-300" />
              <p>No results found for "{query}"</p>
            </div>
          ) : null}

          {/* Search History */}
          {!query && searchHistory.length > 0 && (
            <div className="border-t border-gray-100">
              <div className="px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wide">
                Recent Searches
              </div>
              {searchHistory.slice(0, 5).map((item, index) => (
                <button
                  key={index}
                  onClick={() => {
                    setQuery(item.query);
                    debouncedSearch(item.query);
                  }}
                  className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center space-x-3"
                >
                  <Clock className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-700">{item.query}</span>
                  <span className="text-xs text-gray-400 ml-auto">
                    {item.results} results
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};