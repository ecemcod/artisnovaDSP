import React, { useState, useEffect } from 'react';
import { Disc, Calendar, Music, User, Building, Clock, Star } from 'lucide-react';
import { useNavigation } from './NavigationProvider';

interface Album {
  id: string;
  title: string;
  mbid?: string;
  artist_name?: string;
  artist_id?: string;
  release_date?: string;
  release_type?: string;
  label_name?: string;
  label_id?: string;
  catalog_number?: string;
  artwork_url?: string;
  track_count?: number;
  tracks?: Track[];
  credits?: Credit[];
  genres?: string[];
  sources?: DataSource[];
  quality_score?: number;
}

interface Track {
  id: string;
  position: number;
  title: string;
  duration?: number;
  credits?: Credit[];
}

interface Credit {
  id: string;
  name: string;
  role: string;
  instruments?: string[];
}

interface DataSource {
  name: string;
  weight: number;
}

interface EnhancedAlbumViewProps {
  albumId: string;
  className?: string;
}

export const EnhancedAlbumView: React.FC<EnhancedAlbumViewProps> = ({ 
  albumId, 
  className = '' 
}) => {
  const [album, setAlbum] = useState<Album | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { navigate } = useNavigation();

  useEffect(() => {
    loadAlbumData();
  }, [albumId]);

  const loadAlbumData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/music/album/${encodeURIComponent(albumId)}?includeTracks=true&includeCredits=true`);
      if (!response.ok) throw new Error('Failed to load album data');
      
      const data = await response.json();
      setAlbum(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleArtistClick = () => {
    if (album?.artist_id) {
      navigate('artist', album.artist_id, { name: album.artist_name }, album.artist_name);
    }
  };

  const handleLabelClick = () => {
    if (album?.label_id) {
      navigate('label', album.label_id, { name: album.label_name }, album.label_name);
    }
  };

  const handleGenreClick = (genre: string) => {
    navigate('genre', genre, { name: genre }, genre);
  };

  const formatDuration = (seconds?: number): string => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTotalDuration = (): string => {
    if (!album?.tracks) return '';
    const total = album.tracks.reduce((sum, track) => sum + (track.duration || 0), 0);
    return formatDuration(total);
  };

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
                <div className="h-5 bg-gray-200 rounded w-48"></div>
              </div>
              <div className="space-y-2">
                <div className="h-4 bg-gray-200 rounded w-32"></div>
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
                <div className="space-y-3">
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
                <div className="grid grid-cols-2 gap-3">
                  <div className="h-16 bg-gray-200 rounded-lg"></div>
                  <div className="h-16 bg-gray-200 rounded-lg"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !album) {
    return (
      <div className={`text-center p-8 ${className}`}>
        <Disc className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Album not found</h3>
        <p className="text-gray-600">{error || 'The requested album could not be loaded.'}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Compact Album Header */}
      <div className="flex items-start gap-6 p-6 bg-white rounded-xl shadow-sm border border-gray-200">
        {/* Album Artwork */}
        <div className="w-32 h-32 flex-shrink-0">
          {album.artwork_url ? (
            <img
              src={album.artwork_url}
              alt={album.title}
              className="w-full h-full rounded-lg object-cover shadow-md"
            />
          ) : (
            <div className="w-full h-full bg-gray-100 rounded-lg flex items-center justify-center">
              <Disc className="w-12 h-12 text-gray-400" />
            </div>
          )}
        </div>

        {/* Album Info */}
        <div className="flex-1 min-w-0 space-y-4">
          <div className="space-y-2">
            <h1 className="text-3xl font-bold text-gray-900 truncate">{album.title}</h1>
            {album.artist_name && (
              <button
                onClick={handleArtistClick}
                className="text-lg text-blue-600 hover:text-blue-700 font-medium flex items-center space-x-2 transition-colors"
              >
                <User className="w-5 h-5" />
                <span>{album.artist_name}</span>
              </button>
            )}
            <div className="flex items-center gap-3">
              {album.release_type && (
                <span className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full font-medium">
                  {album.release_type}
                </span>
              )}
              {album.quality_score && (
                <div className="flex items-center space-x-1 text-sm text-gray-600">
                  <Star className="w-4 h-4" />
                  <span>{(album.quality_score * 100).toFixed(0)}% quality</span>
                </div>
              )}
            </div>
          </div>

          {/* Album Details Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              {album.release_date && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>{album.release_date}</span>
                </div>
              )}
              {album.track_count && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Music className="w-4 h-4" />
                  <span>{album.track_count} tracks</span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {album.label_name && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Building className="w-4 h-4" />
                  <button
                    onClick={handleLabelClick}
                    className="text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    {album.label_name}
                  </button>
                </div>
              )}
              {getTotalDuration() && (
                <div className="flex items-center space-x-2 text-sm text-gray-600">
                  <Clock className="w-4 h-4" />
                  <span>{getTotalDuration()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Genres */}
          {album.genres && album.genres.length > 0 && (
            <div>
              <div className="text-sm font-medium text-gray-900 mb-2">Genres:</div>
              <div className="flex flex-wrap gap-1">
                {album.genres.slice(0, 4).map((genre) => (
                  <button
                    key={genre}
                    onClick={() => handleGenreClick(genre)}
                    className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium hover:bg-blue-200 transition-colors"
                  >
                    {genre}
                  </button>
                ))}
                {album.genres.length > 4 && (
                  <span className="px-2 py-1 text-xs text-gray-500">
                    +{album.genres.length - 4} more
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Track Listing and Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Track Listing */}
          {album.tracks && album.tracks.length > 0 && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Track Listing</h2>
              <div className="space-y-1">
                {album.tracks.map((track) => (
                  <div key={track.id} className="flex items-center space-x-4 p-3 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 text-center text-sm text-gray-500 font-medium">
                      {track.position}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate">{track.title}</h3>
                      {track.credits && track.credits.length > 0 && (
                        <p className="text-sm text-gray-600 truncate">
                          {track.credits.slice(0, 2).map(c => c.name).join(', ')}
                          {track.credits.length > 2 && ` +${track.credits.length - 2} more`}
                        </p>
                      )}
                    </div>
                    {track.duration && (
                      <div className="text-sm text-gray-500 font-mono">
                        {formatDuration(track.duration)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Album Credits */}
          {album.credits && album.credits.length > 0 && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Credits</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {album.credits.slice(0, 8).map((credit) => (
                  <div key={credit.id} className="flex items-start space-x-3">
                    <div className="flex-1 min-w-0">
                      <button
                        onClick={() => navigate('artist', credit.name, { name: credit.name }, credit.name)}
                        className="font-medium text-blue-600 hover:text-blue-700 transition-colors truncate block"
                      >
                        {credit.name}
                      </button>
                      <p className="text-sm text-gray-600">{credit.role}</p>
                      {credit.instruments && credit.instruments.length > 0 && (
                        <p className="text-xs text-gray-500">{credit.instruments.join(', ')}</p>
                      )}
                    </div>
                  </div>
                ))}
                {album.credits.length > 8 && (
                  <div className="col-span-full text-center pt-4 border-t border-gray-200">
                    <p className="text-gray-600 text-sm">
                      {album.credits.length - 8} more credits available
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Additional Album Info */}
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Album Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-3">
                {album.catalog_number && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-medium text-gray-600">Catalog</span>
                    <span className="text-gray-900">{album.catalog_number}</span>
                  </div>
                )}
                {album.release_date && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-medium text-gray-600">Release Date</span>
                    <span className="text-gray-900">{album.release_date}</span>
                  </div>
                )}
                {album.release_type && (
                  <div className="flex justify-between py-2 border-b border-gray-100">
                    <span className="font-medium text-gray-600">Type</span>
                    <span className="text-gray-900">{album.release_type}</span>
                  </div>
                )}
              </div>
              
              {/* Data Sources */}
              {album.sources && album.sources.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Data Sources</h3>
                  <div className="space-y-2">
                    {album.sources.map((source, index) => (
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
        </div>
        
        {/* Right Column - Quick Stats and Actions */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Tracks</span>
                <span className="text-2xl font-bold text-gray-900">{album.track_count || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Duration</span>
                <span className="text-2xl font-bold text-gray-900">{getTotalDuration() || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Year</span>
                <span className="text-2xl font-bold text-gray-900">{album.release_date?.split('-')[0] || '—'}</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-gray-600">Genres</span>
                <span className="text-2xl font-bold text-gray-900">{album.genres?.length || 0}</span>
              </div>
            </div>
          </div>

          {/* All Genres */}
          {album.genres && album.genres.length > 4 && (
            <div className="p-6 bg-white rounded-xl shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">All Genres</h3>
              <div className="flex flex-wrap gap-2">
                {album.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => handleGenreClick(genre)}
                    className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Navigation to Artist */}
          {album.artist_name && (
            <div className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Explore Artist</h3>
              <button
                onClick={handleArtistClick}
                className="w-full flex items-center justify-between p-4 bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center space-x-3">
                  <User className="w-8 h-8 text-blue-600" />
                  <div className="text-left">
                    <h4 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                      {album.artist_name}
                    </h4>
                    <p className="text-sm text-gray-600">View artist profile</p>
                  </div>
                </div>
                <div className="text-blue-600 group-hover:translate-x-1 transition-transform">
                  →
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};