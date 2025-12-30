import React from 'react';
import { ListMusic, Music2 } from 'lucide-react';
import axios from 'axios';

interface QueueItem {
    id?: string;
    track: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
}

interface Props {
    queue: QueueItem[];
    mediaSource: string;
}

const API_HOST = window.location.hostname;
const API_URL = `http://${API_HOST}:3001`;

const PlayQueue: React.FC<Props> = ({ queue, mediaSource }) => {
    const handlePlayItem = async (item: QueueItem, index: number) => {
        // Roon needs ID, Apple needs Index
        if (mediaSource === 'roon' && !item.id) return;

        try {
            await axios.post(`${API_URL}/media/playqueue`, {
                id: item.id,
                source: mediaSource,
                index: index
            });
        } catch (e) {
            console.error('Failed to play queue item:', e);
        }
    };

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
                    <div className="space-y-[2px]">
                        {queue.map((item, i) => (
                            <div
                                key={i}
                                onClick={() => handlePlayItem(item, i)}
                                className={`py-1 px-2 rounded-lg transition-all border border-transparent group/item flex items-center gap-2 hover:bg-white/5 cursor-pointer hover:border-themed-subtle`}
                            >
                                <div className="text-[9px] font-mono text-themed-muted/50 w-4 text-center">{i + 1}</div>

                                {/* Small Artwork */}
                                <div
                                    className="rounded bg-themed-deep border border-themed-medium overflow-hidden flex-shrink-0 shadow-sm group-hover/item:border-accent-primary/30 transition-colors"
                                    style={{ width: 28, height: 28, minWidth: 28 }}
                                >
                                    {item.artworkUrl ? (
                                        <img
                                            src={item.artworkUrl.startsWith('http') ? item.artworkUrl : `${API_URL}${item.artworkUrl}`}
                                            alt=""
                                            className="w-full h-full object-cover"
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-themed-muted/20">
                                            <Music2 size={12} strokeWidth={1.5} style={{ color: '#ffffff' }} />
                                        </div>
                                    )}
                                </div>

                                <div className="flex-1 min-w-0 flex flex-col justify-center leading-none">
                                    <h4 className="text-[11px] font-black text-themed-primary/90 truncate group-hover/item:text-accent-primary transition-colors mb-[1px]">
                                        {item.track}
                                    </h4>
                                    <div className="flex items-center gap-1.5 opacity-80">
                                        <p className="text-[9px] text-accent-primary font-black truncate uppercase tracking-tight">
                                            {item.artist}
                                        </p>
                                        {item.album && (
                                            <>
                                                <span className="text-[8px] text-themed-muted">•</span>
                                                <p className="text-[8px] text-themed-muted font-bold truncate uppercase tracking-widest opacity-60">
                                                    {item.album}
                                                </p>
                                            </>
                                        )}
                                    </div>
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
