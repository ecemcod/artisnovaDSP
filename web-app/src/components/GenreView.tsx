import React, { useState, useEffect } from 'react';
import { Tag, TrendingUp, Users, Disc, User, Star } from 'lucide-react';
import { useNavigation } from './NavigationProvider';

interface Genre {
  id: string;
  name: string;
  description?: string;
  parent_genres?: string[];
  sub_genres?: string[];
  related_genres?: string[];
  artists?: GenreArtist[];
  albums?: GenreAlbum[];
  popularity_score?: number;
  sources?: DataSource[];
  quality_score?: number;
}

interface GenreArtist {
  id: string;
  name: string;
  image_url?: string;
  album_count: number;
  popularity: number;
}

interface GenreAlbum {
  id: string;
  title: string;
  artist_name: string;
  artist_id?: string;
  release_date?: string;
  artwork_url?: string;
  popularity: number;
}

interface DataSource {
  name: string;
  weight: number;
}

interface GenreViewProps {
  genreId: string;
  className?: string;
}

export const GenreView: React.FC<GenreViewProps> = ({ 
  genreId, 
  className = '' 
}) => {
  const [genre, setGenre] = useState<Genre | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'artists' | 'albums'>('overview');
  
  const { navigate } = useNavigation();

  useEffect(() => {
    loadGenreData();
  }, [genreId]);

  const loadGenreData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/music/genre/${encodeURIComponent(genreId)}`);
      if (!response.ok) throw new Error('Failed to load genre data');
      
      const data = await response.json();
      setGenre(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleArtistClick = (artist: GenreArtist) => {
    navigate('artist', artist.id, artist, artist.name);
  };

  const handleAlbumClick = (album: GenreAlbum) => {
    navigate('album', album.id, album, album.title);
  };

  const handleRelatedGenreClick = (relatedGenre: string) => {
    navigate('genre', relatedGenre, { name: relatedGenre }, relatedGenre);
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="mb-8">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !genre) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <Tag className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Genre not found</h3>
        <p className="text-gray-500">{error || 'The requested genre could not be loaded.'}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Genre Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center space-x-3">
              <Tag className="w-8 h-8 text-blue-600" />
              <span>{genre.name}</span>
            </h1>
            <span className="inline-block px-3 py-1 text-sm bg-blue-100 text-blue-800 rounded-full mb-4">
              Music Genre
            </span>
          </div>
          <div className="text-right">
            {genre.quality_score && (
              <div className="flex items-center space-x-1 text-sm text-gray-500 mb-2">
                <Star className="w-4 h-4" />
                <span>{(genre.quality_score * 100).toFixed(0)}% quality</span>
              </div>
            )}
            {genre.popularity_score && (
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <TrendingUp className="w-4 h-4" />
                <span>{(genre.popularity_score * 100).toFixed(0)}% popularity</span>
              </div>
            )}
          </div>
        </div>

        {/* Genre Description */}
        {genre.description && (
          <div className="prose max-w-none text-gray-700 mb-6">
            {genre.description.split('\n').map((paragraph, index) => (
              <p key={index} className="mb-4">{paragraph}</p>
            ))}
          </div>
        )}

        {/* Genre Hierarchy */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          {/* Parent Genres */}
          {genre.parent_genres && genre.parent_genres.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Parent Genres</h3>
              <div className="space-y-2">
                {genre.parent_genres.map((parentGenre) => (
                  <button
                    key={parentGenre}
                    onClick={() => handleRelatedGenreClick(parentGenre)}
                    className="block w-full text-left px-3 py-2 text-sm bg-gray-50 text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {parentGenre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub Genres */}
          {genre.sub_genres && genre.sub_genres.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Sub Genres</h3>
              <div className="space-y-2">
                {genre.sub_genres.slice(0, 5).map((subGenre) => (
                  <button
                    key={subGenre}
                    onClick={() => handleRelatedGenreClick(subGenre)}
                    className="block w-full text-left px-3 py-2 text-sm bg-green-50 text-green-700 rounded-lg hover:bg-green-100 transition-colors"
                  >
                    {subGenre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Related Genres */}
          {genre.related_genres && genre.related_genres.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">Related Genres</h3>
              <div className="space-y-2">
                {genre.related_genres.slice(0, 5).map((relatedGenre) => (
                  <button
                    key={relatedGenre}
                    onClick={() => handleRelatedGenreClick(relatedGenre)}
                    className="block w-full text-left px-3 py-2 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
                  >
                    {relatedGenre}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Data Sources */}
        {genre.sources && genre.sources.length > 0 && (
          <div className="text-xs text-gray-500">
            Sources: {genre.sources.map(s => s.name).join(', ')}
          </div>
        )}
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8">
          {['overview', 'artists', 'albums'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === tab
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{genre.artists?.length || 0}</div>
              <div className="text-sm text-gray-500">Artists</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{genre.albums?.length || 0}</div>
              <div className="text-sm text-gray-500">Albums</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{genre.sub_genres?.length || 0}</div>
              <div className="text-sm text-gray-500">Sub Genres</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{genre.related_genres?.length || 0}</div>
              <div className="text-sm text-gray-500">Related</div>
            </div>
          </div>

          {/* Top Artists Preview */}
          {genre.artists && genre.artists.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Top Artists</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {genre.artists.slice(0, 6).map((artist) => (
                  <button
                    key={artist.id}
                    onClick={() => handleArtistClick(artist)}
                    className="group text-center"
                  >
                    <div className="w-20 h-20 mx-auto mb-2 rounded-full overflow-hidden bg-gray-200">
                      {artist.image_url ? (
                        <img
                          src={artist.image_url}
                          alt={artist.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <User className="w-6 h-6 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-600">
                      {artist.name}
                    </h3>
                    <p className="text-xs text-gray-500">{artist.album_count} albums</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Popular Albums Preview */}
          {genre.albums && genre.albums.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Popular Albums</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {genre.albums.slice(0, 6).map((album) => (
                  <button
                    key={album.id}
                    onClick={() => handleAlbumClick(album)}
                    className="group text-left"
                  >
                    <div className="aspect-square mb-2 rounded-lg overflow-hidden bg-gray-200">
                      {album.artwork_url ? (
                        <img
                          src={album.artwork_url}
                          alt={album.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-600">
                      {album.title}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">{album.artist_name}</p>
                    {album.release_date && (
                      <p className="text-xs text-gray-400">{album.release_date}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'artists' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Artists in {genre.name}</h2>
          {genre.artists && genre.artists.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {genre.artists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => handleArtistClick(artist)}
                  className="group flex space-x-4 p-4 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                    {artist.image_url ? (
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600">
                      {artist.name}
                    </h3>
                    <div className="text-sm text-gray-500 space-y-1">
                      <p>{artist.album_count} album{artist.album_count !== 1 ? 's' : ''}</p>
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>{(artist.popularity * 100).toFixed(0)}% popularity</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No artists found for this genre</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'albums' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Albums in {genre.name}</h2>
          {genre.albums && genre.albums.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {genre.albums.map((album) => (
                <button
                  key={album.id}
                  onClick={() => handleAlbumClick(album)}
                  className="group flex space-x-4 p-4 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {album.artwork_url ? (
                      <img
                        src={album.artwork_url}
                        alt={album.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Disc className="w-6 h-6 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate group-hover:text-blue-600">
                      {album.title}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">{album.artist_name}</p>
                    <div className="text-sm text-gray-500 space-y-1">
                      {album.release_date && <p>{album.release_date}</p>}
                      <div className="flex items-center space-x-1">
                        <TrendingUp className="w-3 h-3" />
                        <span>{(album.popularity * 100).toFixed(0)}% popularity</span>
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Disc className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No albums found for this genre</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};