import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, ChevronUp, Music } from 'lucide-react';

interface Props {
    nowPlaying: any;
    isRunning: boolean;
    onTransport: (action: 'playpause' | 'next' | 'prev') => void;
    onBackToPlayback?: () => void;
    onArtworkClick?: () => void;
    resolvedArtworkUrl?: string | null;
}

const PlaybackFooter: React.FC<Props> = ({ nowPlaying, isRunning, onTransport, onBackToPlayback, onArtworkClick, resolvedArtworkUrl }) => {
    const [imageError, setImageError] = useState(false);
    const [showArtwork, setShowArtwork] = useState(window.innerWidth >= 640);

    useEffect(() => {
        setImageError(false);
    }, [resolvedArtworkUrl]);

    useEffect(() => {
        const handleResize = () => setShowArtwork(window.innerWidth >= 640);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    return (
        <div className="w-full py-3 px-4 bg-black/80 backdrop-blur-xl border-t border-white/5 relative z-40 shadow-[0_-30px_60px_rgba(0,0,0,0.5)]">
            {/* RESTORED: Back Button for navigation convenience */}
            {onBackToPlayback && (
                <button
                    onClick={onBackToPlayback}
                    className="p-2 transition-all active:scale-95 z-[100]"
                    style={{
                        position: 'absolute',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        left: '1.5rem',
                        color: '#ffffff',
                        backgroundColor: 'transparent',
                        border: 'none',
                        outline: 'none'
                    }}
                    title="Back to Playback"
                >
                    <ChevronUp size={24} strokeWidth={3} stroke="#ffffff" />
                </button>
            )}

            {/* Relocated Artwork - Refined 72px size for compact mode */}
            {showArtwork && (
                <div
                    className="absolute flex items-center justify-center pointer-events-none top-1/2 -translate-y-1/2"
                    style={{
                        left: '8rem',
                        width: '144px',
                        height: '144px',
                        zIndex: 150 // Increased to be above transport info
                    }}
                >
                    {resolvedArtworkUrl && !imageError ? (
                        <div
                            onClick={() => {
                                console.log('UI: Panel Artwork clicked. onArtworkClick available:', !!onArtworkClick);
                                if (onArtworkClick) onArtworkClick();
                            }}
                            className="relative group/footer-art shadow-xl pointer-events-auto cursor-pointer border-none bg-transparent p-0 overflow-visible transition-transform active:scale-95 outline-none ring-0 appearance-none touch-manipulation"
                            role="button"
                            tabIndex={0}
                            style={{
                                width: '144px',
                                height: '144px',
                                WebkitTapHighlightColor: 'transparent',
                                outline: 'none',
                                boxShadow: 'none'
                            }}
                            title="Back to Playback"
                        >
                            <div className="absolute inset-0 bg-accent-primary/20 rounded-xl blur-xl opacity-0 group-hover/footer-art:opacity-40 transition-opacity" />
                            <img
                                src={resolvedArtworkUrl}
                                alt="Album Art"
                                className="object-cover rounded-xl relative z-10 block"
                                style={{
                                    width: '144px',
                                    height: '144px',
                                    minWidth: '144px',
                                    minHeight: '144px',
                                    maxWidth: '144px',
                                    maxHeight: '144px'
                                }}
                                loading="eager"
                                onError={() => {
                                    console.warn('Footer artwork load failed');
                                    setImageError(true);
                                }}
                            />

                        </div>
                    ) : (
                        <div
                            onClick={() => {
                                console.log('UI: Fallback Panel Artwork clicked. onArtworkClick available:', !!onArtworkClick);
                                if (onArtworkClick) onArtworkClick();
                            }}
                            className="bg-white/5 rounded-xl flex items-center justify-center shadow-lg pointer-events-auto cursor-pointer hover:bg-white/10 transition-all outline-none ring-0 appearance-none touch-manipulation"
                            role="button"
                            tabIndex={0}
                            style={{
                                width: '144px',
                                height: '144px',
                                WebkitTapHighlightColor: 'transparent',
                                outline: 'none',
                                boxShadow: 'none'
                            }}
                        >
                            <Music size={24} className="text-white/20" />
                        </div>
                    )}
                </div>
            )}

            {/* Track Info & Transport - Centered Container */}
            <div className="flex flex-col items-center justify-center text-center w-full max-w-4xl mx-auto px-4 pointer-events-none">
                <div className="pointer-events-auto flex flex-col items-center">
                    <div className="text-[9px] font-black text-accent-primary uppercase tracking-[0.3em] mb-0.5 opacity-70">Now Playing</div>

                    <h2 className="text-xl md:text-2xl font-bold text-white leading-tight line-clamp-1 drop-shadow-lg mb-0.5">
                        {nowPlaying.track || 'Not Playing'}
                    </h2>

                    <p className="text-sm md:text-base text-white/60 font-medium line-clamp-1 mb-2 max-w-[90vw]">
                        <span className="font-bold text-white/80">{nowPlaying.album || 'No Album Info'} {nowPlaying.year ? `(${nowPlaying.year})` : ''}</span> — {nowPlaying.artist || 'Not Connected'}
                    </p>

                    {/* Transport Controls */}
                    <div className="flex items-center justify-center gap-5 mb-2">
                        <button
                            onClick={() => onTransport('prev')}
                            className="rounded-full p-1.5 hover:opacity-80 transition-all active:scale-95"
                            style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                        >
                            <SkipBack size={18} fill="currentColor" />
                        </button>
                        <button
                            onClick={() => onTransport('playpause')}
                            className="rounded-full p-2 hover:opacity-80 hover:scale-105 active:scale-95 transition-all"
                            style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                        >
                            {nowPlaying.state === 'playing' ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" />}
                        </button>
                        <button
                            onClick={() => onTransport('next')}
                            className="rounded-full p-1.5 hover:opacity-80 transition-all active:scale-95"
                            style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                        >
                            <SkipForward size={18} fill="currentColor" />
                        </button>
                    </div>

                    {/* Metadata badges */}
                    <div className="flex flex-col items-center justify-center gap-2">
                        {nowPlaying.style && (
                            <div className="animate-in fade-in slide-in-from-top-1 duration-500">
                                <span className="inline-block px-10 py-1.5 rounded-full bg-white/10 text-white/80 text-[10px] font-black uppercase border border-white/20 shadow-xl backdrop-blur-md">
                                    {nowPlaying.style}
                                </span>
                            </div>
                        )}
                        <div className="text-[10px] font-black tracking-[0.3em] leading-none select-none py-2 text-center uppercase" style={{ color: '#9b59b6' }}>
                            {isRunning ? (nowPlaying.sampleRate ? `${(nowPlaying.sampleRate / 1000).toFixed(1)} kHz — ${nowPlaying.bitDepth} bits` : '96.0 kHz — 24 bits') : 'Direct Mode'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlaybackFooter;
