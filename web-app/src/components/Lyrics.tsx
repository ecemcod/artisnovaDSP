import { useEffect, useRef } from 'react';

interface Props {
    lyrics: string | null;
    trackInfo?: {
        track: string;
        artist: string;
    };
}

const Lyrics: React.FC<Props> = ({ lyrics, trackInfo }) => {
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Reset scroll when track changes
        if (scrollRef.current) {
            scrollRef.current.scrollTop = 0;
        }
    }, [trackInfo?.track]);

    // if (!lyrics) return null; // Logic moved inside render

    return (

        <div className="flex-1 min-w-0 min-h-0 bg-themed-panel border border-themed-medium rounded-xl overflow-hidden shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-500">
            <div className="p-4 bg-white/5 border-b border-themed-subtle flex items-center justify-between">
                <span className="text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] header-text">Lyrics</span>
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--glow-cyan)]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-accent-primary opacity-20" />
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-6 md:px-32 py-12 custom-scrollbar relative"
            >

                {!lyrics || lyrics === "[INSTRUMENTAL]" ? (
                    <div className="h-full flex flex-col items-center justify-center -mt-12 text-center opacity-60">
                        <div className="text-6xl mb-6 text-themed-muted font-thin select-none" style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.1))' }}>♪</div>
                        <h2 className="text-xl font-black uppercase tracking-[0.2em] mb-3 text-themed-primary">
                            {lyrics === "[INSTRUMENTAL]" ? 'Instrumental' : 'No Lyrics Found'}
                        </h2>
                        <p className="text-[11px] font-bold text-themed-muted uppercase tracking-widest max-w-[200px] leading-relaxed">
                            {lyrics === "[INSTRUMENTAL]" ? 'Music without words' : 'Either this track is instrumental or lyrics are not available.'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-themed-panel to-transparent pointer-events-none z-10" />

                        <div className="space-y-1">
                            {lyrics.split('\n').map((line, i) => (
                                <p
                                    key={i}
                                    className={`text-xl md:text-3xl font-black leading-none transition-all duration-300 text-center tracking-tight ${line.trim() ? 'text-themed-primary/60 hover:text-themed-primary hover:scale-105' : 'h-4'
                                        }`}
                                >
                                    {line}
                                </p>
                            ))}
                        </div>

                        <div className="h-24" /> {/* Spacer at bottom */}
                        <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-themed-panel to-transparent pointer-events-none z-10" />
                    </>
                )}
            </div>

            <div className="p-4 bg-themed-deep/50 border-t border-themed-subtle text-[9px] text-themed-muted font-black text-center uppercase tracking-widest">
                Enhanced via Qobuz + LrcLib
            </div>
        </div>
    );
};

export default Lyrics;
