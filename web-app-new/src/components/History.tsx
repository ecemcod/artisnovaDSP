import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Mic2, Disc, Clock, PieChart as PieIcon, List, Music } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

const API_HOST = window.location.hostname;
const PROTOCOL = window.location.protocol;
const API_URL = `${PROTOCOL}//${API_HOST}:3000/api`;

interface Stats {
    topArtists: { name: string; count: number; image?: string }[];
    topAlbums: { name: string; count: number; image?: string }[];
    topStyles: { name: string; count: number }[];
    totalTracks: number;
}

interface HistoryItem {
    id: number;
    track: string;
    artist: string;
    album: string;
    style: string;
    source: string;
    device?: string;
    artwork_url?: string;
    timestamp: number;
    duration_listened: number;
}

const COLORS = ['#00E5FF', '#00B8D4', '#0097A7', '#006064', '#84FFFF', '#18FFFF', '#E0F7FA', '#B2EBF2'];

const History = () => {
    const [range, setRange] = useState<'week' | 'month' | 'year' | 'all'>('week');
    const [stats, setStats] = useState<Stats | null>(null);
    const [statsLoading, setStatsLoading] = useState(false);

    // History Table State
    const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);
    const observerTarget = useRef(null);

    useEffect(() => {
        fetchStats();
    }, [range]);

    useEffect(() => {
        // Initial fetch
        fetchHistory(1);

        // Polling for dynamic updates (every 30s)
        const interval = setInterval(() => {
            fetchStats();
            // Only refresh list if on first page to prevent scroll jumping
            if (page === 1) fetchHistory(1, true);
        }, 30000);

        return () => clearInterval(interval);
    }, [page, range]);

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const res = await axios.get(`${API_URL}/history/stats?range=${range}`);
            setStats(res.data);
        } catch (error) {
            console.error('Failed to fetch stats:', error);
        } finally {
            setStatsLoading(false);
        }
    };

    const fetchHistory = async (pageNum: number, isBackground = false) => {
        if (historyLoading && !isBackground) return;
        if (!isBackground) setHistoryLoading(true);
        try {
            const limit = 50;
            const res = await axios.get(`${API_URL}/history/list?page=${pageNum}&limit=${limit}`);
            const newItems = res.data.items;

            if (pageNum === 1) {
                setHistoryItems(newItems);
            } else {
                setHistoryItems(prev => [...prev, ...newItems]);
            }

            if (newItems.length < limit) {
                setHasMore(false);
            } else {
                setPage(pageNum);
            }
        } catch (error) {
            console.error('Failed to fetch history:', error);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Infinite Scroll Intersection Observer
    useEffect(() => {
        const observer = new IntersectionObserver(
            entries => {
                if (entries[0].isIntersecting && hasMore && !historyLoading) {
                    fetchHistory(page + 1);
                }
            },
            { threshold: 1.0 }
        );

        if (observerTarget.current) {
            observer.observe(observerTarget.current);
        }

        return () => {
            if (observerTarget.current) {
                observer.unobserve(observerTarget.current);
            }
        };
    }, [observerTarget, hasMore, historyLoading, page]);


    const ranges = [
        { id: 'week', label: 'Last Week' },
        { id: 'month', label: 'Last Month' },
        { id: 'year', label: 'Last Year' },
        { id: 'all', label: 'All Time' },
    ] as const;

    const formatTime = (ts: number) => new Date(ts * 1000).toLocaleString('es-ES', {
        day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const formatDuration = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = Math.round(seconds % 60);
        return `${m}:${s < 10 ? '0' : ''}${s}`;
    };

    const formatStatsDuration = (seconds: number) => {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        if (h > 0) return `${h}h ${m}m`;
        if (m > 0) return `${m}m`;
        return `${Math.round(seconds)}s`;
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-themed-deep overflow-hidden p-6 md:p-8 pt-14 md:pt-20">
            {/* Header & Controls */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-8 gap-4 shrink-0">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
                        <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">Your Listening History</span>
                    </div>
                    <h1 className="text-2xl font-bold text-themed-primary">Analytics (By Time)</h1>
                </div>

                <div className="flex bg-themed-panel rounded-lg p-1 border border-themed-subtle">
                    {ranges.map((r) => (
                        <button
                            key={r.id}
                            onClick={() => setRange(r.id)}
                            className={`px-4 py-2 rounded-md text-xs font-semibold transition-all ${range === r.id
                                ? 'bg-accent-primary text-white shadow-lg'
                                : 'text-themed-muted hover:text-themed-primary hover:bg-white/5'
                                }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Scroll Container */}
            <div className="flex-1 overflow-y-auto custom-scrollbar -mr-4 pr-4 space-y-8">

                {/* Analytics Grid */}
                {statsLoading ? (
                    <div className="flex items-center justify-center h-64 text-themed-muted">
                        <Clock className="animate-spin mr-2" /> Loading stats...
                    </div>
                ) : (
                    <div className="grid grid-cols-1 min-[600px]:grid-cols-2 gap-6">
                        {/* Top Artists */}
                        <StatsCard
                            title="Top Artists"
                            icon={<Mic2 size={18} />}
                            data={stats?.topArtists}
                            color="text-accent-tertiary"
                            formatter={formatStatsDuration}
                        />
                        {/* Top Albums */}
                        <StatsCard
                            title="Top Albums"
                            icon={<Disc size={18} />}
                            data={stats?.topAlbums}
                            color="text-accent-secondary"
                            formatter={formatStatsDuration}
                        />
                        {/* Style Distribution (Pie Chart) */}
                        <div className="col-span-1 min-[600px]:col-span-2 bg-themed-panel border border-themed-medium rounded-xl p-6 shadow-lg flex flex-col h-[400px] animate-in fade-in zoom-in duration-300">
                            <div className="flex items-center gap-3 mb-2 pb-4 border-b border-themed-subtle">
                                <div className={`p-2 rounded-lg bg-white/5 text-accent-warning`}>
                                    <PieIcon size={18} />
                                </div>
                                <h3 className="text-sm font-bold uppercase tracking-wider text-themed-primary">Style Distribution (Time)</h3>
                            </div>

                            <div className="flex-1 w-full min-h-0 relative">
                                {stats?.topStyles && stats.topStyles.length > 0 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={stats.topStyles}
                                                cx="50%"
                                                cy="45%"
                                                innerRadius={60}
                                                outerRadius={80}
                                                paddingAngle={5}
                                                dataKey="count"
                                                animationBegin={0}
                                                animationDuration={200}
                                            >
                                                {stats.topStyles.map((_, index) => (
                                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} stroke="rgba(0,0,0,0.5)" />
                                                ))}
                                            </Pie>
                                            <Tooltip
                                                contentStyle={{ backgroundColor: '#1a1a1a', border: '1px solid #333', borderRadius: '8px' }}
                                                itemStyle={{ color: '#fff', fontSize: '12px' }}
                                                formatter={(value: any, name: any) => [
                                                    `${formatStatsDuration(Number(value))} (${((Number(value) / (stats.totalTracks || 1)) * 100).toFixed(1)}%)`,
                                                    name
                                                ]}
                                            />
                                            <Legend
                                                layout='vertical'
                                                verticalAlign='bottom'
                                                align='center'
                                                wrapperStyle={{ fontSize: '11px', marginTop: '10px' }}
                                                formatter={(value) => <span className="text-themed-muted ml-2">{value}</span>}
                                            />
                                        </PieChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="text-center py-8 text-themed-muted text-xs italic opacity-50 flex h-full items-center justify-center">
                                        No data yet
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Detailed History Table */}
                <div className="bg-themed-panel border border-themed-medium rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100">
                    <div className="p-6 border-b border-themed-subtle flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-white/5 text-accent-primary">
                            <List size={18} />
                        </div>
                        <h3 className="text-sm font-bold uppercase tracking-wider text-themed-primary">Detailed Log</h3>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-black/20 text-xs font-bold text-themed-muted uppercase tracking-wider border-b border-themed-subtle">
                                    <th className="p-3 pl-4 w-10"></th>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Track</th>
                                    <th className="p-3">Artist</th>
                                    <th className="p-3">Album</th>
                                    <th className="p-3">Style</th>
                                    <th className="p-3">Duration</th>
                                    <th className="p-3">Device</th>
                                    <th className="p-3 text-center">Source</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm divide-y divide-themed-subtle">
                                {historyItems.length > 0 ? (
                                    historyItems.map((item) => (
                                        <tr key={item.id} className="group odd:bg-transparent even:bg-white/5 hover:!bg-white/10 transition-colors">
                                            <td className="p-3 pl-4">
                                                {item.artwork_url ? (
                                                    <img src={item.artwork_url} alt="art" className="w-6 h-6 rounded shadow-sm object-cover" />
                                                ) : (
                                                    <div className="w-6 h-6 rounded bg-white/5 flex items-center justify-center text-themed-muted">
                                                        <Music size={12} />
                                                    </div>
                                                )}
                                            </td>
                                            <td className="p-3 text-themed-muted font-mono text-xs whitespace-nowrap">
                                                {formatTime(item.timestamp)}
                                            </td>
                                            <td className="p-3 font-medium text-themed-primary group-hover:text-accent-primary transition-colors">
                                                {item.track}
                                            </td>
                                            <td className="p-3 text-themed-secondary">
                                                {item.artist}
                                            </td>
                                            <td className="p-3 text-themed-muted text-xs italic">
                                                {item.album}
                                            </td>
                                            <td className="p-3">
                                                <span className="px-2 py-1 rounded-full bg-white/5 text-[10px] uppercase font-bold text-accent-secondary border border-white/10">
                                                    {item.style}
                                                </span>
                                            </td>
                                            <td className="p-3 font-mono text-xs text-themed-muted">
                                                {formatDuration(item.duration_listened)}
                                            </td>
                                            <td className="p-3 text-xs text-themed-muted">
                                                {item.device || '-'}
                                            </td>
                                            <td className="p-3 text-center">
                                                <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${item.source === 'roon' ? 'bg-purple-500/10 text-purple-400' : 'bg-red-500/10 text-red-400'
                                                    }`}>
                                                    {item.source}
                                                </span>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-themed-muted opacity-50 italic">
                                            {historyLoading ? 'Loading history...' : 'No listening history recorded yet'}
                                        </td>
                                    </tr>
                                )}

                                {/* Loading trigger for infinite scroll */}
                                {hasMore && (
                                    <tr ref={observerTarget}>
                                        <td colSpan={9} className="p-4 text-center">
                                            {historyLoading && <div className="inline-block w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin"></div>}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="h-4"></div> {/* Bottom spacer */}
            </div>
        </div>
    );
};

const StatsCard = ({ title, icon, data, color, formatter }: { title: string; icon: React.ReactNode; data?: { name: string; count: number; image?: string }[]; color: string, formatter?: (val: number) => string }) => {
    // Determine background image from the top item (data[0]) if available
    const topImage = data && data.length > 0 && data[0].image ? data[0].image : null;

    return (
        <div className="relative bg-themed-panel border border-themed-medium rounded-xl p-6 shadow-lg flex flex-col h-[400px] animate-in fade-in zoom-in duration-300 overflow-hidden">
            {/* Background Image Overlay */}
            {topImage && (
                <div
                    className="absolute inset-0 z-0 bg-cover bg-center transition-all duration-1000"
                    style={{ backgroundImage: `url(${topImage})`, filter: 'blur(3px) brightness(0.25) grayscale(0.5)' }}
                />
            )}
            {/* Dark gradient overlay to ensure text legibility */}
            {topImage && (
                <div className="absolute inset-0 z-0 bg-gradient-to-b from-themed-panel/80 to-themed-panel/95" />
            )}

            <div className="relative z-10 flex items-center gap-3 mb-6 pb-4 border-b border-themed-subtle">
                <div className={`p-2 rounded-lg bg-white/5 ${color} backdrop-blur-md`}>
                    {icon}
                </div>
                <h3 className="text-sm font-bold uppercase tracking-wider text-themed-primary drop-shadow-md">{title}</h3>
            </div>

            <div className="relative z-10 flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-2">
                {data && data.length > 0 ? (
                    data.map((item, index) => (
                        <div key={index} className="flex items-center justify-between group">
                            <div className="flex items-center gap-4 min-w-0">
                                <span className={`text-xs font-mono font-bold w-6 text-right ${index < 3 ? color : 'text-themed-muted opacity-50'}`}>
                                    #{index + 1}
                                </span>
                                <span className="text-sm font-medium text-themed-secondary truncate group-hover:text-themed-primary transition-colors">
                                    {item.name || 'Unknown'}
                                </span>
                            </div>
                            <span className="text-xs font-mono text-themed-muted bg-white/5 px-2 py-1 rounded backdrop-blur-sm">
                                {formatter ? formatter(item.count) : item.count}
                            </span>
                        </div>
                    ))
                ) : (
                    <div className="text-center py-8 text-themed-muted text-xs italic opacity-50">
                        No data yet
                    </div>
                )}
            </div>
        </div>
    );
};

export default History;
