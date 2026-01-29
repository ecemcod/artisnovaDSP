import React from 'react';
import PlaybackFooter from './PlaybackFooter';

interface Props {
    children: React.ReactNode;
    nowPlaying: any;
    isRunning: boolean;
    onTransport: (action: 'playpause' | 'next' | 'prev') => void;
    onBackToPlayback: () => void;
    title: string;
    resolvedArtworkUrl?: string | null;
    onArtworkClick?: () => void;
}

const StandaloneLayout: React.FC<Props> = ({
    children,
    nowPlaying,
    isRunning,
    onTransport,
    onBackToPlayback,
    title,
    resolvedArtworkUrl,
    onArtworkClick
}) => {
    return (
        <div className="h-[100dvh] w-full flex flex-col bg-black overflow-hidden relative">
            {/* Background Artwork Blur - Exactly like VisualizationPage */}
            <div className="absolute inset-0 z-0">
                {resolvedArtworkUrl && (
                    <img
                        src={resolvedArtworkUrl}
                        alt=""
                        className="w-full h-full object-cover filter blur-[60px] scale-110 opacity-20 saturate-100 will-change-transform"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
            </div>

            {/* Title Tag - Right side or top center */}
            <div className="absolute top-8 right-8 z-[60] text-[10px] font-black uppercase tracking-[0.4em] text-white/20 select-none">
                {title}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 w-full relative z-20 overflow-hidden flex flex-col pt-[20px] min-h-0">
                {children}
            </div>

            {/* Footer Section - SHARED Component for consistency */}
            <PlaybackFooter
                nowPlaying={nowPlaying}
                isRunning={isRunning}
                onTransport={onTransport}
                onBackToPlayback={onBackToPlayback}
                onArtworkClick={onArtworkClick}
                resolvedArtworkUrl={resolvedArtworkUrl}
            />
        </div>
    );
};

export default StandaloneLayout;
