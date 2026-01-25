import React from 'react';
import { User, Music, Mic, Headphones, Settings, Award } from 'lucide-react';

interface Credit {
  name: string;
  role: string;
  instruments?: string[];
  tracks?: number[];
}

interface AlbumCreditsProps {
  credits: Credit[];
  onPersonClick?: (personName: string) => void;
  className?: string;
}

const AlbumCredits: React.FC<AlbumCreditsProps> = ({ 
  credits, 
  onPersonClick,
  className = '' 
}) => {
  const getRoleIcon = (role: string) => {
    const lowerRole = role.toLowerCase();
    if (lowerRole.includes('vocal') || lowerRole.includes('singer')) return Mic;
    if (lowerRole.includes('producer') || lowerRole.includes('engineer')) return Settings;
    if (lowerRole.includes('mix') || lowerRole.includes('master')) return Headphones;
    if (lowerRole.includes('composer') || lowerRole.includes('writer')) return Award;
    return User;
  };

  const getRoleColor = (role: string) => {
    const lowerRole = role.toLowerCase();
    if (lowerRole.includes('vocal') || lowerRole.includes('singer')) return 'text-blue-400 bg-blue-500/20 border-blue-500/30';
    if (lowerRole.includes('producer') || lowerRole.includes('engineer')) return 'text-purple-400 bg-purple-500/20 border-purple-500/30';
    if (lowerRole.includes('mix') || lowerRole.includes('master')) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (lowerRole.includes('composer') || lowerRole.includes('writer')) return 'text-yellow-400 bg-yellow-500/20 border-yellow-500/30';
    return 'text-gray-400 bg-gray-500/20 border-gray-500/30';
  };

  // Group credits by role category
  const groupedCredits = credits.reduce((acc, credit) => {
    const category = credit.role.toLowerCase().includes('vocal') ? 'Vocals' :
                    credit.role.toLowerCase().includes('producer') || credit.role.toLowerCase().includes('engineer') ? 'Production' :
                    credit.role.toLowerCase().includes('mix') || credit.role.toLowerCase().includes('master') ? 'Mixing & Mastering' :
                    credit.role.toLowerCase().includes('composer') || credit.role.toLowerCase().includes('writer') ? 'Composition' :
                    'Performance';
    
    if (!acc[category]) acc[category] = [];
    acc[category].push(credit);
    return acc;
  }, {} as Record<string, Credit[]>);

  if (credits.length === 0) {
    return (
      <div className={`${className} text-center py-12`}>
        <User className="w-16 h-16 text-themed-muted mx-auto mb-4" />
        <h3 className="text-lg font-bold text-themed-primary mb-2">No Credits Available</h3>
        <p className="text-themed-muted">
          Credit information is not available for this album.
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="space-y-8">
        {Object.entries(groupedCredits).map(([category, categoryCredits]) => (
          <div key={category}>
            <h3 className="text-lg font-bold text-themed-primary mb-4 flex items-center gap-2">
              <Music className="w-5 h-5" />
              {category}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryCredits.map((credit, index) => {
                const IconComponent = getRoleIcon(credit.role);
                const colorClasses = getRoleColor(credit.role);
                
                return (
                  <div
                    key={`${credit.name}-${index}`}
                    onClick={() => onPersonClick?.(credit.name)}
                    className={`group p-4 rounded-lg border transition-all duration-300 ${
                      onPersonClick 
                        ? 'cursor-pointer hover:border-accent-primary/50 hover:bg-white/10' 
                        : ''
                    } bg-white/5 border-themed-subtle`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg border ${colorClasses}`}>
                        <IconComponent className="w-4 h-4" />
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-bold text-themed-primary truncate ${
                          onPersonClick ? 'group-hover:text-accent-primary' : ''
                        } transition-colors`}>
                          {credit.name}
                        </h4>
                        
                        <p className="text-sm text-themed-muted mb-2">
                          {credit.role}
                        </p>
                        
                        {/* Instruments */}
                        {credit.instruments && credit.instruments.length > 0 && (
                          <div className="mb-2">
                            <div className="flex flex-wrap gap-1">
                              {credit.instruments.slice(0, 3).map((instrument, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-1 bg-themed-deep rounded text-xs text-themed-muted"
                                >
                                  {instrument}
                                </span>
                              ))}
                              {credit.instruments.length > 3 && (
                                <span className="px-2 py-1 bg-themed-deep rounded text-xs text-themed-muted">
                                  +{credit.instruments.length - 3}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                        
                        {/* Track numbers */}
                        {credit.tracks && credit.tracks.length > 0 && (
                          <div className="text-xs text-themed-muted">
                            Tracks: {credit.tracks.length > 5 
                              ? `${credit.tracks.slice(0, 5).join(', ')}...` 
                              : credit.tracks.join(', ')
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AlbumCredits;