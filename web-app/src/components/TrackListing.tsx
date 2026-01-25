import React, { useState } from 'react';
import { Play, Pause, Clock, User, Music, MoreHorizontal } from 'lucide-react';

interface Track {
  position: number;
  title: string;
  duration?: string;
  artists?: string[];
  disc?: number;
  credits?: {
    name: string;
    role: string;
  }[];
}

interface TrackListingProps {
  tracks: Track[];
  onTrackPlay?: (track: Track) => void;
  onArtistClick?: (artistName: string) => void;
  currentlyPlaying?: number;
  className?: string;
}

const TrackListing: React.FC<TrackListingProps> = ({ 
  tracks, 
  onTrackPlay,
  onArtistClick,
  currentlyPlaying,
  className = '' 
}) => {
  const [expandedTrack, setExpandedTrack] = useState<number | null>(null);

  const formatDuration = (duration: string) => {
    // Handle various duration formats (MM:SS, seconds, etc.)
    if (duration.includes(':')) return duration;
    const seconds = parseInt(duration);
    if (isNaN(seconds)) return duration;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const groupedTracks = tracks.reduce((acc, track) => {
    const disc = track.disc || 1;
    if (!acc[disc]) acc[disc] = [];
    acc[disc].push(track);
    return acc;
  }, {} as Record<number, Track[]>);

  const hasMultipleDiscs = Object.keys(groupedTracks).length > 1;

  if (tracks.length === 0) {
    return (
      <div className={`${className} text-center py-12`}>
        <Music className="w-16 h-16 text-text-muted mx-auto mb-4 opacity-40" />
        <h3 className="text-title font-medium text-text-primary mb-2">No Tracks Available</h3>
        <p className="text-body text-text-secondary">
          Track listing is not available for this album.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      {Object.entries(groupedTracks)
        .sort(([a], [b]) => parseInt(a) - parseInt(b))
        .map(([discNumber, discTracks]) => (
          <div key={discNumber} className="mb-8 last:mb-0">
            {hasMultipleDiscs && (
              <h3 className="text-headline font-semibold text-text-primary mb-6 flex items-center gap-2">
                <Music className="w-5 h-5" />
                Disc {discNumber}
              </h3>
            )}
            
            <div className="space-y-1">
              {discTracks.map((track) => (
                <div key={`${discNumber}-${track.position}`} className="group">
                  {/* Main Track Row */}
                  <div
                    className={`flex items-center gap-4 p-3 rounded-lg transition-all duration-200 ${
                      currentlyPlaying === track.position
                        ? 'bg-accent-primary/20 border border-accent-primary/50'
                        : 'hover:bg-white/5 border border-transparent hover:border-themed-subtle'
                    }`}
                  >
                    {/* Track Number / Play Button */}
                    <div className="w-8 flex items-center justify-center">
                      {onTrackPlay ? (
                        <button
                          onClick={() => onTrackPlay(track)}
                          className="w-8 h-8 rounded-full bg-themed-deep border border-themed-medium hover:border-accent-primary hover:bg-accent-primary/20 transition-all flex items-center justify-center group-hover:opacity-100"
                        >
                          {currentlyPlaying === track.position ? (
                            <Pause className="w-4 h-4 text-accent-primary" />
                          ) : (
                            <Play className="w-4 h-4 text-themed-muted group-hover:text-accent-primary" />
                          )}
                        </button>
                      ) : (
                        <span className="text-metadata font-mono text-text-secondary w-full text-center">
                          {hasMultipleDiscs ? `${discNumber}.${track.position}` : track.position}
                        </span>
                      )}
                    </div>

                    {/* Track Info */}
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-track-title font-medium truncate ${
                        currentlyPlaying === track.position 
                          ? 'text-accent-primary' 
                          : 'text-text-primary group-hover:text-accent-primary'
                      } transition-colors`}>
                        {track.title}
                      </h4>
                      
                      {track.artists && track.artists.length > 0 && (
                        <div className="flex items-center gap-1 mt-1">
                          <User className="w-3 h-3 text-text-muted" />
                          <div className="flex flex-wrap gap-1">
                            {track.artists.map((artist, idx) => (
                              <React.Fragment key={artist}>
                                <button
                                  onClick={() => onArtistClick?.(artist)}
                                  className="text-metadata text-text-secondary hover:text-accent-primary transition-colors"
                                >
                                  {artist}
                                </button>
                                {idx < track.artists!.length - 1 && (
                                  <span className="text-metadata text-text-secondary">, </span>
                                )}
                              </React.Fragment>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Duration */}
                    {track.duration && (
                      <div className="flex items-center gap-1 text-metadata text-text-secondary font-mono">
                        <Clock className="w-4 h-4" />
                        {formatDuration(track.duration)}
                      </div>
                    )}

                    {/* Expand Button */}
                    {track.credits && track.credits.length > 0 && (
                      <button
                        onClick={() => setExpandedTrack(
                          expandedTrack === track.position ? null : track.position
                        )}
                        className="p-2 rounded-lg hover:bg-white/10 transition-colors"
                      >
                        <MoreHorizontal className={`w-4 h-4 text-themed-muted transition-transform ${
                          expandedTrack === track.position ? 'rotate-90' : ''
                        }`} />
                      </button>
                    )}
                  </div>

                  {/* Expanded Credits */}
                  {expandedTrack === track.position && track.credits && (
                    <div className="ml-12 mr-4 mt-2 p-4 bg-themed-deep/50 rounded-lg border border-themed-subtle">
                      <h5 className="text-body font-medium text-text-primary mb-3">Track Credits</h5>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {track.credits.map((credit, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-accent-primary/50" />
                            <div className="flex-1 min-w-0">
                              <span className="text-body font-medium text-text-primary">
                                {credit.name}
                              </span>
                              <span className="text-metadata text-text-secondary ml-2">
                                {credit.role}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Disc Summary */}
            {hasMultipleDiscs && (
              <div className="mt-4 pt-4 border-t border-themed-subtle text-center">
                <p className="text-sm text-themed-muted">
                  {discTracks.length} tracks
                  {discTracks.some(t => t.duration) && (
                    <span className="ml-2">
                      • Total: {discTracks
                        .filter(t => t.duration)
                        .reduce((total, track) => {
                          const duration = track.duration!;
                          if (duration.includes(':')) {
                            const [mins, secs] = duration.split(':').map(Number);
                            return total + mins * 60 + secs;
                          }
                          return total + parseInt(duration);
                        }, 0) / 60 | 0} minutes
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        ))}
    </div>
  );
};

export default TrackListing;