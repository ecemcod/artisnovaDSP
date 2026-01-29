import React from 'react';
import VUMeter from './VUMeter';
import { type Skin } from './SkinSelector';
import RTA, { type RTASkin } from './RTA';
import { AppStorage } from '../utils/storage';
import { Gauge, Activity, Palette } from 'lucide-react';

import PlaybackFooter from './PlaybackFooter';


interface Props {
    isRunning: boolean;
    wsUrl?: string;
    nowPlaying: any;
    resolvedArtworkUrl?: string | null;
    dynamicColor?: string | null;
    onTransport: (action: 'playpause' | 'next' | 'prev') => void;
    onBackToPlayback?: () => void;
    onArtworkClick?: () => void;
}

const VisualizationPage: React.FC<Props> = ({ isRunning, wsUrl, nowPlaying, resolvedArtworkUrl, dynamicColor, onTransport, onBackToPlayback, onArtworkClick }) => {
    const [mode, setMode] = React.useState<'vu' | 'rta'>(() => {
        const params = new URLSearchParams(window.location.search);
        const urlVizMode = params.get('vizMode') as 'vu' | 'rta';
        if (urlVizMode && ['vu', 'rta'].includes(urlVizMode)) {
            return urlVizMode;
        }
        return (AppStorage.getItem('artisNovaDSP_viz_mode') as 'vu' | 'rta') || 'vu';
    });
    const [skin, setSkin] = React.useState<Skin>(() => {
        return (AppStorage.getItem('artisNovaDSP_viz_skin') as Skin) || 'modern';
    });
    const [rtaSkin, setRtaSkin] = React.useState<RTASkin>(() => {
        return (AppStorage.getItem('artisNovaDSP_viz_rta_skin') as RTASkin) || 'blue';
    });
    const [isAsymmetric, setIsAsymmetric] = React.useState(() => {
        return AppStorage.getItem('artisNovaDSP_viz_stereo') === 'true';
    });
    const [isFrozen, setIsFrozen] = React.useState(false);

    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (!params.get('vizMode')) {
            AppStorage.setItem('artisNovaDSP_viz_mode', mode);
        }
        AppStorage.setItem('artisNovaDSP_viz_skin', skin);
        AppStorage.setItem('artisNovaDSP_viz_rta_skin', rtaSkin);
        AppStorage.setItem('artisNovaDSP_viz_stereo', isAsymmetric.toString());
    }, [mode, skin, rtaSkin, isAsymmetric]);

    return (
        <div className="relative h-[100dvh] w-full bg-black flex flex-col items-center overflow-hidden">
            {/* Background Artwork Blur */}
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

            {/* Mode & Skin Controls Container */}
            <div className="w-full px-4 pt-[60px] flex flex-col items-center gap-4 z-50">
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
                                <option value="waves" className="bg-[#121212]">Vintage Waves</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                <Palette size={10} className="" />
                            </div>
                        </div>
                    </div>
                )}

                {/* RTA Configuration (Skin + Stereo Toggle) */}
                {mode === 'rta' && (
                    <div className="flex items-center gap-3 scale-100 md:scale-95">
                        <div className="relative w-[180px]">
                            <select
                                value={rtaSkin}
                                onChange={(e) => setRtaSkin(e.target.value as RTASkin)}
                                className="w-full appearance-none bg-white/5 hover:bg-white/10 backdrop-blur-xl text-white font-bold border border-white/10 hover:border-accent-primary/30 rounded-lg px-6 py-2.5 text-[9px] uppercase tracking-[0.25em] outline-none cursor-pointer transition-all text-center shadow-lg"
                            >
                                <option value="dynamic" className="bg-[#121212]">Dynamic (Album Art)</option>
                                <option value="blue" className="bg-[#121212]">Indigo Blue</option>
                                <option value="red" className="bg-[#121212]">Crimson Red</option>
                                <option value="traffic" className="bg-[#121212]">Traffic Light</option>
                                <option value="soft" className="bg-[#121212]">Soft Lavender</option>
                                <option value="neon" className="bg-[#121212]">Neon High-Vis</option>
                                <option value="sunset" className="bg-[#121212]">Sunset Glow</option>
                                <option value="forest" className="bg-[#121212]">Forest Green</option>
                                <option value="ocean" className="bg-[#121212]">Deep Ocean</option>
                                <option value="gold" className="bg-[#121212]">Golden Hour</option>
                                <option value="cyber" className="bg-[#121212]">Cyberpunk</option>
                            </select>
                            <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40">
                                <Palette size={10} />
                            </div>
                        </div>

                        <button
                            onClick={() => setIsAsymmetric(!isAsymmetric)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-300 font-bold text-[9px] uppercase tracking-[0.25em] ${isAsymmetric ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'}`}
                        >
                            Stereo
                        </button>

                        <button
                            onClick={() => setIsFrozen(!isFrozen)}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all duration-300 font-bold text-[9px] uppercase tracking-[0.25em] ${isFrozen ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30 shadow-[0_0_20px_rgba(34,211,238,0.2)]' : 'bg-white/5 text-white/40 border-white/10 hover:border-white/20'}`}
                        >
                            <div className={`w-1.5 h-1.5 rounded-full ${isFrozen ? 'bg-accent-primary animate-pulse' : 'bg-white/40'}`} />
                            {isFrozen ? 'Resume' : 'Freeze'}
                        </button>
                    </div>
                )}
            </div>

            {/* Main Content Area - Visualizer */}
            <div className="flex-1 w-full flex items-center justify-center p-4 md:p-6 relative z-20 min-h-0 bg-black/40 overflow-visible">
                <div className="w-full h-full max-w-7xl max-h-[55vh] flex items-center justify-center overflow-visible">
                    {mode === 'vu' ? (
                        <VUMeter isRunning={isRunning} wsUrl={wsUrl || ''} skin={skin} customColor={dynamicColor} className="w-full h-full" />
                    ) : (
                        <RTA isRunning={isRunning} wsUrl={wsUrl || ''} skin={rtaSkin} isAsymmetric={isAsymmetric} isFrozen={isFrozen} customColor={dynamicColor} />
                    )}
                </div>
            </div>

            {/* Footer Section (Information & Transport) */}
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

export default VisualizationPage;
