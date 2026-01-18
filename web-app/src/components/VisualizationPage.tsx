import React, { useState } from 'react';
import axios from 'axios';
import VUMeter from './VUMeter';
import { type Skin } from './SkinSelector';
import RTA from './RTA';
import { Gauge, Activity, Play, Pause, SkipBack, SkipForward } from 'lucide-react';

const API_Base = window.location.protocol + '//' + window.location.hostname + ':3000/api';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    nowPlaying: any;
    resolvedArtworkUrl?: string | null;
}



const VisualizationPage: React.FC<Props> = ({ isRunning, wsUrl, nowPlaying, resolvedArtworkUrl }) => {
    const [mode, setMode] = useState<'vu' | 'rta'>('vu');
    const [skin, setSkin] = useState<Skin>('modern');

    // Restoration of detailed info display
    const renderTrackInfo = () => {
        if (!nowPlaying || !nowPlaying.track) return null;

        return (
            <div className="flex flex-col items-center text-center w-full max-w-4xl px-4 pointer-events-auto">
                <div className="text-[10px] font-black text-accent-primary uppercase tracking-[0.4em] mb-4 opacity-70">Now Playing</div>

                <h2 className="text-3xl md:text-5xl font-bold text-white leading-tight line-clamp-2 drop-shadow-lg mb-3">
                    {nowPlaying.track}
                </h2>

                <p className="text-lg md:text-2xl text-white/60 font-medium line-clamp-1 mb-8 max-w-[90vw]">
                    <span className="font-bold text-white/80">{nowPlaying.album || 'No Album Info'}</span> — {nowPlaying.artist || 'Not Connected'}
                </p>

                {/* Transport Controls - EXACT Match with App.tsx */}
                <div className="flex items-center justify-center gap-6 mb-10">
                    <button
                        onClick={() => handleTransport('prev')}
                        className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                        style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                    >
                        <SkipBack size={20} fill="currentColor" />
                    </button>
                    <button
                        onClick={() => handleTransport('playpause')}
                        className="rounded-full p-3 hover:opacity-80 hover:scale-105 active:scale-95 transition-all shadow-xl"
                        style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                    >
                        {nowPlaying.state === 'playing' ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                    </button>
                    <button
                        onClick={() => handleTransport('next')}
                        className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                        style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                    >
                        <SkipForward size={20} fill="currentColor" />
                    </button>
                </div>

                {/* Metadata badges - Matching Now Playing screen style */}
                <div className="flex flex-col items-center justify-center gap-4">
                    {nowPlaying.style && (
                        <div className="animate-in fade-in slide-in-from-top-1 duration-500">
                            <span className="inline-block px-10 py-1.5 rounded-full bg-white text-black text-[10px] font-black uppercase border border-white/20 shadow-xl backdrop-blur-md">
                                {nowPlaying.style}
                            </span>
                        </div>
                    )}
                    <div className="text-[10px] font-black tracking-[0.3em] leading-none select-none py-2 text-center uppercase" style={{ color: '#9b59b6' }}>
                        {isRunning ? '96.0 kHz — 24 bits' : 'Direct Mode'}
                    </div>
                </div>
            </div>
        );
    };

    const handleTransport = async (action: 'playpause' | 'next' | 'prev') => {
        try {
            await axios.post(`${API_Base}/media/${action}?source=roon`); // Default to Roon as per use case
        } catch (e) {
            console.error('Transport failed', e);
        }
    };

    return (
        <div
            className="relative h-screen w-full bg-black flex flex-col items-center overflow-hidden"
            style={{ paddingTop: '60px', paddingBottom: 'env(safe-area-inset-bottom)' }}
        >
            {/* Background Artwork Blur */}
            <div className="absolute inset-0 z-0">
                {resolvedArtworkUrl && (
                    <img
                        src={resolvedArtworkUrl}
                        alt=""
                        className="w-full h-full object-cover filter blur-[120px] scale-125 opacity-20 saturate-[1.2]"
                    />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black" />
            </div>

            {/* Mode & Skin Controls Container */}
            <div className="w-full px-4 flex flex-col items-center gap-4 z-50">
                {/* Mode Switcher */}
                <div className="bg-black/80 backdrop-blur-2xl rounded-xl p-1 border border-white/5 flex gap-1 shadow-2xl scale-100 md:scale-90">
                    <button
                        onClick={() => setMode('vu')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg transition-all duration-300 font-bold text-[9px] uppercase tracking-[0.25em] ${mode === 'vu' ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    >
                        <Gauge size={14} fill={mode === 'vu' ? 'currentColor' : 'none'} />
                        VU Meter
                    </button>
                    <button
                        onClick={() => setMode('rta')}
                        className={`flex items-center gap-2 px-5 py-2 rounded-lg transition-all duration-300 font-bold text-[9px] uppercase tracking-[0.25em] ${mode === 'rta' ? 'bg-accent-primary/20 text-accent-primary border border-accent-primary/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    >
                        <Activity size={14} fill={mode === 'rta' ? 'currentColor' : 'none'} />
                        RTA
                    </button>
                </div>

                {/* Skin Dropdown - Centered below switcher, only in VU mode */}
                {mode === 'vu' && (
                    <div className="relative w-full max-w-[180px] scale-100 md:scale-95">
                        <div className="relative">
                            <select
                                value={skin}
                                onChange={(e) => setSkin(e.target.value as Skin)}
                                className="w-full appearance-none bg-white/5 hover:bg-white/10 backdrop-blur-xl text-white font-bold border border-white/10 hover:border-accent-primary/30 rounded-lg px-6 py-2.5 text-[9px] uppercase tracking-[0.25em] outline-none cursor-pointer transition-all text-center shadow-lg"
                            >
                                <option value="modern" className="bg-[#121212]">Modern Cyan</option>
                                <option value="classic" className="bg-[#121212]">Classic Analog</option>
                                <option value="dark" className="bg-[#121212]">Neon Night</option>
                                <option value="minimal" className="bg-[#121212]">Clean Minimal</option>
                                <option value="retro" className="bg-[#121212]">Retro Paper</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                <Activity size={10} className="rotate-90" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Area - Visualizer */}
            <div className="flex-1 w-full flex items-center justify-center p-4 md:p-8 relative z-20 min-h-0">
                <div className="w-full h-full max-w-7xl max-h-[70vh] flex items-center justify-center">
                    {mode === 'vu' ? (
                        <VUMeter isRunning={isRunning} wsUrl={wsUrl} skin={skin} className="w-full h-full" />
                    ) : (
                        <RTA isRunning={isRunning} wsUrl={wsUrl} />
                    )}
                </div>
            </div>

            {/* Footer Section (Information & Transport) */}
            <div className="w-full pb-20 pt-8 px-4 flex flex-col items-center justify-center bg-gradient-to-t from-black via-black/80 to-transparent relative z-30">
                {renderTrackInfo()}
                <div className="h-2 w-24 bg-white/5 rounded-full mt-12 opacity-10" />
            </div>
        </div>
    );
};

export default VisualizationPage;
