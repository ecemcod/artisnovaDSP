import React, { useState, useEffect } from 'react';
import { User, Music } from 'lucide-react';
import { useNavigation } from './NavigationProvider';
import { ArtistImage } from './ProgressiveImage';
import ArtistDiscography from './ArtistDiscography';
import SimilarArtists from './SimilarArtists';
import { musicDataProvider, type UnifiedArtist } from '../utils/MusicDataProvider';

interface Album {
  id: string;
  title: string;
  release_date?: string;
  artwork_url?: string;
  track_count?: number;
  artist?: string;
  year?: number;
}

interface NowPlayingInfo {
  track?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state?: string;
  position?: number;
  duration?: number;
}

interface EnhancedArtistViewProps {
  artistId: string;
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const EnhancedArtistView: React.FC<EnhancedArtistViewProps> = ({ 
  artistId, 
  className = '',
  nowPlaying
}) => {
  const [artist, setArtist] = useState<UnifiedArtist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'discography' | 'similar'>('overview');
  
  // Safe navigation hook usage
  let navigate: any;
  try {
    const navigationContext = useNavigation();
    navigate = navigationContext?.navigate;
  } catch (err) {
    console.error('EnhancedArtistView: Navigation context error:', err);
    navigate = () => console.log('Navigation not available');
  }

  useEffect(() => {
    try {
      console.log('EnhancedArtistView: useEffect triggered for artistId:', artistId);
      if (artistId) {
        loadArtistData();
      } else {
        console.log('EnhancedArtistView: No artistId provided');
        setError('No artist ID provided');
        setLoading(false);
      }
    } catch (err) {
      console.error('EnhancedArtistView: useEffect error:', err);
      setError('Component initialization error');
      setLoading(false);
    }
  }, [artistId]);

  const loadArtistData = async () => {
    console.log('EnhancedArtistView: loadArtistData called for artistId:', artistId);
    
    try {
      setLoading(true);
      setError(null);
      
      // Use MusicDataProvider to get artist details
      console.log('EnhancedArtistView: Fetching artist data via MusicDataProvider...');
      const artistData = await musicDataProvider.getArtistDetails(artistId);
      
      if (!artistData) {
        throw new Error(`Artist "${artistId}" not found`);
      }
      
      console.log('EnhancedArtistView: Received data:', artistData);
      setArtist(artistData);
      console.log('EnhancedArtistView: Artist data set successfully');
    } catch (err) {
      console.error('EnhancedArtistView: Error loading artist data:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleAlbumClick = (album: Album) => {
    navigate('album', album.id, album, album.title);
  };

  const handleGenreClick = (genre: string) => {
    navigate('genre', genre, { name: genre }, genre);
  };

  // Loading skeleton with improved design
  if (loading) {
    return (
      <div className={`space-y-6 ${className}`}>
        <div className="animate-pulse">
          {/* Compact Hero Section Skeleton */}
          <div className="flex items-start gap-6 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="w-32 h-32 bg-gray-200 rounded-lg flex-shrink-0"></div>
            <div className="flex-1 space-y-4">
              <div className="space-y-2">
                <div className="h-8 bg-gray-200 rounded w-64"></div>
                <div className="h-5 bg-gray-200 rounded w-32"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-48"></div>
                <div className="h-4 bg-gray-200 rounded w-40"></div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="space-y-4 animate-pulse">
                <div className="h-6 bg-gray-200 rounded w-32"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                  <div className="h-4 bg-gray-200 rounded w-4/6"></div>
                </div>
              </div>
            </div>
          </div>
          <div className="space-y-6">
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <div className="space-y-4 animate-pulse">
                <div className="h-5 bg-gray-200 rounded w-24"></div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="aspect-square bg-gray-200 rounded-lg"></div>
                  <div className="aspect-square bg-gray-200 rounded-lg"></div>
                  <div className="aspect-square bg-gray-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !artist) {
    // If we have nowPlaying info, show basic artist info instead of error
    if (nowPlaying?.artist) {
      return (
        <div className={className}>
          {/* Compact Hero Section */}
          <div className="flex items-start gap-6 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="w-32 h-32 flex-shrink-0">
              {nowPlaying.artworkUrl ? (
                <img
                  src={nowPlaying.artworkUrl}
                  alt={nowPlaying.artist}
                  className="w-full h-full object-cover rounded-lg shadow-md"
                />
              ) : (
                <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
                  <User className="w-12 h-12 text-gray-400" />
                </div>
              )}
            </div>
            
            <div className="flex-1 min-w-0 space-y-4">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-gray-900 truncate">{nowPlaying.artist}</h1>
                <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium w-fit">
                  <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                  <span>Currently Playing</span>
                </div>
              </div>
              
              <div className="space-y-3">
                {nowPlaying.track && (
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-gray-500" />
                    <span className="text-gray-900 font-medium">{nowPlaying.track}</span>
                  </div>
                )}
                {nowPlaying.album && (
                  <div className="text-gray-600">
                    <span className="font-medium">Album:</span> {nowPlaying.album}
                  </div>
                )}
                <div className="text-sm text-gray-500">
                  Information not available in external databases
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 p-6 bg-gray-50 rounded-xl border border-gray-200">
            <div className="text-center py-8">
              <Music className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">Limited Information Available</h3>
              <p className="text-gray-600 max-w-md mx-auto">
                This artist may not be widely catalogued in music databases yet. 
                Information shown is based on your current playback.
              </p>
            </div>
          </div>
        </div>
      );
    }

    // Fallback to error state
    return (
      <div className={`text-center p-8 ${className}`}>
        <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Artist not found</h3>
        <p className="text-gray-600">{error || 'The requested artist could not be loaded.'}</p>
      </div>
    );
  }

  // Prepare metadata for display
  const metadataItems = [
    ...(artist.type ? [{ label: 'Type', value: artist.type }] : []),
    ...(artist.country ? [{ label: 'Origin', value: artist.country }] : []),
    ...(artist.begin_date ? [{ 
      label: 'Active', 
      value: artist.end_date ? `${artist.begin_date} - ${artist.end_date}` : `${artist.begin_date} - Present`
    }] : []),
    ...(artist.quality_score ? [{ 
      label: 'Data Quality', 
      value: `${(artist.quality_score * 100).toFixed(0)}%`
    }] : []),
  ];

  return (
    <div className={className}>
      {/* Compact Hero Section with Artist Info */}
      <div className="flex items-start gap-6 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        <ArtistImage
          src={artist.image_url}
          name={artist.name}
          size="medium"
          className="w-32 h-32 flex-shrink-0 shadow-md"
        />
        
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-2">
            <div className="flex items-center space-x-3">
              <h1 className="text-3xl font-bold text-gray-900 truncate">{artist.name}</h1>
              {artist.source === 'qobuz' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-1"></span>
                  Qobuz Premium
                </span>
              )}
            </div>
            {nowPlaying && nowPlaying.artist === artistId && (
              <div className="flex items-center space-x-2 px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium w-fit">
                <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
                <span>Currently Playing</span>
              </div>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Basic metadata in compact format */}
            {metadataItems.length > 0 && (
              <div className="space-y-2">
                {metadataItems.slice(0, 3).map((item, index) => (
                  <div key={index} className="text-sm text-gray-600">
                    <span className="font-medium text-gray-900">{item.label}:</span> {item.value}
                  </div>
                ))}
              </div>
            )}
            
            {/* Genres in compact format */}
            {artist.genres && artist.genres.length > 0 && (
              <div>
                <div className="text-sm font-medium text-gray-900 mb-2">Genres:</div>
                <div className="flex flex-wrap gap-1">
                  {artist.genres.slice(0, 4).map((genre: any, index) => (
                    <button
                      key={typeof genre === 'string' ? genre : genre.name || index}
                      onClick={() => handleGenreClick(typeof genre === 'string' ? genre : genre.name)}
                      className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                    >
                      {typeof genre === 'string' ? genre : genre.name || 'Unknown Genre'}
                    </button>
                  ))}
                  {artist.genres.length > 4 && (
                    <span className="px-2 py-1 text-xs text-gray-500">
                      +{artist.genres.length - 4} more
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Now Playing Section */}
      {nowPlaying && nowPlaying.artist === artistId && (
        <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-xl border border-green-200">
          <div className="flex items-center gap-4">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold text-green-800 mb-1">Currently Playing</h2>
              <p className="text-xl font-bold text-gray-900 truncate">{nowPlaying.track}</p>
              {nowPlaying.album && (
                <p className="text-gray-600">from {nowPlaying.album}</p>
              )}
            </div>
            {nowPlaying.artworkUrl && (
              <img
                src={nowPlaying.artworkUrl}
                alt={nowPlaying.album || ''}
                className="w-16 h-16 rounded-lg object-cover flex-shrink-0 shadow-md"
              />
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Biography and Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Biography */}
          {artist.biography && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Biography</h2>
              <div className="text-gray-700 leading-relaxed">
                {artist.biography.length > 500 ? (
                  <>
                    {artist.biography.substring(0, 500)}...
                    <button className="text-blue-600 hover:underline ml-2 font-medium">
                      Read more
                    </button>
                  </>
                ) : (
                  artist.biography
                )}
              </div>
            </div>
          )}

          {/* Detailed Information */}
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Artist Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                {metadataItems.map((item, index) => (
                  <div key={index} className="flex justify-between py-2 border-b border-gray-100 last:border-b-0">
                    <span className="font-medium text-gray-600">{item.label}</span>
                    <span className="text-gray-900">{item.value}</span>
                  </div>
                ))}
              </div>
              
              {/* Data Sources */}
              {artist.sources && artist.sources.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Data Sources</h3>
                  <div className="space-y-2">
                    {artist.sources.map((source, index) => (
                      <div key={index} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{source.name}</span>
                        <div className="w-16 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-600 h-2 rounded-full" 
                            style={{ width: `${source.weight * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Navigation Tabs for Additional Content */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="border-b border-gray-200 px-6 py-4">
              <nav className="flex space-x-8">
                {[
                  { key: 'discography', label: 'Discography' },
                  { key: 'similar', label: 'Similar Artists' }
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key as any)}
                    className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                      activeTab === tab.key
                        ? 'border-blue-600 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            </div>

            <div className="p-6">
              {activeTab === 'discography' && (
                <ArtistDiscography 
                  artistName={artist.name}
                  onAlbumClick={(album) => navigate('album', album.id, album, album.title)}
                />
              )}

              {activeTab === 'similar' && (
                <SimilarArtists 
                  artistName={artist.name}
                  onArtistClick={(artistName) => navigate('artist', artistName, { name: artistName }, artistName)}
                />
              )}
            </div>
          </div>
        </div>
        
        {/* Right Column - Albums and Quick Info */}
        <div className="space-y-6">
          {/* Recent Albums */}
          {artist.albums && artist.albums.length > 0 && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Albums</h3>
              <div className="space-y-4">
                {artist.albums.slice(0, 6).map((album) => (
                  <button
                    key={album.id}
                    onClick={() => handleAlbumClick(album)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left group"
                  >
                    <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
                      {album.artwork_url ? (
                        <img
                          src={album.artwork_url}
                          alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Music className="w-5 h-5 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                        {album.title}
                      </h4>
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
                  </button>
                ))}
                
                {artist.albums.length > 6 && (
                  <button
                    onClick={() => setActiveTab('discography')}
                    className="w-full text-center py-3 text-blue-600 hover:text-blue-700 font-medium text-sm border-t border-gray-200 mt-4 pt-4"
                  >
                    View all {artist.albums.length} albums →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* All Genres */}
          {artist.genres && artist.genres.length > 4 && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">All Genres</h3>
              <div className="flex flex-wrap gap-2">
                {artist.genres.map((genre: any, index) => (
                  <button
                    key={typeof genre === 'string' ? genre : genre.name || index}
                    onClick={() => handleGenreClick(typeof genre === 'string' ? genre : genre.name)}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors"
                  >
                    {typeof genre === 'string' ? genre : genre.name || 'Unknown Genre'}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-3">
              {artist.albums && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Albums</span>
                  <span className="font-semibold text-gray-900">{artist.albums.length}</span>
                </div>
              )}
              {artist.genres && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Genres</span>
                  <span className="font-semibold text-gray-900">{artist.genres.length}</span>
                </div>
              )}
              {artist.quality_score && (
                <div className="flex justify-between items-center py-2">
                  <span className="text-gray-600">Data Quality</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 bg-gray-200 rounded-full h-2">
                      <div 
                        className="bg-green-600 h-2 rounded-full" 
                        style={{ width: `${artist.quality_score * 100}%` }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium text-gray-900">
                      {(artist.quality_score * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};