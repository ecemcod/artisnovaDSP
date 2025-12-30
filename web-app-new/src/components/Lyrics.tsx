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

    if (!lyrics) return null;

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
                {lyrics === "[INSTRUMENTAL]" ? (
                    <div className="h-full flex flex-col items-center justify-center -mt-12 text-center opacity-60">
                        <div className="text-6xl mb-6">♪</div>
                        <h2 className="text-2xl font-black uppercase tracking-widest mb-2 text-themed-primary">Instrumental</h2>
                        <p className="text-sm font-medium text-themed-muted">Music without words</p>
                    </div>
                ) : (
                    <>
                        <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-themed-panel to-transparent pointer-events-none z-10" />

                        <div className="space-y-10">
                            {lyrics.split('\n').map((line, i) => (
                                <p
                                    key={i}
                                    className={`text-xl md:text-3xl font-black leading-tight transition-all duration-300 text-center tracking-tight ${line.trim() ? 'text-themed-primary/60 hover:text-themed-primary hover:scale-105' : 'h-8'
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
                Synced via LrcLib
            </div>
        </div>
    );
};

export default Lyrics;
