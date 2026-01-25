import React from 'react';
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

interface SimpleMusicViewProps {
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const SimpleMusicView: React.FC<SimpleMusicViewProps> = ({ className = '', nowPlaying }) => {
  console.log('SimpleMusicView: Rendering with nowPlaying:', nowPlaying);

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Simple Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-900">Music Explorer</h1>
        <p className="text-gray-600">Simple view - showing current playback information</p>
      </div>

      {/* Simple Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {nowPlaying?.artist ? (
            <div className="bg-white rounded-lg p-8 shadow-sm">
              <div className="flex items-center gap-6">
                {nowPlaying.artworkUrl ? (
                  <img 
                    src={nowPlaying.artworkUrl} 
                    alt={nowPlaying.album}
                    className="w-32 h-32 rounded-lg object-cover shadow-md"
                  />
                ) : (
                  <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                    <User className="w-12 h-12 text-gray-400" />
                  </div>
                )}
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Now Playing</h2>
                  <p className="text-xl font-semibold text-blue-700 mb-1">{nowPlaying.track}</p>
                  <p className="text-lg text-gray-700 mb-1">by {nowPlaying.artist}</p>
                  {nowPlaying.album && (
                    <p className="text-gray-600">from {nowPlaying.album}</p>
                  )}
                  
                  <div className="mt-4 p-4 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800">
                      This is a simplified view of the Music Explorer. 
                      The full navigation system is being developed.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-16">
              <Music className="w-20 h-20 text-gray-300 mx-auto mb-6" />
              <h3 className="text-xl font-medium text-gray-900 mb-3">No Music Playing</h3>
              <p className="text-gray-500">
                Start playing music to see artist and track information here.
              </p>
            </div>
          )}
          
          <div className="mt-8 text-center">
            <Home className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Music Explorer</h3>
            <p className="text-gray-500">
              Full navigation and artist information features coming soon.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};