import React, { useState, useEffect } from 'react';
import { Music, User, Calendar, Disc, Clock, Star, Database } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';
import { musicDataProvider, type UnifiedArtist, type UnifiedAlbum } from '../utils/MusicDataProvider';

interface NowPlayingInfo {
  track?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state?: string;
  position?: number;
  duration?: number;
}

// Using UnifiedArtist and UnifiedAlbum from MusicDataProvider instead of local interfaces

interface EnhancedMusicInfoProps {
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const EnhancedMusicInfo: React.FC<EnhancedMusicInfoProps> = ({ className = '', nowPlaying }) => {
  const [artistInfo, setArtistInfo] = useState<UnifiedArtist | null>(null);
  const [albumInfo, setAlbumInfo] = useState<UnifiedAlbum | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch enhanced artist and album information
  useEffect(() => {
    const fetchEnhancedInfo = async () => {
      if (!nowPlaying?.artist) {
        setArtistInfo(null);
        setAlbumInfo(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Search for artist with Qobuz priority
        const artists = await musicDataProvider.searchArtists(nowPlaying.artist, 1);
        if (artists.length > 0) {
          const artistData = await musicDataProvider.getArtistDetails(artists[0].id);
          if (artistData) {
            setArtistInfo(artistData);
          }
        }

        // Search for album if available
        if (nowPlaying.album) {
          const albums = await musicDataProvider.searchAlbums(nowPlaying.album, nowPlaying.artist, 1);
          if (albums.length > 0) {
            const albumData = await musicDataProvider.getAlbumDetails(albums[0].id);
            if (albumData) {
              setAlbumInfo(albumData);
            } else {
              setAlbumInfo(albums[0]);
            }
          }
        }
      } catch (err) {
        console.error('Error fetching enhanced music info:', err);
        setError('Failed to load enhanced music information');
      } finally {
        setLoading(false);
      }
    };

    fetchEnhancedInfo();
  }, [nowPlaying?.artist, nowPlaying?.album]);

  const getSourceBadge = (source: string, weight: number) => {
    const badge = musicDataProvider.getSourceBadge(source, weight);
    if (badge.priority === 'high') {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
          <Star className="w-3 h-3" />
          Qobuz High Quality
        </div>
      );
    } else if (badge.priority === 'medium') {
      return (
        <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full">
          <Database className="w-3 h-3" />
          {badge.label}
        </div>
      );
    }
    
    return null;
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Enhanced Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Music Info</h1>
        <p className="text-gray-600">Enhanced information powered by Qobuz</p>
      </div>

      {/* Enhanced Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {nowPlaying?.artist ? (
            <div className="space-y-6">
              {/* Current Track Section */}
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Music className="w-5 h-5" />
                  Now Playing
                </h2>
                
                <div className="flex items-start gap-6">
                  {/* Album Artwork */}
                  <div className="flex-shrink-0">
                    {(albumInfo?.artwork_url || nowPlaying.artworkUrl) ? (
                      <ProgressiveImage
                        src={albumInfo?.artwork_url || nowPlaying.artworkUrl || ''}
                        alt={nowPlaying.album || 'Album artwork'}
                        className="w-32 h-32 rounded-lg object-cover shadow-md"
                        fallbackType="album"
                        size="medium"
                      />
                    ) : (
                      <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                        <Disc className="w-12 h-12 text-gray-400" />
                      </div>
                    )}
                  </div>

                  {/* Track Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 truncate">
                      {nowPlaying.track}
                    </h3>
                    <p className="text-lg text-blue-700 mb-1">
                      by {nowPlaying.artist}
                    </p>
                    {nowPlaying.album && (
                      <p className="text-gray-600 mb-3">
                        from {nowPlaying.album}
                      </p>
                    )}

                    {/* Album Details */}
                    {albumInfo && (
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mb-3">
                        {albumInfo.release_date && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(albumInfo.release_date).getFullYear()}
                          </div>
                        )}
                        {albumInfo.track_count && (
                          <div className="flex items-center gap-1">
                            <Disc className="w-4 h-4" />
                            {albumInfo.track_count} tracks
                          </div>
                        )}
                        {nowPlaying.duration && (
                          <div className="flex items-center gap-1">
                            <Clock className="w-4 h-4" />
                            {formatDuration(nowPlaying.duration)}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Source Badge */}
                    <div className="mb-3">
                      {albumInfo && getSourceBadge(albumInfo.source, albumInfo.weight)}
                    </div>

                    {/* Playback State */}
                    {nowPlaying.state && (
                      <div className="text-sm text-gray-500">
                        Status: <span className="capitalize">{nowPlaying.state}</span>
                        {nowPlaying.position && nowPlaying.duration && (
                          <span className="ml-2">
                            ({formatDuration(nowPlaying.position)} / {formatDuration(nowPlaying.duration)})
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Artist Information Section */}
              {artistInfo && (
                <div className="bg-white rounded-lg p-6 shadow-sm">
                  <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <User className="w-5 h-5" />
                    Artist Information
                  </h2>

                  <div className="flex items-start gap-6">
                    {/* Artist Image */}
                    <div className="flex-shrink-0">
                      {artistInfo.image_url ? (
                        <ProgressiveImage
                          src={artistInfo.image_url}
                          alt={artistInfo.name}
                          className="w-24 h-24 rounded-lg object-cover shadow-md"
                          fallbackType="artist"
                          size="small"
                        />
                      ) : (
                        <div className="w-24 h-24 bg-gray-200 rounded-lg flex items-center justify-center">
                          <User className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>

                    {/* Artist Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-xl font-bold text-gray-900 mb-2">
                        {artistInfo.name}
                      </h3>

                      {/* Genres */}
                      {artistInfo.genres && artistInfo.genres.length > 0 && (
                        <div className="mb-3">
                          <div className="flex flex-wrap gap-2">
                            {artistInfo.genres.map((genre: any, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                              >
                                {typeof genre === 'string' ? genre : genre.name || 'Unknown Genre'}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Album Count */}
                      {artistInfo.albums_count && (
                        <p className="text-sm text-gray-600 mb-2">
                          {artistInfo.albums_count} albums in catalog
                        </p>
                      )}

                      {/* Source Badge */}
                      <div className="mb-3">
                        {getSourceBadge(artistInfo.source, artistInfo.weight)}
                      </div>

                      {/* Biography Preview */}
                      {artistInfo.biography && (
                        <div className="text-sm text-gray-600">
                          <p className="line-clamp-3">
                            {artistInfo.biography.substring(0, 200)}...
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Albums Section - Removed since UnifiedArtist doesn't include albums array */}
              {/* This would need a separate API call to get artist's albums */}

              {/* Loading State */}
              {loading && (
                <div className="bg-white rounded-lg p-6 shadow-sm">
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-3 text-gray-600">Loading enhanced information...</span>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800">{error}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-20 h-20 text-gray-300 mx-auto mb-6" />
              <h3 className="text-xl font-medium text-gray-900 mb-3">No Music Playing</h3>
              <p className="text-gray-500 mb-4">
                Start playing music to see enhanced artist and track information.
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg">
                <Star className="w-4 h-4" />
                Powered by Qobuz for high-quality metadata
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};