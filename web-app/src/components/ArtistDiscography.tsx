import React, { useState, useEffect } from 'react';
import { Disc, Calendar, Grid, List, Play, ExternalLink } from 'lucide-react';
import { AlbumArtwork } from './ProgressiveImage';
import SkeletonLoader from './SkeletonLoader';
import { musicDataProvider, type UnifiedAlbum } from '../utils/MusicDataProvider';

interface ArtistDiscographyProps {
  artistName: string;
  onAlbumClick?: (album: UnifiedAlbum) => void;
  className?: string;
}

const ArtistDiscography: React.FC<ArtistDiscographyProps> = ({ 
  artistName, 
  onAlbumClick,
  className = '' 
}) => {
  const [albums, setAlbums] = useState<UnifiedAlbum[]>([]);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterType, setFilterType] = useState<'all' | 'album' | 'single' | 'ep'>('all');
  const [sortBy, setSortBy] = useState<'year' | 'title' | 'type'>('year');

  useEffect(() => {
    if (!artistName) return;

    const fetchDiscography = async () => {
      setLoading(true);
      try {
        const results = await musicDataProvider.searchAlbums('', artistName, 50);
        setAlbums(results);
      } catch (error) {
        console.error('Error fetching discography:', error);
        setAlbums([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDiscography();
  }, [artistName]);

  const filteredAndSortedAlbums = albums
    .filter(album => filterType === 'all' || album.type === filterType)
    .sort((a, b) => {
      switch (sortBy) {
        case 'year':
          const yearA = parseInt(a.year || '0');
          const yearB = parseInt(b.year || '0');
          return yearB - yearA;
        case 'title':
          return a.title.localeCompare(b.title);
        case 'type':
          return (a.type || '').localeCompare(b.type || '');
        default:
          return 0;
      }
    });

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'album': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'single': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'ep': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'compilation': return 'bg-orange-500/20 text-orange-400 border-orange-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const renderGridView = () => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
      {filteredAndSortedAlbums.map((album) => (
        <div
          key={album.id}
          onClick={() => onAlbumClick?.(album)}
          className="group cursor-pointer bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all duration-300 border border-themed-subtle hover:border-accent-primary/50"
        >
          {/* Album Artwork */}
          <div className="aspect-square mb-3 relative overflow-hidden rounded-lg bg-themed-deep">
            <AlbumArtwork
              src={album.artworkUrl}
              album={album.title}
              artist={artistName}
              size="medium"
              className="w-full h-full group-hover:scale-105 transition-transform duration-300"
            />
            
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
              <Play className="w-8 h-8 text-white" />
            </div>

            {/* Type Badge */}
            <div className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${getTypeColor(album.type || 'album')}`}>
              {album.type || 'album'}
            </div>
          </div>

          {/* Album Info */}
          <div className="space-y-1">
            <h3 className="font-bold text-themed-primary text-sm line-clamp-2 group-hover:text-accent-primary transition-colors">
              {album.title}
            </h3>
            <div className="flex items-center justify-between text-xs text-themed-muted">
              <span>{album.year || 'Unknown'}</span>
              {album.trackCount && (
                <span>{album.trackCount} tracks</span>
              )}
            </div>
            {album.label && (
              <p className="text-xs text-themed-muted truncate">{album.label}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );

  const renderListView = () => (
    <div className="space-y-2">
      {filteredAndSortedAlbums.map((album) => (
        <div
          key={album.id}
          onClick={() => onAlbumClick?.(album)}
          className="group cursor-pointer bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all duration-300 border border-themed-subtle hover:border-accent-primary/50 flex items-center gap-4"
        >
          {/* Album Artwork */}
          <AlbumArtwork
            src={album.artworkUrl}
            album={album.title}
            artist={artistName}
            size="small"
            className="w-16 h-16 flex-shrink-0"
          />

          {/* Album Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-bold text-themed-primary group-hover:text-accent-primary transition-colors truncate">
                {album.title}
              </h3>
              <div className={`px-2 py-1 rounded text-xs font-bold uppercase tracking-wider ${getTypeColor(album.type || 'album')}`}>
                {album.type || 'album'}
              </div>
            </div>
              <div className="flex items-center gap-4 text-sm text-themed-muted">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {album.year || 'Unknown'}
                </span>
                {album.trackCount && (
                  <span>{album.trackCount} tracks</span>
                )}
                {album.label && (
                  <span className="truncate">{album.label}</span>
                )}
              </div>
          </div>

          {/* Action Button */}
          <div className="flex-shrink-0">
            <ExternalLink className="w-5 h-5 text-themed-muted group-hover:text-accent-primary transition-colors" />
          </div>
        </div>
      ))}
    </div>
  );

  if (loading) {
    return <SkeletonLoader type="discography" className={className} />;
  }

  return (
    <div className={className}>
      {/* Header with Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-bold text-themed-primary mb-1">Discography</h2>
          <p className="text-sm text-themed-muted">
            {filteredAndSortedAlbums.length} {filterType === 'all' ? 'releases' : `${filterType}s`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="bg-themed-deep border border-themed-medium rounded-lg px-3 py-2 text-sm text-themed-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="all">All Types</option>
            <option value="album">Albums</option>
            <option value="single">Singles</option>
            <option value="ep">EPs</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-themed-deep border border-themed-medium rounded-lg px-3 py-2 text-sm text-themed-primary focus:outline-none focus:border-accent-primary"
          >
            <option value="year">Year</option>
            <option value="title">Title</option>
            <option value="type">Type</option>
          </select>

          {/* View Mode */}
          <div className="flex border border-themed-medium rounded-lg overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 transition-colors ${
                viewMode === 'grid' 
                  ? 'bg-accent-primary text-white' 
                  : 'bg-themed-deep text-themed-muted hover:text-themed-primary'
              }`}
            >
              <Grid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 transition-colors ${
                viewMode === 'list' 
                  ? 'bg-accent-primary text-white' 
                  : 'bg-themed-deep text-themed-muted hover:text-themed-primary'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {filteredAndSortedAlbums.length === 0 ? (
        <div className="text-center py-12">
          <Disc className="w-16 h-16 text-themed-muted mx-auto mb-4" />
          <h3 className="text-lg font-bold text-themed-primary mb-2">No releases found</h3>
          <p className="text-themed-muted">
            {filterType === 'all' 
              ? 'No discography data available for this artist.'
              : `No ${filterType}s found for this artist.`
            }
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'grid' ? renderGridView() : renderListView()}
        </>
      )}
    </div>
  );
};

export default ArtistDiscography;