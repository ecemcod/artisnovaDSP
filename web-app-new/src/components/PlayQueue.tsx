import React from 'react';
import { ListMusic, Music2 } from 'lucide-react';

interface QueueItem {
    track: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
}

interface Props {
    queue: QueueItem[];
}

const PlayQueue: React.FC<Props> = ({ queue }) => {
    return (
        <div className="flex-1 w-full h-full bg-[#12101a] border border-[#28203a] rounded-2xl flex flex-col shadow-2xl overflow-hidden group">
            {/* Header */}
            <div className="p-4 bg-white/5 border-b border-[#28203a] flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-[#7b68ee]/10 rounded-lg text-[#7b68ee]">
                        <ListMusic size={16} />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-[#606080] uppercase tracking-[0.2em]">Up Next</h3>
                        <p className="text-[9px] text-[#404060] font-bold uppercase">{queue.length} Tracks</p>
                    </div>
                </div>
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {queue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-[#404060] gap-2 opacity-50">
                        <Music2 size={32} strokeWidth={1} />
                        <p className="text-[10px] font-bold uppercase tracking-wider">Queue is empty</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {queue.map((item, i) => (
                            <div
                                key={i}
                                className="p-2 rounded-xl hover:bg-white/5 transition-all border border-transparent hover:border-white/5 group/item flex items-center gap-3"
                            >
                                <div className="text-[9px] font-mono text-[#404060] w-4 text-center">{i + 1}</div>

                                {/* Small Artwork */}
                                <div className="w-10 h-10 rounded-lg bg-[#1a1a28] border border-[#2a2a3e] overflow-hidden flex-shrink-0 shadow-lg group-hover/item:border-[#7b68ee]/30 transition-colors">
                                    {item.artworkUrl ? (
                                        <img src={item.artworkUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-[#2a2a3e]">
                                            <Music2 size={16} strokeWidth={1.5} />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-bold text-white/90 truncate group-hover/item:text-[#7b68ee] transition-colors">
                                        {item.track}
                                    </h4>
                                    <p className="text-[10px] text-[#00d4ff] font-medium truncate opacity-80">
                                        {item.artist}
                                    </p>
                                    {item.album && (
                                        <p className="text-[8px] text-[#404060] font-bold truncate uppercase tracking-tighter">
                                            {item.album}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-3 bg-[#12101a]/50 border-t border-[#28203a] text-[9px] text-[#404060] font-bold text-center italic">
                FROM MUSIC APP PLAYLIST
            </div>
        </div>
    );
};

export default PlayQueue;
