import React from 'react';
import { Home, User, ArrowLeft } from 'lucide-react';

interface NowPlayingInfo {
  track?: string;
  artist?: string;
  album?: string;
  artworkUrl?: string;
  state?: string;
  position?: number;
  duration?: number;
}

interface EmergencyMusicNavigationViewProps {
  className?: string;
  nowPlaying?: NowPlayingInfo;
}

export const EmergencyMusicNavigationView: React.FC<EmergencyMusicNavigationViewProps> = ({ 
  className = '', 
  nowPlaying 
}) => {
  console.log('EmergencyMusicNavigationView: Rendering emergency fallback');

  return (
    <div className={`h-full flex flex-col ${className}`}>
      {/* Emergency Header */}
      <div className="flex-shrink-0 bg-red-50 border-b border-red-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-red-800">Music Explorer - Emergency Mode</h1>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Refresh Page
          </button>
        </div>
        <p className="text-sm text-red-600 mt-2">
          The navigation system encountered an error. This is a safe fallback view.
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="space-y-8">
            {/* Emergency Notice */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="flex items-start space-x-3">
                <div className="w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center mt-0.5">
                  <span className="text-yellow-800 text-sm font-bold">!</span>
                </div>
                <div>
                  <h3 className="font-medium text-yellow-800 mb-2">Navigation System Error</h3>
                  <p className="text-sm text-yellow-700">
                    The complex navigation system encountered an error. You can still view basic information below.
                  </p>
                </div>
              </div>
            </div>

            {/* Now Playing Section */}
            {nowPlaying?.artist && (
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                <div className="flex items-center gap-4">
                  {nowPlaying.artworkUrl && (
                    <img 
                      src={nowPlaying.artworkUrl} 
                      alt={nowPlaying.album}
                      className="w-16 h-16 rounded-lg object-cover shadow-md"
                    />
                  )}
                  <div className="flex-1">
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Now Playing</h2>
                    <p className="text-lg font-semibold text-blue-700">{nowPlaying.track}</p>
                    <p className="text-gray-600">by {nowPlaying.artist}</p>
                    {nowPlaying.album && (
                      <p className="text-sm text-gray-500">from {nowPlaying.album}</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Basic Artist Info */}
            {nowPlaying?.artist && (
              <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
                <div className="flex items-center space-x-4 mb-4">
                  <User className="w-8 h-8 text-gray-400" />
                  <h2 className="text-2xl font-bold text-gray-900">{nowPlaying.artist}</h2>
                </div>
                <p className="text-gray-600 mb-4">
                  Currently playing artist. Full navigation features are temporarily unavailable.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>Note:</strong> This is a simplified view. The full Music Explorer with detailed 
                    artist information, discography, and navigation features will be restored once the 
                    technical issue is resolved.
                  </p>
                </div>
              </div>
            )}

            {/* Recovery Options */}
            <div className="bg-white rounded-lg p-6 shadow-sm border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Recovery Options</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => window.location.reload()}
                  className="flex items-center justify-center space-x-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Refresh Page</span>
                </button>
                <button
                  onClick={() => {
                    // Clear any stored navigation state
                    localStorage.removeItem('artisNovaDSP_navigationState');
                    window.location.reload();
                  }}
                  className="flex items-center justify-center space-x-2 px-4 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  <span>Reset Navigation</span>
                </button>
              </div>
            </div>

            {/* Debug Information */}
            <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Debug Information</h3>
              <div className="text-sm text-gray-600 space-y-2">
                <p><strong>Current URL:</strong> {window.location.href}</p>
                <p><strong>User Agent:</strong> {navigator.userAgent}</p>
                <p><strong>Timestamp:</strong> {new Date().toISOString()}</p>
                {nowPlaying && (
                  <div>
                    <p><strong>Now Playing Data:</strong></p>
                    <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto">
                      {JSON.stringify(nowPlaying, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};