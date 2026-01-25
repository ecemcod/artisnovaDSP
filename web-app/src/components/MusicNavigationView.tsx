import React, { useEffect, useState } from 'react';
import { useNavigation } from './NavigationProvider';
import { Breadcrumb } from './Breadcrumb';
import { NavigationControls } from './NavigationControls';
import { MusicSearch } from './MusicSearch';
import { EnhancedArtistView } from './EnhancedArtistView';
import { EnhancedAlbumView } from './EnhancedAlbumView';
import { LabelView } from './LabelView';
import { GenreView } from './GenreView';
import { Home, Music, User } from 'lucide-react';

interface NowPlayingInfo {
  track?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state?: string;
  position?: number;
  duration?: number;
}

interface MusicNavigationViewProps {
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const MusicNavigationView: React.FC<MusicNavigationViewProps> = ({ className = '', nowPlaying }) => {
  console.log('MusicNavigationView: Component rendering', { nowPlaying: !!nowPlaying });

  // Error boundary state
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');

  // Simple fallback if navigation system fails
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      console.log('MusicNavigationView: Fallback timer triggered');
      setShowFallback(true);
    }, 3000); // Show fallback after 3 seconds if nothing renders

    return () => clearTimeout(timer);
  }, []);

  // Safe navigation context access
  let navigationContext: any = null;
  let state: any = null;
  let navigate: any = null;

  try {
    navigationContext = useNavigation();
    if (navigationContext) {
      state = navigationContext.state;
      navigate = navigationContext.navigate;
    }
  } catch (err) {
    console.error('MusicNavigationView: Navigation context error:', err);
    setHasError(true);
    setErrorMessage('Navigation system initialization failed');
  }
  
  // Error boundary or missing context
  if (hasError || !navigationContext || !state || !navigate) {
    console.error('MusicNavigationView: Navigation context not available or error occurred');
    return (
      <div className={`h-full flex items-center justify-center ${className}`}>
        <div className="text-center">
          <Home className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Navigation System Error</h3>
          <p className="text-gray-500 mb-4">{errorMessage || 'Navigation context not available'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
      </div>
    );
  }

  // Emergency fallback UI
  if (showFallback && (!state || state.currentView === 'home')) {
    console.log('MusicNavigationView: Showing emergency fallback UI');
    return (
      <div className={`h-full flex flex-col ${className}`}>
        {/* Simple Header */}
        <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-900">Music Explorer</h1>
          <p className="text-gray-600">Simplified view - navigation system loading...</p>
        </div>

        {/* Simple Content */}
        <div className="flex-1 overflow-auto bg-gray-50">
          <div className="max-w-7xl mx-auto px-6 py-8">
            {nowPlaying?.artist && (
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="flex items-center gap-4">
                  {nowPlaying.artworkUrl && (
                    <img 
                      src={nowPlaying.artworkUrl} 
                      alt={nowPlaying.album}
                      className="w-16 h-16 rounded-lg object-cover"
                    />
                  )}
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Now Playing</h2>
                    <p className="text-lg text-blue-700">{nowPlaying.track}</p>
                    <p className="text-gray-600">by {nowPlaying.artist}</p>
                    {nowPlaying.album && (
                      <p className="text-sm text-gray-500">from {nowPlaying.album}</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            <div className="mt-8 text-center">
              <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Music Explorer</h3>
              <p className="text-gray-500">Navigation system is loading. Please wait or refresh the page.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Auto-navigate to current artist when component mounts
  useEffect(() => {
    const autoNavigateToArtist = async () => {
      try {
        console.log('MusicNavigationView: Auto-navigation effect triggered', {
          hasNowPlaying: !!nowPlaying,
          artist: nowPlaying?.artist,
          currentView: state.currentView,
          currentId: state.currentId
        });

        // Only auto-navigate if we're on home view and have a playing artist
        if (nowPlaying?.artist && state.currentView === 'home' && !state.currentId) {
          console.log('MusicNavigationView: Starting auto-navigation to artist:', nowPlaying.artist);
          
          // Use the artist name directly as ID for now (simplified approach)
          navigate('artist', nowPlaying.artist, { 
            name: nowPlaying.artist,
            currentTrack: nowPlaying.track,
            currentAlbum: nowPlaying.album,
            artworkUrl: nowPlaying.artworkUrl
          }, `${nowPlaying.artist} (Now Playing)`);
          
          console.log('MusicNavigationView: Auto-navigation completed');
        }
      } catch (error) {
        console.error('MusicNavigationView: Error in auto-navigation:', error);
      }
    };

    // Add a small delay to ensure the component is fully mounted
    const timeoutId = setTimeout(autoNavigateToArtist, 100);
    return () => clearTimeout(timeoutId);
  }, [nowPlaying?.artist, state.currentView, navigate]);

  const renderCurrentView = () => {
    console.log('MusicNavigationView: renderCurrentView called', {
      currentView: state.currentView,
      currentId: state.currentId,
      nowPlaying: nowPlaying ? {
        artist: nowPlaying.artist,
        track: nowPlaying.track,
        album: nowPlaying.album
      } : null
    });

    try {
      switch (state.currentView) {
        case 'artist':
          if (!state.currentId) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-500">No artist selected</p>
              </div>
            );
          }
          
          try {
            return (
              <EnhancedArtistView 
                artistId={state.currentId} 
                nowPlaying={nowPlaying?.artist === state.currentId ? nowPlaying : undefined}
              />
            );
          } catch (artistError) {
            console.error('MusicNavigationView: Error in EnhancedArtistView:', artistError);
            return (
              <div className="text-center py-12">
                <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Artist View Error</h3>
                <p className="text-gray-500 mb-4">Unable to load artist information</p>
                <button
                  onClick={() => navigate('home')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            );
          }

        case 'album':
          if (!state.currentId) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-500">No album selected</p>
              </div>
            );
          }
          
          try {
            return <EnhancedAlbumView albumId={state.currentId} />;
          } catch (albumError) {
            console.error('MusicNavigationView: Error in EnhancedAlbumView:', albumError);
            return (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Album View Error</h3>
                <p className="text-gray-500 mb-4">Unable to load album information</p>
                <button
                  onClick={() => navigate('home')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            );
          }

        case 'label':
          if (!state.currentId) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-500">No label selected</p>
              </div>
            );
          }
          
          try {
            return <LabelView labelId={state.currentId} />;
          } catch (labelError) {
            console.error('MusicNavigationView: Error in LabelView:', labelError);
            return (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Label View Error</h3>
                <p className="text-gray-500 mb-4">Unable to load label information</p>
                <button
                  onClick={() => navigate('home')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            );
          }

        case 'genre':
          if (!state.currentId) {
            return (
              <div className="text-center py-12">
                <p className="text-gray-500">No genre selected</p>
              </div>
            );
          }
          
          try {
            return <GenreView genreId={state.currentId} />;
          } catch (genreError) {
            console.error('MusicNavigationView: Error in GenreView:', genreError);
            return (
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Genre View Error</h3>
                <p className="text-gray-500 mb-4">Unable to load genre information</p>
                <button
                  onClick={() => navigate('home')}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Go Home
                </button>
              </div>
            );
          }

        case 'search':
          return (
            <div className="space-y-6">
              <div className="text-center">
                <h1 className="text-2xl font-bold text-gray-900 mb-4">Search Results</h1>
                {state.currentId && (
                  <p className="text-gray-600">Results for "{state.currentId}"</p>
                )}
              </div>
              {/* Search results would be displayed here */}
              <div className="text-center py-12">
                <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">Search functionality integrated with main search</p>
              </div>
            </div>
          );

        case 'home':
        default:
          return (
            <div className="space-y-6">
              {/* Now Playing Section - Compact */}
              {nowPlaying?.artist && (
                <div className="flex items-center gap-4 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-green-200">
                  <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-green-800 mb-1">Now Playing</h2>
                    <p className="text-xl font-bold text-gray-900 truncate">{nowPlaying.track}</p>
                    <p className="text-gray-600">by {nowPlaying.artist}</p>
                    {nowPlaying.album && (
                      <p className="text-sm text-gray-500">from {nowPlaying.album}</p>
                    )}
                  </div>
                  {nowPlaying.artworkUrl && (
                    <img
                      src={nowPlaying.artworkUrl}
                      alt={nowPlaying.album || ''}
                      className="w-16 h-16 rounded-lg object-cover flex-shrink-0 shadow-md"
                    />
                  )}
                  <button
                    onClick={() => navigate('artist', nowPlaying.artist, { 
                      name: nowPlaying.artist,
                      currentTrack: nowPlaying.track,
                      currentAlbum: nowPlaying.album,
                      artworkUrl: nowPlaying.artworkUrl
                    }, `${nowPlaying.artist} (Now Playing)`)}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium flex-shrink-0"
                  >
                    Explore
                  </button>
                </div>
              )}

              {/* Welcome Section - Compact */}
              <div className="text-center py-6">
                <Home className="w-12 h-12 text-blue-600 mx-auto mb-3" />
                <h1 className="text-2xl font-bold text-gray-900 mb-3">Music Explorer</h1>
                <p className="text-gray-600 max-w-2xl mx-auto">
                  {nowPlaying?.artist 
                    ? `Currently exploring ${nowPlaying.artist}. Use the search above to discover more artists, albums, labels, and genres.`
                    : 'Explore detailed information about artists, albums, labels, and genres. Use the search above to discover new music.'
                  }
                </p>
              </div>

              {/* Quick Actions - Improved Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                  onClick={() => navigate('search', 'popular artists', null, 'Popular Artists')}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow text-left group"
                >
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                    <Music className="w-5 h-5 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Popular Artists</h3>
                  <p className="text-sm text-gray-600">Trending artists</p>
                </button>

                <button
                  onClick={() => navigate('search', 'new releases', null, 'New Releases')}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow text-left group"
                >
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                    <Music className="w-5 h-5 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">New Releases</h3>
                  <p className="text-sm text-gray-600">Latest albums</p>
                </button>

                <button
                  onClick={() => navigate('genre', 'rock', { name: 'Rock' }, 'Rock')}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow text-left group"
                >
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                    <Music className="w-5 h-5 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Browse Genres</h3>
                  <p className="text-sm text-gray-600">By genre</p>
                </button>

                <button
                  onClick={() => navigate('search', 'record labels', null, 'Record Labels')}
                  className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow text-left group"
                >
                  <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-200 transition-colors">
                    <Music className="w-5 h-5 text-orange-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">Record Labels</h3>
                  <p className="text-sm text-gray-600">By label</p>
                </button>
              </div>

              {/* Recent Activity - Compact */}
              {state.history && state.history.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                  <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Activity</h2>
                  <div className="space-y-2">
                    {state.history.slice(-5).reverse().map((entry: any) => (
                      <button
                        key={`${entry.view}-${entry.id}-${entry.timestamp}`}
                        onClick={() => navigate(entry.view, entry.id)}
                        className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left"
                      >
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <Music className="w-4 h-4 text-gray-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 truncate">{entry.title}</h3>
                          <p className="text-sm text-gray-500 capitalize">{entry.view}</p>
                        </div>
                        <div className="text-xs text-gray-400 flex-shrink-0">
                          {new Date(entry.timestamp).toLocaleDateString()}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
      }
    } catch (error) {
      console.error('MusicNavigationView: Error rendering view:', error);
      return (
        <div className="text-center py-12">
          <Home className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">Something went wrong</h3>
          <p className="text-gray-500 mb-4">Error: {error instanceof Error ? error.message : 'Unknown error'}</p>
          <button
            onClick={() => navigate('home')}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      );
    }
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Navigation Header - Compact */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center justify-between mb-3">
          <NavigationControls />
          <div className="flex-1 max-w-2xl mx-8">
            <MusicSearch placeholder="Search artists, albums, labels..." />
          </div>
        </div>
        <Breadcrumb className="text-sm" />
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          {renderCurrentView()}
        </div>
      </div>
    </div>
  );
};