import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { BookOpen, User, Disc } from 'lucide-react';

interface Props {
    artist: string;
    album: string;
}

interface ArtistData {
    name: string;
    bio: string;
    artistUrl: string | null;
    country: string;
    activeYears: string;
    tags: string;
}

interface Track {
    disc: number;
    number: number;
    title: string;
    duration: string;
}

interface Credit {
    name: string;
    role: string;
}

interface AlbumData {
    title: string;
    date: string;
    label: string;
    type: string;
    trackCount: number;
    tracklist: Track[];
    credits: Credit[];
    albumUrl: string | null;
}

interface InfoData {
    artist: ArtistData | null;
    album: AlbumData | null;
    source: string;
}

const ArtistInfo: React.FC<Props> = ({ artist, album }) => {
    const [info, setInfo] = useState<InfoData | null>(null);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<'artist' | 'album'>('artist');
    const scrollRef = useRef<HTMLDivElement>(null);

    // Track the last fetched artist/album to avoid redundant API calls
    const lastFetchedRef = useRef<{ artist: string; album: string }>({ artist: '', album: '' });

    useEffect(() => {
        let isMounted = true;

        const fetchInfo = async () => {
            if (!artist) return;

            // STABILITY FIX: Normalice strings and check if they really changed
            const normalizedArtist = artist.trim().toLowerCase();
            const normalizedAlbum = album.trim().toLowerCase();

            if (lastFetchedRef.current.artist === normalizedArtist &&
                lastFetchedRef.current.album === normalizedAlbum) {
                return;
            }

            lastFetchedRef.current = { artist: normalizedArtist, album: normalizedAlbum };
            setLoading(true);

            try {
                const res = await axios.get(`/api/media/artist-info`, {
                    params: { artist, album }
                });

                if (isMounted) {
                    setInfo(res.data);
                    if (scrollRef.current) scrollRef.current.scrollTop = 0;
                }
            } catch (err) {
                if (isMounted) {
                    console.error('Error fetching artist info:', err);
                    setInfo({
                        artist: { name: artist, bio: "No se pudo cargar la información.", artistUrl: null, country: '', activeYears: '', tags: '' },
                        album: null,
                        source: 'Local Fallback'
                    });
                }
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        const timeoutId = setTimeout(fetchInfo, 300); // Debounce fetch
        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
        };
    }, [artist, album]);

    const renderArtistTab = () => {
        if (!info?.artist) return null;
        const a = info.artist;

        return (
            <div className="space-y-10">
                <div className="flex flex-wrap items-end justify-between gap-4 mb-8">
                    <h1 className="text-4xl md:text-6xl font-black text-themed-primary leading-none tracking-tighter">
                        {a.name}
                    </h1>
                    {a.country && (
                        <span className="px-2 py-0.5 bg-accent-primary/10 text-accent-primary text-[10px] font-black uppercase tracking-widest rounded border border-accent-primary/20">
                            {a.country}
                        </span>
                    )}
                </div>

                <div className="flex flex-col gap-4 opacity-70 mb-10">
                    {a.activeYears && (
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24 flex-shrink-0">Active Years</span>
                            <span className="text-sm font-bold text-themed-primary">{a.activeYears}</span>
                        </div>
                    )}
                    {a.tags && (
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24 flex-shrink-0">Genre Tags</span>
                            <span className="text-sm font-bold text-themed-primary">{a.tags}</span>
                        </div>
                    )}
                </div>

                <div className="space-y-6">
                    {a.bio?.split('\n').filter(p => p.trim()).map((paragraph, idx) => (
                        <p key={idx} className="text-lg md:text-xl font-medium leading-relaxed text-themed-primary/95">
                            {paragraph}
                        </p>
                    ))}
                </div>

                {a.artistUrl && (
                    <div className="mt-8">
                        <a
                            href={a.artistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-themed-primary/60 transition-colors border border-themed-subtle"
                        >
                            View Artist on Wikipedia ↗
                        </a>
                    </div>
                )}
            </div>
        );
    };

    const renderAlbumTab = () => {
        if (!info?.album) {
            return (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                    <Disc size={48} className="mb-6 stroke-1" />
                    <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-themed-primary">No Album Info</h2>
                    <p className="text-[10px] font-bold text-themed-muted uppercase tracking-widest max-w-[200px]">No album data found in MusicBrainz.</p>
                </div>
            );
        }

        const alb = info.album;

        return (
            <div className="space-y-10">
                {/* Album Header */}
                <div>
                    <span className="text-[9px] text-accent-primary font-black uppercase tracking-[0.3em] block mb-2">{alb.type}</span>
                    <h1 className="text-3xl md:text-5xl font-black text-themed-primary leading-tight tracking-tight mb-4">
                        {alb.title}
                    </h1>
                    <div className="flex flex-col gap-4 opacity-70">
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Released</span>
                            <span className="text-sm font-bold text-themed-primary">{alb.date}</span>
                        </div>
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Label</span>
                            <span className="text-sm font-bold text-themed-primary">{alb.label}</span>
                        </div>
                        <div className="flex items-center gap-4 py-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Tracks</span>
                            <span className="text-sm font-bold text-themed-primary">{alb.trackCount}</span>
                        </div>
                    </div>
                </div>

                {/* Credits */}
                {alb.credits && alb.credits.length > 0 && (
                    <section>
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-themed-muted mb-4">Credits</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {alb.credits.map((credit, idx) => (
                                <div key={idx} className="p-3 bg-white/5 rounded-lg border border-themed-subtle">
                                    <div className="text-sm font-bold text-themed-primary">{credit.name}</div>
                                    <div className="text-[10px] text-themed-muted uppercase tracking-wide">{credit.role}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Tracklist */}
                {alb.tracklist && alb.tracklist.length > 0 && (
                    <section>
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-themed-muted mb-4">Tracklist ({alb.tracklist.length} tracks)</h3>
                        <div className="space-y-1">
                            {alb.tracklist.map((track, idx) => (
                                <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                                    <span className="text-[10px] text-themed-muted font-mono w-8 text-right">
                                        {alb.tracklist.some(t => t.disc > 1) ? `${track.disc}.${track.number}` : track.number}
                                    </span>
                                    <span className="flex-1 text-sm font-medium text-themed-primary truncate">{track.title}</span>
                                    <span className="text-[10px] text-themed-muted font-mono">{track.duration}</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {alb.albumUrl && (
                    <div className="mt-8">
                        <a
                            href={alb.albumUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[9px] font-black uppercase tracking-widest text-themed-primary/60 transition-colors border border-themed-subtle"
                        >
                            View Album on MusicBrainz ↗
                        </a>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="flex-1 min-w-0 min-h-0 bg-themed-panel border border-themed-medium rounded-xl overflow-hidden shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-500">
            {/* Header with Tabs */}
            <div className="p-4 bg-white/5 border-b border-themed-subtle" style={{ paddingLeft: 'var(--mobile-sidebar-gap)' }}>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-accent-primary" />
                        <span className="text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] header-text">MusicBrainz Database</span>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary shadow-[0_0_8px_var(--glow-cyan)]" />
                        <div className="w-1.5 h-1.5 rounded-full bg-accent-primary opacity-20" />
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                    <button
                        onClick={() => setActiveTab('artist')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'artist'
                            ? 'bg-white text-black shadow-lg'
                            : 'bg-white/5 text-themed-muted hover:bg-white/10'
                            }`}
                    >
                        <User size={14} />
                        Artist
                    </button>
                    <button
                        onClick={() => setActiveTab('album')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-widest transition-all ${activeTab === 'album'
                            ? 'bg-white text-black shadow-lg'
                            : 'bg-white/5 text-themed-muted hover:bg-white/10'
                            }`}
                    >
                        <Disc size={14} />
                        Album
                    </button>
                </div>
            </div>

            {/* Content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-10 custom-scrollbar relative scroll-smooth"
            >
                <div className="px-8 md:px-24 lg:px-32 max-w-6xl mx-auto" style={{ paddingLeft: 'calc(var(--mobile-sidebar-gap) - 2rem)' }}>
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 animate-pulse">
                                <div className="w-12 h-12 rounded-full border-2 border-accent-primary/20 border-t-accent-primary animate-spin" />
                                <div className="text-[10px] text-themed-muted font-black uppercase tracking-widest">Consulting MusicBrainz...</div>
                            </div>
                        </div>
                    ) : !info?.artist?.bio && !info?.album ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                            <BookOpen size={48} className="mb-6 stroke-1" />
                            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-themed-primary">No Info Found</h2>
                            <p className="text-[10px] font-bold text-themed-muted uppercase tracking-widest max-w-[200px]">We couldn't find information in MusicBrainz.</p>
                        </div>
                    ) : (
                        <>
                            {activeTab === 'artist' && renderArtistTab()}
                            {activeTab === 'album' && renderAlbumTab()}
                            <div className="h-24" />
                        </>
                    )}
                </div>
            </div>

            <div className="p-4 bg-themed-deep/50 border-t border-themed-subtle text-[9px] text-themed-muted font-black text-center uppercase tracking-widest">
                Data provided by {info?.source || 'MusicBrainz'}
            </div>
        </div>
    );
};

export default ArtistInfo;
