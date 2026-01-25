import React, { useEffect, useState } from 'react';
import { useSimpleNavigation } from './SimpleNavigationProvider';
import { Home, Music, User, ArrowLeft, Star, Calendar, MapPin, Disc, Tag, ExternalLink } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';
import { EnhancedMusicSearch } from './EnhancedMusicSearch';

interface NowPlayingInfo {
  track?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state?: string;
  position?: number;
  duration?: number;
}

interface SimpleMusicNavigationViewProps {
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const SimpleMusicNavigationView: React.FC<SimpleMusicNavigationViewProps> = ({ className = '', nowPlaying }) => {
  const { state, navigate, goHome } = useSimpleNavigation();
  const [artistData, setArtistData] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  console.log('SimpleMusicNavigationView: Rendering', { 
    currentView: state.currentView, 
    currentId: state.currentId,
    nowPlaying: !!nowPlaying 
  });

  // Load artist data when viewing an artist
  useEffect(() => {
    if (state.currentView === 'artist' && state.currentId) {
      loadArtistData(state.currentId);
    }
  }, [state.currentView, state.currentId]);

  const loadArtistData = async (artistId: string) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/music/artist/${encodeURIComponent(artistId)}?includeAlbums=true&includeSimilar=true`);
      if (response.ok) {
        const data = await response.json();
        setArtistData(data);
      }
    } catch (error) {
      console.error('Error loading artist data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-navigate to current artist when component mounts
  useEffect(() => {
    if (nowPlaying?.artist && state.currentView === 'home' && !state.currentId) {
      console.log('SimpleMusicNavigationView: Auto-navigating to artist:', nowPlaying.artist);
      navigate('artist', nowPlaying.artist, { 
        name: nowPlaying.artist,
        currentTrack: nowPlaying.track,
        currentAlbum: nowPlaying.album,
        artworkUrl: nowPlaying.artworkUrl
      }, `${nowPlaying.artist} (Now Playing)`);
    }
  }, [nowPlaying?.artist, state.currentView, navigate]);

  const renderCurrentView = () => {
    console.log('SimpleMusicNavigationView: Rendering view:', state.currentView);

    switch (state.currentView) {
      case 'artist':
        if (loading) {
          return (
            <div className="space-y-6 animate-pulse">
              <div className="flex items-center space-x-4 mb-6">
                <button
                  onClick={goHome}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div className="h-8 bg-gray-200 rounded w-48"></div>
              </div>
              <div className="bg-white rounded-lg p-8 shadow-sm">
                <div className="flex items-center gap-6">
                  <div className="w-32 h-32 bg-gray-200 rounded-lg"></div>
                  <div className="flex-1 space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-64"></div>
                    <div className="h-4 bg-gray-200 rounded w-32"></div>
                    <div className="h-4 bg-gray-200 rounded w-48"></div>
                  </div>
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-6">
            {/* Artist Header */}
            <div className="flex items-center space-x-4 mb-6">
              <button
                onClick={goHome}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h1 className="text-2xl font-bold text-gray-900">
                {state.currentTitle || state.currentId || 'Artist'}
              </h1>
            </div>

            {/* Enhanced Artist Content - Compact Design */}
            <div className="flex items-start gap-6 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              {/* Artist Image - Compact */}
              <div className="w-32 h-32 flex-shrink-0">
                <ProgressiveImage
                  src={artistData?.image_url || state.currentData?.artworkUrl}
                  alt={artistData?.name || state.currentData?.name || 'Artist'}
                  className="w-full h-full rounded-lg shadow-md object-cover"
                  fallbackType="artist"
                />
              </div>

              {/* Artist Details - Compact Layout */}
              <div className="flex-1 min-w-0 space-y-4">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold text-gray-900 truncate">
                    {artistData?.name || state.currentData?.name || state.currentId}
                  </h2>
                  <div className="flex items-center gap-3">
                    {artistData?.type && (
                      <span className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full">
                        {artistData.type}
                      </span>
                    )}
                    {artistData?.quality_score && (
                      <div className="flex items-center space-x-1 text-sm text-gray-600">
                        <Star className="w-4 h-4" />
                        <span>{(artistData.quality_score * 100).toFixed(0)}% quality</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Artist Metadata - Compact Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    {artistData?.country && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <MapPin className="w-4 h-4" />
                        <span>{artistData.country}</span>
                      </div>
                    )}
                    {artistData?.begin_date && (
                      <div className="flex items-center space-x-2 text-sm text-gray-600">
                        <Calendar className="w-4 h-4" />
                        <span>
                          {artistData.begin_date}
                          {artistData.end_date && ` - ${artistData.end_date}`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Genres - Compact */}
                  {artistData?.genres && artistData.genres.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-900 mb-2">Genres:</div>
                      <div className="flex flex-wrap gap-1">
                        {artistData.genres.slice(0, 4).map((genre: any) => (
                          <span
                            key={genre.name || genre}
                            className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                          >
                            {genre.name || genre}
                          </span>
                        ))}
                        {artistData.genres.length > 4 && (
                          <span className="px-2 py-1 text-xs text-gray-500">
                            +{artistData.genres.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Currently Playing Indicator - Compact */}
                {state.currentData?.currentTrack && (
                  <div className="p-3 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border border-green-200">
                    <div className="flex items-center space-x-2 mb-1">
                      <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                      <span className="text-sm font-medium text-green-800">Currently Playing</span>
                    </div>
                    <p className="text-lg font-semibold text-green-700">
                      {state.currentData.currentTrack}
                    </p>
                    {state.currentData.currentAlbum && (
                      <p className="text-gray-600">from {state.currentData.currentAlbum}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Additional Content in Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column - Biography and Albums */}
              <div className="lg:col-span-2 space-y-6">
                {/* Biography */}
                {artistData?.biography && (
                  <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">Biography</h3>
                    <div className="text-gray-700 leading-relaxed">
                      {artistData.biography.length > 500 ? (
                        <>
                          {artistData.biography.substring(0, 500)}...
                          <button className="text-blue-600 hover:underline ml-2 font-medium">
                            Read more
                          </button>
                        </>
                      ) : (
                        artistData.biography
                      )}
                    </div>
                  </div>
                )}

                {/* Albums Preview */}
                {artistData?.albums && artistData.albums.length > 0 && (
                  <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">Recent Albums</h3>
                    <div className="space-y-4">
                      {artistData.albums.slice(0, 6).map((album: any) => (
                        <div key={album.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                          <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                            <ProgressiveImage
                              src={album.artwork_url}
                              alt={album.title}
                              className="w-full h-full object-cover"
                              fallbackType="album"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-gray-900 truncate">{album.title}</h4>
                            <div className="flex items-center gap-2 text-sm text-gray-500">
                              {album.release_date && (
                                <span>{new Date(album.release_date).getFullYear()}</span>
                              )}
                              {album.track_count && (
                                <>
                                  <span>•</span>
                                  <span>{album.track_count} tracks</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column - Quick Stats and Info */}
              <div className="space-y-6">
                {/* Quick Stats */}
                <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
                  <div className="space-y-3">
                    {artistData?.albums && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-600">Albums</span>
                        <span className="font-semibold text-gray-900">{artistData.albums.length}</span>
                      </div>
                    )}
                    {artistData?.genres && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-600">Genres</span>
                        <span className="font-semibold text-gray-900">{artistData.genres.length}</span>
                      </div>
                    )}
                    {artistData?.quality_score && (
                      <div className="flex justify-between items-center py-2">
                        <span className="text-gray-600">Data Quality</span>
                        <div className="flex items-center gap-2">
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full" 
                              style={{ width: `${artistData.quality_score * 100}%` }}
                            ></div>
                          </div>
                          <span className="text-sm font-medium text-gray-900">
                            {(artistData.quality_score * 100).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* All Genres */}
                {artistData?.genres && artistData.genres.length > 4 && (
                  <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">All Genres</h3>
                    <div className="flex flex-wrap gap-2">
                      {artistData.genres.map((genre: any) => (
                        <span
                          key={genre.name || genre}
                          className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                        >
                          {genre.name || genre}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Data Sources */}
                {artistData?.sources && artistData.sources.length > 0 && (
                  <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Data Sources</h3>
                    <div className="space-y-2">
                      {artistData.sources.map((source: any, index: number) => (
                        <div key={index} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600">{source.source_name}</span>
                          <div className="w-16 bg-gray-200 rounded-full h-2">
                            <div 
                              className="bg-blue-600 h-2 rounded-full" 
                              style={{ width: `${(source.weight || 0.5) * 100}%` }}
                            ></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Fallback message if no data */}
                {!artistData && (
                  <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-xl">
                    <p className="text-sm text-yellow-800">
                      <strong>Loading artist information...</strong> This may take a moment as we gather 
                      data from multiple music databases.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        );

      case 'home':
      default:
        return (
          <div className="space-y-8">
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
                  <ProgressiveImage
                    src={nowPlaying.artworkUrl}
                    alt={nowPlaying.album || 'Album artwork'}
                    className="w-16 h-16 rounded-lg shadow-md flex-shrink-0"
                    fallbackType="album"
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

            {/* Quick Actions - Compact */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-blue-200 transition-colors">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Popular Artists</h3>
                <p className="text-sm text-gray-600">Trending artists</p>
              </div>

              <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-green-200 transition-colors">
                  <Disc className="w-5 h-5 text-green-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">New Releases</h3>
                <p className="text-sm text-gray-600">Latest albums</p>
              </div>

              <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-purple-200 transition-colors">
                  <Tag className="w-5 h-5 text-purple-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Browse Genres</h3>
                <p className="text-sm text-gray-600">By genre</p>
              </div>

              <div className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center mb-3 group-hover:bg-orange-200 transition-colors">
                  <ExternalLink className="w-5 h-5 text-orange-600" />
                </div>
                <h3 className="font-semibold text-gray-900 mb-1">Record Labels</h3>
                <p className="text-sm text-gray-600">By label</p>
              </div>
            </div>

          </div>
        );
    }
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Compact Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Music className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900">Music Explorer</h1>
          </div>
          <div className="flex items-center space-x-4">
            <div className="text-sm text-gray-600 bg-gray-100 px-3 py-1 rounded-full">
              {state.currentView === 'home' ? 'Home' : `${state.currentView}: ${state.currentId || 'Loading...'}`}
            </div>
            {state.currentView !== 'home' && (
              <button
                onClick={goHome}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                title="Go Home"
              >
                <Home className="w-5 h-5 text-gray-600" />
              </button>
            )}
          </div>
        </div>
        
        {/* Compact Search Bar */}
        <div className="max-w-2xl mx-auto">
          <EnhancedMusicSearch
            onArtistSelect={(artistId, artistData) => {
              navigate('artist', artistId, artistData, artistData.name);
            }}
            onAlbumSelect={(_albumId, albumData) => {
              // For now, navigate to artist of the album
              if (albumData.artist_name) {
                navigate('artist', albumData.artist_name, { name: albumData.artist_name }, albumData.artist_name);
              }
            }}
            placeholder="Search artists, albums, labels..."
            className="w-full"
          />
        </div>
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