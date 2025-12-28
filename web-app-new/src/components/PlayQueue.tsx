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
        <div className="flex-1 w-full h-full bg-themed-panel border border-themed-medium rounded-xl flex flex-col shadow-2xl overflow-hidden group">
            {/* Header */}
            <div className="p-4 bg-white/5 border-b border-themed-subtle flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-accent-primary/10 rounded-lg text-accent-primary">
                        <ListMusic size={16} style={{ color: '#ffffff' }} />
                    </div>
                    <div>
                        <h3 className="text-[10px] font-black text-themed-muted uppercase tracking-[0.2em] header-text">Up Next</h3>
                        <p className="text-[9px] text-themed-muted font-black uppercase opacity-60">{queue.length} Tracks</p>
                    </div>
                </div>
            </div>

            {/* Queue List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
                {queue.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-themed-muted/30 gap-2">
                        <Music2 size={32} strokeWidth={1} style={{ color: '#ffffff' }} />
                        <p className="text-[10px] font-black uppercase tracking-widest">Queue empty</p>
                    </div>
                ) : (
                    <div className="space-y-1">
                        {queue.map((item, i) => (
                            <div
                                key={i}
                                className="p-2 rounded-lg hover:bg-white/5 transition-all border border-transparent hover:border-themed-subtle group/item flex items-center gap-3"
                            >
                                <div className="text-[9px] font-mono text-themed-muted/50 w-4 text-center">{i + 1}</div>

                                {/* Small Artwork */}
                                <div className="w-10 h-10 rounded-lg bg-themed-deep border border-themed-medium overflow-hidden flex-shrink-0 shadow-lg group-hover/item:border-accent-primary/30 transition-colors">
                                    {item.artworkUrl ? (
                                        <img src={item.artworkUrl} alt="" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-themed-muted/20">
                                            <Music2 size={16} strokeWidth={1.5} style={{ color: '#ffffff' }} />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0">
                                    <h4 className="text-xs font-black text-themed-primary/90 truncate group-hover/item:text-accent-primary transition-colors">
                                        {item.track}
                                    </h4>
                                    <p className="text-[10px] text-accent-primary font-black truncate opacity-80 uppercase tracking-tight">
                                        {item.artist}
                                    </p>
                                    {item.album && (
                                        <p className="text-[8px] text-themed-muted font-bold truncate uppercase tracking-widest opacity-60">
                                            {item.album}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="p-3 bg-themed-deep/50 border-t border-themed-subtle text-[9px] text-themed-muted font-black text-center uppercase tracking-[0.2em]">
                Media Queue
            </div>
        </div>
    );
};

export default PlayQueue;
