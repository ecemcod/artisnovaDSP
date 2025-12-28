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
        <div className="flex-1 min-w-0 min-h-0 bg-[#12101a] border border-[#28203a] rounded-2xl overflow-hidden shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-500 mx-2 my-3">
            <div className="p-4 bg-white/5 border-b border-[#1f1f2e] flex items-center justify-between">
                <span className="text-[10px] text-[#606080] font-black uppercase tracking-[0.2em]">Live Lyrics</span>
                <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] opacity-50" />
                </div>
            </div>

            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto px-8 md:px-64 py-12 custom-scrollbar relative"
            >
                <div className="absolute top-0 left-0 w-full h-16 bg-gradient-to-b from-[#12101a] to-transparent pointer-events-none z-10" />

                <div className="space-y-6">
                    {lyrics.split('\n').map((line, i) => (
                        <p
                            key={i}
                            className={`text-xl md:text-3xl font-medium leading-loose transition-all duration-300 text-center ${line.trim() ? 'text-white/80 hover:text-white' : 'h-6'
                                }`}
                        >
                            {line}
                        </p>
                    ))}
                </div>

                <div className="h-24" /> {/* Spacer at bottom */}
                <div className="absolute bottom-0 left-0 w-full h-20 bg-gradient-to-t from-[#12101a] to-transparent pointer-events-none z-10" />
            </div>

            <div className="p-4 bg-[#12121a]/50 border-t border-[#1f1f2e] text-[9px] text-[#404060] font-bold text-center italic">
                LrcLib • v1.2.6-LYRICS
            </div>
        </div>
    );
};

export default Lyrics;
