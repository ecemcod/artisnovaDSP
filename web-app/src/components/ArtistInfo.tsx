import React, { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import { BookOpen, User, Disc, Star, Music } from 'lucide-react';
import { ProgressiveImage } from './ProgressiveImage';

interface Props {
    artist: string;
    album?: string;
}

interface ArtistData {
    name: string;
    bio?: string;
    biography?: string;
    artistUrl: string | null;
    country?: string;
    activeYears?: string;
    tags?: string;
    image_url?: string;
    genres?: string[];
    albums_count?: number;
    qobuz_id?: number;
    source?: string;
}

interface Track {
    disc: number;
    disc_number?: number;
    number: number;
    track_number?: number;
    title: string;
    duration: string | number;
    qobuz_id?: number;
    artist_name?: string;
    artist_id?: number;
}

interface Credit {
    name?: string;
    person_name?: string;
    role: string;
}

interface AlbumData {
    title: string;
    date?: string;
    release_date?: string;
    label?: string;
    label_name?: string;
    type?: string;
    release_type?: string;
    trackCount?: number;
    track_count?: number;
    tracklist?: Track[];
    tracks?: Track[];
    credits: Credit[];
    albumUrl: string | null;
    artwork_url?: string;
    description?: string;
    qobuz_id?: string;
    source?: string;
}

interface InfoData {
    artist: ArtistData | null;
    album: AlbumData | null;
    source: string;
}

const ArtistInfo: React.FC<Props> = ({ artist, album }) => {
    const [info, setInfo] = useState<InfoData | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'artist' | 'album'>(() => {
        // Start with album tab if album is provided, otherwise artist tab
        return album ? 'album' : 'artist';
    });
    const scrollRef = useRef<HTMLDivElement>(null);

    // Track the last fetched artist/album to avoid redundant API calls
    const lastFetchedRef = useRef<{ artist: string; album: string }>({ artist: '', album: '' });

    const fetchInfo = useCallback(async () => {
        if (!artist) {
            setInfo(null);
            setError(null);
            lastFetchedRef.current = { artist: '', album: '' };
            return;
        }

        // STABILITY FIX: Normalize strings and check if they really changed
        const normalizedArtist = artist.trim().toLowerCase();
        const normalizedAlbum = (album || '').trim().toLowerCase();

        if (lastFetchedRef.current.artist === normalizedArtist &&
            lastFetchedRef.current.album === normalizedAlbum) {
            return;
        }

        lastFetchedRef.current = { artist: normalizedArtist, album: normalizedAlbum };
        setLoading(true);
        setError(null);

        try {
            // Fetch enhanced Qobuz data directly from our fixed endpoint
            const res = await axios.get(`/api/media/artist-info`, {
                params: { artist, album },
                timeout: 10000
            });

            console.log('ArtistInfo: Received data from endpoint:', res.data);
            setInfo(res.data);

            // Auto-switch to album tab if album data is available and we're currently on artist tab
            if (res.data.album && activeTab === 'artist' && album) {
                setActiveTab('album');
            }

            if (scrollRef.current) scrollRef.current.scrollTop = 0;
        } catch (err: any) {
            console.error('Error fetching artist info:', err);
            setError(err.message || 'Failed to load artist information');
            setInfo({
                artist: { name: artist, bio: "No se pudo cargar la información.", artistUrl: null, country: '', activeYears: '', tags: '' },
                album: null,
                source: 'Local Fallback'
            });
        } finally {
            setLoading(false);
        }
    }, [artist, album, activeTab]);

    useEffect(() => {
        const timeoutId = setTimeout(fetchInfo, 300); // Debounce fetch
        return () => clearTimeout(timeoutId);
    }, [fetchInfo]);

    const getSourceBadge = (source: string = '') => {
        if (source === 'qobuz' || source === 'Qobuz Enhanced') {
            return (
                <div className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 text-xs font-medium rounded-full">
                    <Star className="w-3 h-3" />
                    Qobuz Enhanced
                </div>
            );
        }
        return null;
    };

    const renderArtistTab = () => {
        // Use data from the endpoint directly
        const artistData = info?.artist;

        return (
            <div className="space-y-10">
                {/* Enhanced Artist Header with Qobuz Image */}
                <div className="flex items-start gap-6 mb-8">
                    {/* Artist Image from Qobuz */}
                    {artistData?.image_url && (
                        <div className="flex-shrink-0">
                            <ProgressiveImage
                                src={artistData.image_url}
                                alt={artistData.name}
                                className="w-32 h-32 rounded-lg object-cover shadow-lg"
                                fallbackType="artist"
                                size="medium"
                            />
                        </div>
                    )}
                    
                    <div className="flex-1">
                        <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
                            <h1 className="text-4xl md:text-6xl font-black text-themed-primary leading-none tracking-tighter">
                                {artistData?.name || artist}
                            </h1>
                            {artistData?.country && (
                                <span className="px-2 py-0.5 bg-accent-primary/10 text-accent-primary text-[10px] font-black uppercase tracking-widest rounded border border-accent-primary/20">
                                    {artistData.country}
                                </span>
                            )}
                        </div>

                        {/* Source Badge */}
                        <div className="mb-4">
                            {getSourceBadge(info?.source)}
                        </div>

                        {/* Genres */}
                        {artistData?.genres && artistData.genres.length > 0 && (
                            <div className="mb-4">
                                <div className="flex flex-wrap gap-2">
                                    {artistData.genres.map((genre: string, index: number) => (
                                        <span
                                            key={index}
                                            className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                                        >
                                            {genre}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Album Count */}
                        {artistData?.albums_count && (
                            <p className="text-sm text-themed-muted mb-4">
                                {artistData.albums_count} albums in catalog
                            </p>
                        )}
                    </div>
                </div>

                {/* Artist Info */}
                <div className="flex flex-col gap-4 opacity-70 mb-10">
                    {artistData?.activeYears && (
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24 flex-shrink-0">Active Years</span>
                            <span className="text-sm font-bold text-themed-primary">{artistData.activeYears}</span>
                        </div>
                    )}
                    {artistData?.tags && (
                        <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                            <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24 flex-shrink-0">Genre Tags</span>
                            <span className="text-sm font-bold text-themed-primary">{artistData.tags}</span>
                        </div>
                    )}
                </div>

                {/* Biography */}
                <div className="space-y-6">
                    {artistData?.biography?.split('\n').filter((p: string) => p.trim()).map((paragraph: string, idx: number) => (
                        <p key={idx} className="text-lg md:text-xl font-medium leading-relaxed text-themed-primary/95">
                            {paragraph}
                        </p>
                    ))}
                </div>

                {artistData?.artistUrl && (
                    <div className="mt-8">
                        <a
                            href={artistData.artistUrl}
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
        // Use data from the endpoint directly
        const albumData = info?.album;

        if (!albumData) {
            return (
                <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                    <Disc size={48} className="mb-6 stroke-1" />
                    <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-themed-primary">No Album Info</h2>
                    <p className="text-[10px] font-bold text-themed-muted uppercase tracking-widest max-w-[200px]">No album data found.</p>
                </div>
            );
        }

        return (
            <div className="space-y-10">
                {/* Enhanced Album Header with Qobuz Artwork */}
                <div className="flex items-start gap-6">
                    {/* Album Artwork from Qobuz */}
                    {albumData?.artwork_url && (
                        <div className="flex-shrink-0">
                            <ProgressiveImage
                                src={albumData.artwork_url}
                                alt={albumData.title}
                                className="w-32 h-32 rounded-lg object-cover shadow-lg"
                                fallbackType="album"
                                size="medium"
                            />
                        </div>
                    )}
                    
                    <div className="flex-1">
                        <span className="text-[9px] text-accent-primary font-black uppercase tracking-[0.3em] block mb-2">
                            {albumData?.release_type || 'Album'}
                        </span>
                        <h1 className="text-3xl md:text-5xl font-black text-themed-primary leading-tight tracking-tight mb-4">
                            {albumData?.title}
                        </h1>

                        {/* Source Badge */}
                        <div className="mb-4">
                            {getSourceBadge(info?.source)}
                        </div>

                        <div className="flex flex-col gap-4 opacity-70">
                            <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                                <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Released</span>
                                <span className="text-sm font-bold text-themed-primary">
                                    {albumData?.release_date ? new Date(albumData.release_date).getFullYear() : 'Unknown'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 py-2 border-b border-themed-subtle/50">
                                <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Label</span>
                                <span className="text-sm font-bold text-themed-primary">
                                    {albumData?.label_name || 'Unknown'}
                                </span>
                            </div>
                            <div className="flex items-center gap-4 py-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-themed-muted w-24">Tracks</span>
                                <span className="text-sm font-bold text-themed-primary">
                                    {albumData?.track_count || albumData?.trackCount || 0}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Album Description/Review from Qobuz (TiVo source) */}
                {albumData?.description && (
                    <section>
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-themed-muted mb-4">Album Review</h3>
                        <div className="p-4 bg-white/5 rounded-lg border border-themed-subtle">
                            <div className="text-sm text-themed-primary leading-relaxed">
                                {albumData.description.split('\n').map((paragraph: string, idx: number) => (
                                    <p key={idx} className="mb-3 last:mb-0">
                                        {paragraph}
                                    </p>
                                ))}
                            </div>
                            <div className="mt-3 pt-3 border-t border-themed-subtle/30">
                                <span className="text-[9px] text-themed-muted uppercase tracking-widest">
                                    Source: Qobuz Editorial (TiVo)
                                </span>
                            </div>
                        </div>
                    </section>
                )}

                {/* Credits */}
                {albumData?.credits && albumData.credits.length > 0 && (
                    <section>
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-themed-muted mb-4">Credits</h3>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            {albumData.credits.map((credit: Credit, idx: number) => (
                                <div key={idx} className="p-3 bg-white/5 rounded-lg border border-themed-subtle">
                                    <div className="text-sm font-bold text-themed-primary">{credit.person_name || credit.name}</div>
                                    <div className="text-[10px] text-themed-muted uppercase tracking-wide">{credit.role}</div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* Tracklist */}
                {(albumData?.tracks || albumData?.tracklist) && (albumData.tracks || albumData.tracklist)!.length > 0 && (
                    <section>
                        <h3 className="text-[9px] font-black uppercase tracking-[0.2em] text-themed-muted mb-4">
                            Tracklist ({(albumData.tracks || albumData.tracklist)!.length} tracks)
                        </h3>
                        <div className="space-y-1">
                            {(albumData.tracks || albumData.tracklist)!.map((track: Track, idx: number) => (
                                <div key={idx} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/5 transition-colors">
                                    <span className="text-[10px] text-themed-muted font-mono w-8 text-right">
                                        {(track.disc_number || track.disc || 1) > 1 ? 
                                            `${track.disc_number || track.disc}.${track.track_number || track.number}` : 
                                            (track.track_number || track.number)}
                                    </span>
                                    <span className="flex-1 text-sm font-medium text-themed-primary truncate">{track.title}</span>
                                    <span className="text-[10px] text-themed-muted font-mono">
                                        {typeof track.duration === 'number' ? 
                                            `${Math.floor(track.duration / 60)}:${(track.duration % 60).toString().padStart(2, '0')}` : 
                                            track.duration}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {albumData?.albumUrl && (
                    <div className="mt-8">
                        <a
                            href={albumData.albumUrl}
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
            <div className="p-4 bg-white/5 border-b border-themed-subtle">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <BookOpen size={14} className="text-accent-primary" />
                        <span className="text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] header-text">
                            {info?.source === 'Qobuz Enhanced' ? 'Enhanced with Qobuz' : 'MusicBrainz Database'}
                        </span>
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
                        {info?.artist && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        )}
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
                        {info?.album && (
                            <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                        )}
                    </button>
                </div>
            </div>

            {/* Content */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto py-10 custom-scrollbar relative scroll-smooth"
            >
                <div className="px-8 md:px-16 lg:px-24 max-w-6xl mx-auto">
                    {error ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-60 text-center">
                            <Music size={48} className="mb-6 stroke-1 text-red-400" />
                            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-red-400">Error Loading Info</h2>
                            <p className="text-[10px] font-bold text-themed-muted uppercase tracking-widest max-w-[300px]">{error}</p>
                            <button 
                                onClick={() => fetchInfo()} 
                                className="mt-4 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 rounded-lg text-red-400 text-xs font-bold transition-colors"
                            >
                                Retry
                            </button>
                        </div>
                    ) : loading ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="flex flex-col items-center gap-4 animate-pulse">
                                <div className="w-12 h-12 rounded-full border-2 border-accent-primary/20 border-t-accent-primary animate-spin" />
                                <div className="text-[10px] text-themed-muted font-black uppercase tracking-widest">Loading enhanced info...</div>
                            </div>
                        </div>
                    ) : !info?.artist && !info?.album ? (
                        <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                            <Music size={48} className="mb-6 stroke-1" />
                            <h2 className="text-xl font-black uppercase tracking-wider mb-2 text-themed-primary">No Info Found</h2>
                            <p className="text-[10px] font-bold text-themed-muted uppercase tracking-widest max-w-[200px]">We couldn't find information for this track.</p>
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
                Data from {info?.source || 'MusicBrainz'}
            </div>
        </div>
    );
};

export default ArtistInfo;