import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, ArrowRight, Star, ExternalLink } from 'lucide-react';
import SkeletonLoader from './SkeletonLoader';

interface SimilarArtist {
  id: string;
  name: string;
  similarity: number;
  genres?: string[];
  artworkUrl?: string;
  description?: string;
  listeners?: number;
  playcount?: number;
}

interface SimilarArtistsProps {
  artistName: string;
  onArtistClick?: (artistName: string) => void;
  className?: string;
  maxItems?: number;
}

const SimilarArtists: React.FC<SimilarArtistsProps> = ({ 
  artistName, 
  onArtistClick,
  className = '',
  maxItems = 12
}) => {
  const [similarArtists, setSimilarArtists] = useState<SimilarArtist[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!artistName) return;

    const fetchSimilarArtists = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`/api/music/artist/similar`, {
          params: { artist: artistName }
        });
        setSimilarArtists(response.data.artists || []);
      } catch (error) {
        console.error('Error fetching similar artists:', error);
        setSimilarArtists([]);
      } finally {
        setLoading(false);
      }
    };

    fetchSimilarArtists();
  }, [artistName]);

  const displayedArtists = showAll ? similarArtists : similarArtists.slice(0, maxItems);

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 0.8) return 'text-green-400';
    if (similarity >= 0.6) return 'text-yellow-400';
    if (similarity >= 0.4) return 'text-orange-400';
    return 'text-red-400';
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  if (loading) {
    return <SkeletonLoader type="similar" className={className} />;
  }

  if (similarArtists.length === 0) {
    return (
      <div className={`${className} text-center py-12`}>
        <Users className="w-16 h-16 text-themed-muted mx-auto mb-4" />
        <h3 className="text-lg font-bold text-themed-primary mb-2">No similar artists found</h3>
        <p className="text-themed-muted">
          We couldn't find artists similar to {artistName}.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-themed-primary mb-1">Similar Artists</h2>
          <p className="text-sm text-themed-muted">
            Artists with similar musical style to {artistName}
          </p>
        </div>
        
        {similarArtists.length > maxItems && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-2 px-4 py-2 bg-themed-deep border border-themed-medium rounded-lg text-sm font-medium text-themed-primary hover:border-accent-primary transition-colors"
          >
            {showAll ? 'Show Less' : `Show All (${similarArtists.length})`}
            <ArrowRight className={`w-4 h-4 transition-transform ${showAll ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>

      {/* Artists Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {displayedArtists.map((artist) => (
          <div
            key={artist.id}
            onClick={() => onArtistClick?.(artist.name)}
            className="group cursor-pointer bg-white/5 rounded-lg p-4 hover:bg-white/10 transition-all duration-300 border border-themed-subtle hover:border-accent-primary/50"
          >
            {/* Artist Image */}
            <div className="aspect-square mb-3 relative overflow-hidden rounded-lg bg-themed-deep">
              {artist.artworkUrl ? (
                <img
                  src={artist.artworkUrl}
                  alt={artist.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Users className="w-8 h-8 text-themed-muted" />
                </div>
              )}
              
              {/* Similarity Badge */}
              <div className="absolute top-2 right-2 bg-black/80 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                <Star className={`w-3 h-3 ${getSimilarityColor(artist.similarity)}`} />
                <span className={`text-xs font-bold ${getSimilarityColor(artist.similarity)}`}>
                  {Math.round(artist.similarity * 100)}%
                </span>
              </div>

              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <ExternalLink className="w-6 h-6 text-white" />
              </div>
            </div>

            {/* Artist Info */}
            <div className="space-y-2">
              <h3 className="font-bold text-themed-primary text-sm line-clamp-2 group-hover:text-accent-primary transition-colors">
                {artist.name}
              </h3>
              
              {/* Genres */}
              {artist.genres && artist.genres.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {artist.genres.slice(0, 2).map((genre, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-themed-deep rounded text-xs text-themed-muted"
                    >
                      {genre}
                    </span>
                  ))}
                  {artist.genres.length > 2 && (
                    <span className="px-2 py-1 bg-themed-deep rounded text-xs text-themed-muted">
                      +{artist.genres.length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* Stats */}
              <div className="flex items-center justify-between text-xs text-themed-muted">
                {artist.listeners && (
                  <span>{formatNumber(artist.listeners)} listeners</span>
                )}
                {artist.playcount && (
                  <span>{formatNumber(artist.playcount)} plays</span>
                )}
              </div>

              {/* Description */}
              {artist.description && (
                <p className="text-xs text-themed-muted line-clamp-2">
                  {artist.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Show More Button (Alternative) */}
      {!showAll && similarArtists.length > maxItems && (
        <div className="text-center mt-6">
          <button
            onClick={() => setShowAll(true)}
            className="px-6 py-3 bg-themed-deep border border-themed-medium rounded-lg text-sm font-medium text-themed-primary hover:border-accent-primary transition-colors"
          >
            Show {similarArtists.length - maxItems} More Artists
          </button>
        </div>
      )}
    </div>
  );
};

export default SimilarArtists;