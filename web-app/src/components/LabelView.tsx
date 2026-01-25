import React, { useState, useEffect } from 'react';
import { Building, Calendar, MapPin, ExternalLink, Disc, User, Star } from 'lucide-react';
import { useNavigation } from './NavigationProvider';

interface Label {
  id: string;
  name: string;
  mbid?: string;
  description?: string;
  country?: string;
  founded?: string;
  website?: string;
  image_url?: string;
  releases?: Release[];
  artists?: LabelArtist[];
  genres?: string[];
  sources?: DataSource[];
  quality_score?: number;
}

interface Release {
  id: string;
  title: string;
  artist_name: string;
  artist_id?: string;
  release_date?: string;
  artwork_url?: string;
  catalog_number?: string;
}

interface LabelArtist {
  id: string;
  name: string;
  image_url?: string;
  release_count: number;
}

interface DataSource {
  name: string;
  weight: number;
}

interface LabelViewProps {
  labelId: string;
  className?: string;
}

export const LabelView: React.FC<LabelViewProps> = ({ 
  labelId, 
  className = '' 
}) => {
  const [label, setLabel] = useState<Label | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'releases' | 'artists'>('overview');
  
  const { navigate } = useNavigation();

  useEffect(() => {
    loadLabelData();
  }, [labelId]);

  const loadLabelData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/music/label/${encodeURIComponent(labelId)}`);
      if (!response.ok) throw new Error('Failed to load label data');
      
      const data = await response.json();
      setLabel(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  const handleReleaseClick = (release: Release) => {
    navigate('album', release.id, release, release.title);
  };

  const handleArtistClick = (artist: LabelArtist) => {
    navigate('artist', artist.id, artist, artist.name);
  };

  const handleGenreClick = (genre: string) => {
    navigate('genre', genre, { name: genre }, genre);
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="flex space-x-6 mb-8">
          <div className="w-48 h-48 bg-gray-200 rounded-lg"></div>
          <div className="flex-1 space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4"></div>
            <div className="space-y-2">
              <div className="h-4 bg-gray-200 rounded"></div>
              <div className="h-4 bg-gray-200 rounded w-5/6"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !label) {
    return (
      <div className={`text-center py-12 ${className}`}>
        <Building className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">Label not found</h3>
        <p className="text-gray-500">{error || 'The requested label could not be loaded.'}</p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Label Header */}
      <div className="flex flex-col md:flex-row space-y-6 md:space-y-0 md:space-x-8 mb-8">
        {/* Label Logo */}
        <div className="flex-shrink-0">
          {label.image_url ? (
            <img
              src={label.image_url}
              alt={label.name}
              className="w-48 h-48 rounded-lg object-cover shadow-lg"
            />
          ) : (
            <div className="w-48 h-48 bg-gray-200 rounded-lg flex items-center justify-center">
              <Building className="w-16 h-16 text-gray-400" />
            </div>
          )}
        </div>

        {/* Label Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{label.name}</h1>
              <span className="inline-block px-3 py-1 text-sm bg-purple-100 text-purple-800 rounded-full mb-2">
                Record Label
              </span>
            </div>
            {label.quality_score && (
              <div className="flex items-center space-x-1 text-sm text-gray-500">
                <Star className="w-4 h-4" />
                <span>{(label.quality_score * 100).toFixed(0)}% quality</span>
              </div>
            )}
          </div>

          {/* Label Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {label.country && (
              <div className="flex items-center space-x-2 text-gray-600">
                <MapPin className="w-4 h-4" />
                <span>{label.country}</span>
              </div>
            )}
            {label.founded && (
              <div className="flex items-center space-x-2 text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>Founded {label.founded}</span>
              </div>
            )}
            {label.website && (
              <div className="flex items-center space-x-2 text-gray-600">
                <ExternalLink className="w-4 h-4" />
                <a
                  href={label.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  Official Website
                </a>
              </div>
            )}
          </div>

          {/* Genres */}
          {label.genres && label.genres.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-medium text-gray-700 mb-2">Genres</h3>
              <div className="flex flex-wrap gap-2">
                {label.genres.slice(0, 8).map((genre) => (
                  <button
                    key={genre}
                    onClick={() => handleGenreClick(genre)}
                    className="inline-flex items-center px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 transition-colors"
                  >
                    {genre}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Data Sources */}
          {label.sources && label.sources.length > 0 && (
            <div className="text-xs text-gray-500">
              Sources: {label.sources.map(s => s.name).join(', ')}
            </div>
          )}
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200 mb-8">
        <nav className="flex space-x-8">
          {['overview', 'releases', 'artists'].map((tab) => (
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
          {/* Description */}
          {label.description && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">About</h2>
              <div className="prose max-w-none text-gray-700">
                {label.description.split('\n').map((paragraph, index) => (
                  <p key={index} className="mb-4">{paragraph}</p>
                ))}
              </div>
            </div>
          )}

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{label.releases?.length || 0}</div>
              <div className="text-sm text-gray-500">Releases</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{label.artists?.length || 0}</div>
              <div className="text-sm text-gray-500">Artists</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{label.genres?.length || 0}</div>
              <div className="text-sm text-gray-500">Genres</div>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-900">{label.founded?.split('-')[0] || '—'}</div>
              <div className="text-sm text-gray-500">Founded</div>
            </div>
          </div>

          {/* Recent Releases Preview */}
          {label.releases && label.releases.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Releases</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {label.releases.slice(0, 6).map((release) => (
                  <button
                    key={release.id}
                    onClick={() => handleReleaseClick(release)}
                    className="group text-left"
                  >
                    <div className="aspect-square mb-2 rounded-lg overflow-hidden bg-gray-200">
                      {release.artwork_url ? (
                        <img
                          src={release.artwork_url}
                          alt={release.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Disc className="w-8 h-8 text-gray-400" />
                        </div>
                      )}
                    </div>
                    <h3 className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-600">
                      {release.title}
                    </h3>
                    <p className="text-xs text-gray-500 truncate">{release.artist_name}</p>
                    {release.release_date && (
                      <p className="text-xs text-gray-400">{release.release_date}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'releases' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Releases</h2>
          {label.releases && label.releases.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {label.releases.map((release) => (
                <button
                  key={release.id}
                  onClick={() => handleReleaseClick(release)}
                  className="group flex space-x-4 p-4 rounded-lg hover:bg-gray-50 transition-colors text-left"
                >
                  <div className="w-16 h-16 rounded-lg overflow-hidden bg-gray-200 flex-shrink-0">
                    {release.artwork_url ? (
                      <img
                        src={release.artwork_url}
                        alt={release.title}
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
                      {release.title}
                    </h3>
                    <p className="text-sm text-gray-600 truncate">{release.artist_name}</p>
                    <div className="text-sm text-gray-500 space-y-1">
                      {release.release_date && <p>{release.release_date}</p>}
                      {release.catalog_number && <p>Cat: {release.catalog_number}</p>}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <Disc className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No releases found</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'artists' && (
        <div>
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Artists</h2>
          {label.artists && label.artists.length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {label.artists.map((artist) => (
                <button
                  key={artist.id}
                  onClick={() => handleArtistClick(artist)}
                  className="group text-center"
                >
                  <div className="w-24 h-24 mx-auto mb-3 rounded-full overflow-hidden bg-gray-200">
                    {artist.image_url ? (
                      <img
                        src={artist.image_url}
                        alt={artist.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <User className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                  </div>
                  <h3 className="font-medium text-sm text-gray-900 truncate group-hover:text-blue-600">
                    {artist.name}
                  </h3>
                  <p className="text-xs text-gray-500">
                    {artist.release_count} release{artist.release_count !== 1 ? 's' : ''}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <User className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No artists found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};