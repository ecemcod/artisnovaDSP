import { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import FilterGraph from './components/FilterGraph';
import PEQEditor from './components/PEQEditor';
import VUMeter from './components/VUMeter';
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import PlayQueue from './components/PlayQueue';
import Lyrics from './components/Lyrics';
import type { FilterParam } from './types';
import {
  Play, Save, Zap, SkipBack, SkipForward, Pause,
  Music, Activity, MessageCircle, Settings, Server, Monitor, Menu, X, ChevronRight, ChevronLeft, Check, Volume2, RefreshCcw, Sun, Moon, Cast
} from 'lucide-react';
import './index.css';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const API_URL = `http://${API_HOST}:3001/api`;

// Device detection
const isMobile = () => window.innerWidth < 768;

const formatTime = (seconds: number) => {
  if (isNaN(seconds) || seconds < 0) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

const STORAGE_KEY = `artisNovaDSP_config`;
const PANEL_STORAGE_KEY = `artisNovaDSP_layout_v2`;
const THEME_STORAGE_KEY = `artisNovaDSP_theme`;

interface SavedConfig {
  filters: FilterParam[];
  preamp: number;
  sampleRate: number;
  bitDepth: number;
  selectedPreset: string | null;
  activeMode?: 'playback' | 'processing' | 'lyrics' | 'queue';
  backend?: 'local' | 'raspi';
}

const BACKENDS = {
  local: { name: 'Local', wsUrl: `ws://${window.location.hostname}:5005` },
  raspi: { name: 'Raspberry Pi', wsUrl: 'ws://raspberrypi.local:5005' }
} as const;

type LayoutMode = 'playback' | 'processing' | 'lyrics' | 'queue';

function App() {
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterParam[]>([]);
  const [preamp, setPreamp] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sampleRate, setSampleRate] = useState(96000);
  const [bitDepth, setBitDepth] = useState(24);
  const [isLoaded, setIsLoaded] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{
    state: string;
    track: string;
    artist: string;
    album?: string;
    artworkUrl?: string;
    position: number;
    duration: number;
    signalPath?: {
      quality: string;
      nodes: {
        description: string;
        details?: string;
        type: string;
        status: string;
      }[];
    };
  }>({ state: 'unknown', track: '', artist: '', position: 0, duration: 0 });
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ track: string; artist: string; album?: string; artworkUrl?: string }[]>([]);
  const [backend, setBackend] = useState<'local' | 'raspi'>('local');
  const [raspiOnline, setRaspiOnline] = useState(false);
  const [activeMode, setActiveMode] = useState<LayoutMode>('processing');
  const [panelSizes, setPanelSizes] = useState<number[]>([55, 45]);
  const [isLayoutLoaded, setIsLayoutLoaded] = useState(false);
  const [volume, setVolume] = useState(50);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [currentTime, setCurrentTime] = useState(0);
  const [roonZones, setRoonZones] = useState<{ id: string, name: string, active: boolean, state: string }[]>([]);
  const [mediaSource, setMediaSource] = useState<'apple' | 'roon'>('apple');
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const isSeeking = useRef(false);

  // Sync currentTime with nowPlaying.position
  useEffect(() => {
    if (!isSeeking.current) {
      setCurrentTime(nowPlaying.position || 0);
    }
  }, [nowPlaying.position, nowPlaying.track]);

  // Local timer for smooth progress
  useEffect(() => {
    if (nowPlaying.state !== 'playing') return;
    const interval = setInterval(() => {
      setCurrentTime(prev => prev + 0.5);
    }, 500);
    return () => clearInterval(interval);
  }, [nowPlaying.state]);


  // Load and apply theme
  useEffect(() => {
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'dark' | 'light' | null;
    if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('theme-dark', 'theme-light');
    document.documentElement.classList.add(`theme-${theme}`);
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    console.log("Artis Nova DSP v1.2.1 - Loading Layout...");
    const savedLayout = localStorage.getItem(PANEL_STORAGE_KEY);
    if (savedLayout) {
      try {
        const parsed = JSON.parse(savedLayout);
        console.log('Loaded layout:', parsed);
        setPanelSizes(parsed);
      } catch (e) { console.error('Failed to parse layout:', e); }
    }
    // Small delay to ensure Group component is ready for the correct sizes
    setTimeout(() => setIsLayoutLoaded(true), 50);
  }, []);

  useEffect(() => {
    // Load saved source preference specifically
    const savedSource = localStorage.getItem('artisNovaDSP_mediaSource') as 'apple' | 'roon' | null;
    if (savedSource) {
      setMediaSource(savedSource);
    }
  }, []);

  useEffect(() => {
    // Save source preference independently
    localStorage.setItem('artisNovaDSP_mediaSource', mediaSource);

    // Also update legacy config for backward compatibility, but don't depend on it for reading
    const saved = localStorage.getItem(STORAGE_KEY);
    const config = saved ? JSON.parse(saved) : {};
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, mediaSource }));
  }, [mediaSource]);

  const onLayoutChange = (sizes: any) => {
    if (!isLayoutLoaded) return; // Guard against initial mount overwrite

    // Only save if different from current
    if (JSON.stringify(sizes) !== JSON.stringify(panelSizes)) {
      console.log('Saving layout:', sizes);
      setPanelSizes(sizes);
      localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(sizes));
    }
  };

  useEffect(() => {
    // Poll volume
    const checkVolume = async () => {
      try {
        const res = await axios.get(`${API_URL}/volume`);
        setVolume(res.data.volume);
      } catch { }
    };
    checkVolume();
    const interval = setInterval(checkVolume, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleVolumeChange = async (newVol: number) => {
    setVolume(newVol);
    try {
      await axios.post(`${API_URL}/volume`, { volume: newVol, source: mediaSource });
    } catch { }
  };

  const handleSeek = async (newPos: number) => {
    setCurrentTime(newPos);
    try {
      await axios.post(`${API_URL}/media/seek`, { position: newPos, source: mediaSource });
    } catch { }
  };

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'settings'>('main');

  useEffect(() => {
    if (!menuOpen && !sourcePopoverOpen) {
      setMenuView('main');
    } else {
      fetchRoonZones();
    }
  }, [menuOpen, sourcePopoverOpen]);

  // Periodic polling for Roon zones when popover or menu is open
  useEffect(() => {
    if ((menuOpen || sourcePopoverOpen) && mediaSource === 'roon') {
      const interval = setInterval(fetchRoonZones, 5000);
      return () => clearInterval(interval);
    }
  }, [menuOpen, sourcePopoverOpen, mediaSource]);

  // Auto-close timers for menus
  useEffect(() => {
    if (menuOpen) {
      const timer = setTimeout(() => setMenuOpen(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [menuOpen]);

  useEffect(() => {
    if (sourcePopoverOpen) {
      const timer = setTimeout(() => setSourcePopoverOpen(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [sourcePopoverOpen]);

  const fetchRoonZones = async () => {
    try {
      const res = await axios.get(`${API_URL}/media/roon/zones`);
      setRoonZones(res.data);
    } catch { }
  };

  const selectRoonZone = async (zoneId: string) => {
    try {
      await axios.post(`${API_URL}/media/roon/select`, { zoneId });
      fetchRoonZones();
    } catch { }
  };

  // Poll for now playing info
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const res = await axios.get(`${API_URL}/media/info?source=${mediaSource}`);
        if (res.data.track !== nowPlaying.track) {
          setNowPlaying(res.data);
          fetchLyrics(res.data.track, res.data.artist);
        } else {
          setNowPlaying(prev => ({
            ...prev,
            state: res.data.state,
            position: res.data.position || 0,
            duration: res.data.duration || 0
          }));
        }
      } catch { }
    };
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 2000);
    return () => clearInterval(interval);
  }, [nowPlaying.track, nowPlaying.state, mediaSource]);

  const fetchLyrics = async (track: string, artist: string) => {
    if (!track || !artist) {
      setLyrics(null);
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/media/lyrics`, { params: { track, artist } });
      setLyrics(res.data.plain || null);
    } catch {
      setLyrics(null);
    }
  };

  // Load saved config on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const config: SavedConfig = JSON.parse(saved);
        if (config.filters?.length) setFilters(config.filters);
        if (config.preamp !== undefined) setPreamp(config.preamp);
        if (config.sampleRate) setSampleRate(config.sampleRate);
        if (config.bitDepth) setBitDepth(config.bitDepth);
        if (config.selectedPreset) setSelectedPreset(config.selectedPreset);
        if (config.activeMode) setActiveMode(config.activeMode);
        if (config.backend) setBackend(config.backend);
      } catch (e) {
        console.error('Failed to load saved config:', e);
      }
    } else {
      setFilters([
        { id: 'band1', type: 'Peaking', freq: 100, gain: 0, q: 1, enabled: true },
        { id: 'band2', type: 'Peaking', freq: 1000, gain: 0, q: 1, enabled: true },
        { id: 'band3', type: 'Peaking', freq: 8000, gain: 0, q: 1, enabled: true },
      ]);
      setSampleRate(96000);
    }
    setIsLoaded(true);
  }, []);

  // Save config whenever it changes
  useEffect(() => {
    if (!isLoaded) return;
    const config: SavedConfig = { filters, preamp, sampleRate, bitDepth, selectedPreset, activeMode, backend };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [filters, preamp, sampleRate, bitDepth, selectedPreset, isLoaded, activeMode, backend]);

  // Check Raspberry Pi connectivity
  useEffect(() => {
    const checkRaspi = async () => {
      try {
        const ws = new WebSocket(BACKENDS.raspi.wsUrl);
        const timeout = setTimeout(() => { ws.close(); setRaspiOnline(false); }, 3000);
        ws.onopen = () => { clearTimeout(timeout); setRaspiOnline(true); ws.close(); };
        ws.onerror = () => { clearTimeout(timeout); setRaspiOnline(false); };
      } catch { setRaspiOnline(false); }
    };
    checkRaspi();
    const interval = setInterval(checkRaspi, 10000);
    return () => clearInterval(interval);
  }, []);

  const fetchQueue = async () => {
    try {
      const res = await axios.get(`${API_URL}/media/queue`);
      setQueue(res.data.queue || []);
    } catch { }
  };

  useEffect(() => {
    loadPresets();
    checkStatus();
    fetchQueue();
    const statusInterval = setInterval(checkStatus, 2000);
    const queueInterval = setInterval(fetchQueue, 5000);
    return () => { clearInterval(statusInterval); clearInterval(queueInterval); };
  }, []);

  const loadPresets = async () => { try { const res = await axios.get(`${API_URL}/presets`); setPresets(res.data || []); } catch { } };
  const checkStatus = async () => { try { const res = await axios.get(`${API_URL}/status`); setIsRunning(res.data.running); } catch { } };

  const selectPreset = async (name: string) => {
    if (!name) return;
    setSelectedPreset(name);
    try {
      const res = await axios.get(`${API_URL}/presets/${name}`);
      setFilters(res.data.filters);
      setPreamp(res.data.preamp);
      // Auto-reload Camilla with new settings
      await axios.post(`${API_URL}/start`, {
        directConfig: { filters: res.data.filters, preamp: res.data.preamp },
        sampleRate,
        bitDepth
      });
      await checkStatus();
    }
    catch (err: any) { alert("Load Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleStart = async () => {
    try { await axios.post(`${API_URL}/start`, { directConfig: { filters, preamp }, sampleRate, bitDepth }); await checkStatus(); }
    catch (err: any) { alert("Start Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleStop = async () => {
    try { await axios.post(`${API_URL}/stop`); await checkStatus(); }
    catch (err: any) { alert("Stop Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleSave = async () => {
    const name = prompt("Preset Name:", selectedPreset?.replace('.txt', '') || "New Preset");
    if (!name) return;
    try { await axios.post(`${API_URL}/presets`, { name, filters, preamp }); loadPresets(); setSelectedPreset(name.endsWith('.txt') ? name : name + '.txt'); }
    catch { alert('Save failed'); }
  };

  const handleNewPreset = () => {
    setSelectedPreset(null);
    setFilters([
      { id: 'band1', type: 'Peaking', freq: 100, gain: 0, q: 1, enabled: true },
      { id: 'band2', type: 'Peaking', freq: 1000, gain: 0, q: 1, enabled: true },
      { id: 'band3', type: 'Peaking', freq: 8000, gain: 0, q: 1, enabled: true },
    ]);
    setPreamp(0);
  };

  // Render Now Playing - Immersive Redesign
  const renderNowPlaying = () => {
    return (
      <div className="h-full w-full relative overflow-clip group flex flex-col">
        {/* 1. Background - Dynamic "Solid" Color from Artwork */}
        <div className="absolute inset-0 z-0 overflow-hidden bg-[#050505]">
          {nowPlaying.artworkUrl && (
            <img
              src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover filter blur-[100px] scale-[5.0] saturate-200 opacity-80"
            />
          )}
        </div>

        {/* 2. Content Layer */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pt-8 md:pt-12 relative z-20 flex flex-col">

          {/* Main Content Container - Vertically Centered */}
          <div className="w-full max-w-lg mx-auto flex flex-col justify-center flex-1 min-h-0">

            {/* Artwork - Larger Size */}
            <div className="aspect-square w-full max-w-[380px] mx-auto mb-8 md:mb-12 relative group/art">
              <div className="absolute inset-0 bg-black/20 rounded-2xl transform translate-y-2 blur-xl opacity-50" />
              <div className="relative w-full h-full bg-[#1a1a1a] rounded-2xl overflow-hidden shadow-2xl">
                {nowPlaying.artworkUrl ? (
                  <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="Album Art" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20"><Music size={64} strokeWidth={1} /></div>
                )}
              </div>
            </div>

            {/* Track Info & Actions - Centered */}
            <div className="w-full flex flex-col items-center text-center mb-8 px-2">
              <div className="w-full">
                <h2 className="text-xl md:text-3xl font-bold text-white leading-tight line-clamp-2 mb-1">{nowPlaying.track || 'Not Playing'}</h2>
                <p className="text-base md:text-lg text-white/60 font-medium truncate">{nowPlaying.artist || 'System Ready'}</p>
                {/* Roon Quality Badge - Subtle */}
                {mediaSource === 'roon' && nowPlaying.signalPath && (
                  <div className="flex items-center justify-center gap-1.5 mt-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${nowPlaying.signalPath.quality === 'lossless' ? 'bg-[#9b59b6]' : nowPlaying.signalPath.quality === 'high_quality' ? 'bg-[#2ecc71]' : 'bg-[#f1c40f]'}`} />
                    <span className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{nowPlaying.signalPath.quality.replace(/_/g, ' ')}</span>
                  </div>
                )}
              </div>
            </div>


            {/* Controls Section - Floating, narrower width */}
            <div className="w-full max-w-[280px] mx-auto">
              {/* Progress Bar */}
              <div className="w-full mx-auto mb-8">
                <div className="relative h-4 w-full bg-gray-800/80 rounded-full cursor-pointer border-2 border-white/30">
                  {/* Progress fill */}
                  <div
                    className="absolute left-0 top-0 h-full bg-cyan-400 rounded-full"
                    style={{ width: `${nowPlaying.duration > 0 ? (Math.min(currentTime, nowPlaying.duration) / nowPlaying.duration) * 100 : 0}%` }}
                  />
                  {/* Handle - positioned absolutely based on progress */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-white rounded-full shadow-xl border-4 border-cyan-400"
                    style={{ left: `${nowPlaying.duration > 0 ? (Math.min(currentTime, nowPlaying.duration) / nowPlaying.duration) * 100 : 0}%` }}
                  />
                  {/* Invisible Input Overlay for Interaction */}
                  <input
                    type="range"
                    min={0}
                    max={nowPlaying.duration || 100}
                    step={1}
                    value={currentTime}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    onMouseDown={() => { isSeeking.current = true; }}
                    onMouseUp={() => { isSeeking.current = false; }}
                    onTouchStart={() => { isSeeking.current = true; }}
                    onTouchEnd={() => { isSeeking.current = false; }}
                    onInput={(e) => setCurrentTime(Number(e.currentTarget.value))}
                    onChange={(e) => handleSeek(Number(e.currentTarget.value))}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] md:text-xs font-medium text-white/40 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(nowPlaying.duration)}</span>
                </div>
              </div>

              {/* Transport Controls */}
              <div className="flex items-center justify-center gap-4 mb-12">
                <button
                  onTouchStart={() => axios.post(`${API_URL}/media/prev?source=${mediaSource}`).catch(() => { })}
                  onClick={() => axios.post(`${API_URL}/media/prev?source=${mediaSource}`).catch(() => { })}
                  className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                  style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                >
                  <SkipBack size={20} fill="currentColor" />
                </button>
                <button
                  onTouchStart={() => axios.post(`${API_URL}/media/playpause?source=${mediaSource}`).catch(() => { })}
                  onClick={() => axios.post(`${API_URL}/media/playpause?source=${mediaSource}`).catch(() => { })}
                  className="rounded-full p-3 hover:opacity-80 hover:scale-105 active:scale-95 transition-all shadow-xl"
                  style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                >
                  {nowPlaying.state === 'playing' ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                </button>
                <button
                  onTouchStart={() => axios.post(`${API_URL}/media/next?source=${mediaSource}`).catch(() => { })}
                  onClick={() => axios.post(`${API_URL}/media/next?source=${mediaSource}`).catch(() => { })}
                  className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                  style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
                >
                  <SkipForward size={20} fill="currentColor" />
                </button>
              </div>

              {/* Separator */}
              {/* Spacer Workaround */}
              <div
                className="text-6xl font-black leading-none select-none py-4 text-center"
                style={{ color: '#000000' }}
              >
                ARTIS NOVA SPACER
              </div>

              {/* Volume */}
              <div className="w-full max-w-[240px] mx-auto flex items-center gap-3 px-4 py-2">
                <Volume2 size={14} style={{ color: '#ffffff' }} />
                <div className="flex-1 h-4 bg-gray-800/80 rounded-full relative border-2 border-white/30">
                  {/* Volume fill */}
                  <div className="absolute left-0 top-0 h-full bg-gray-400 rounded-full" style={{ width: `${volume}%` }} />
                  {/* Handle - positioned absolutely based on volume */}
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 bg-gray-300 rounded-full shadow-xl border-4 border-gray-800"
                    style={{ left: `${volume}%` }}
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={volume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                </div>
                <Volume2 size={14} style={{ color: '#ffffff' }} />
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };


  // Render Processing Tools
  const renderProcessingTools = () => {
    return (
      <div className="flex-1 flex flex-col min-h-0 bg-themed-deep overflow-hidden">
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 md:p-6 pt-14 md:pt-16 space-y-6 md:space-y-8">

          {/* 1. ANALOG MONITORING */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
              <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">Analog Monitoring</span>
            </div>
            <div className="h-[260px] flex items-center justify-center overflow-hidden">
              <VUMeter isRunning={isRunning} wsUrl={BACKENDS[backend].wsUrl} />
            </div>
          </section>

          {/* 2. ANALYZER */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-5 shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
              <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">Analyzer</span>
            </div>
            <div className="h-[300px]">
              <FilterGraph filters={filters} preamp={preamp} />
            </div>
          </section>

          {/* 3. CONTROLS (Presets, Resolution, Start/Stop) -> COMPACT HORIZONTAL ROW */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-4 shadow-lg">
            <div className="flex flex-wrap items-center gap-y-4 gap-x-10">

              {/* Presets */}
              <div className="flex items-center gap-4">
                <div className="flex flex-col">
                  <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1">Presets</span>
                  <div className="flex items-center gap-2">
                    <select value={selectedPreset || ''} onChange={e => {
                      const val = e.target.value;
                      if (val) selectPreset(val);
                      else handleNewPreset();
                    }} className="bg-themed-deep border border-themed-medium rounded-lg px-3 py-1.5 text-xs text-accent-primary font-black outline-none transition-colors hover:border-accent-primary min-w-[140px]">
                      <option value="">+ New</option>
                      {presets.map(p => <option key={p} value={p}>{p.replace('.txt', '')}</option>)}
                    </select>
                    <button onClick={handleSave} className="p-1.5 bg-themed-deep border border-themed-medium text-themed-muted hover:text-accent-primary hover:border-accent-primary rounded-lg transition-all" title="Save Preset"><Save size={14} /></button>
                  </div>
                </div>
              </div>

              {/* Resolution (Sample Rate & Bit Depth) */}
              <div className="flex flex-col">
                <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1">Resolution</span>
                <div className="bg-themed-deep border border-themed-medium rounded-lg px-4 py-1.5 flex items-center justify-between gap-4">
                  <span className="text-[13px] font-black tracking-widest text-accent-primary">{(sampleRate / 1000).toFixed(1)}k</span>
                  <div className="w-px h-4 bg-themed-medium" />
                  <span className="text-[13px] font-black tracking-widest text-accent-primary">{bitDepth}b</span>
                </div>
              </div>

              {/* Gain - Inline Compact */}
              <div className="flex items-center gap-2">
                <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.15em]">Gain</span>
                <div className="flex items-center gap-1 bg-themed-deep border border-themed-medium rounded-lg px-2 py-1">
                  <input type="number" step={0.1} value={preamp || 0} onChange={e => setPreamp(Number(e.target.value) || 0)} className="w-8 bg-transparent text-center text-[10px] text-accent-warning font-mono font-black outline-none" />
                  <span className="text-[8px] text-themed-muted font-black">dB</span>
                </div>
              </div>

              {/* Engine Status & Control */}
              <div className="flex flex-col min-w-[200px]">
                <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1">DSP Engine</span>
                <div className="flex items-center gap-3">
                  {!isRunning ? (
                    <button onClick={handleStart} className="flex-1 py-1.5 bg-accent-primary text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">START</button>
                  ) : (
                    <div className="flex items-center gap-2 flex-1">
                      <button onClick={handleStart} className="bg-white/10 hover:bg-white/20 text-accent-success p-1.5 rounded-lg transition-colors border border-themed-subtle" title="Reload Settings"><RefreshCcw size={12} /></button>
                      <button onClick={handleStop} className="flex-1 py-1.5 bg-accent-danger text-white rounded-lg font-black text-[9px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">STOP</button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </section>

          {/* 4 & 5. PEQ EDITOR (PEQ Editor + Bands) */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-5 shadow-lg mb-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
              <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">PEQ Editor & Bands</span>
            </div>
            <div className="min-h-[400px]">
              <PEQEditor filters={filters} onChange={setFilters} />
            </div>
          </section>
        </div>
      </div>
    );
  };



  // Main layout
  const renderLayout = () => {
    const mobile = isMobile();
    if (mobile) {
      switch (activeMode) {
        case 'playback': return renderNowPlaying();
        case 'processing': return renderProcessingTools();
        case 'lyrics': return <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />;
        case 'queue': return <PlayQueue queue={queue} />;
        default: return renderNowPlaying();
      }
    }
    if (activeMode === 'playback') {
      return (
        <div className="h-full flex flex-col md:flex-row min-h-0 gap-6 md:gap-10 p-4 md:p-8 bg-themed-deep">
          <div className="flex-[2] min-h-0 flex flex-col">
            {renderNowPlaying()}
          </div>
          <div className="flex-1 min-w-[300px] max-w-sm hidden lg:flex flex-col">
            <PlayQueue queue={queue} />
          </div>
        </div>
      );
    }

    return (
      <Group orientation="horizontal" className="h-full w-full" onLayoutChange={onLayoutChange}>
        <Panel defaultSize={panelSizes[0]} minSize={30} id="now-playing">{renderNowPlaying()}</Panel>
        <Separator className="w-1 bg-themed-deep hover:bg-accent-primary/20 cursor-col-resize mx-0.5 rounded-full flex items-center justify-center transition-colors">
          <div className="w-1 h-12 bg-themed-medium rounded-full" />
        </Separator>
        <Panel defaultSize={panelSizes[1]} minSize={25} id="secondary">
          {activeMode === 'processing' && renderProcessingTools()}
          {activeMode === 'lyrics' && <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />}
          {activeMode === 'queue' && <PlayQueue queue={queue} />}
        </Panel>
      </Group>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-themed-deep text-themed-primary overflow-clip transition-colors">
      {/* FLOATING MENU BUTTON - Safe area padding for mobile */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-50 p-3 rounded-xl shadow-xl hover:opacity-80 transition-all active:scale-95"
        style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
      >
        {menuOpen ? <X size={20} style={{ color: '#ffffff' }} /> : <Menu size={20} style={{ color: '#ffffff' }} />}
      </button>

      {/* DROPDOWN MENU */}
      {menuOpen && (
        <div className="fixed top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-[max(1rem,env(safe-area-inset-left))] z-50 bg-themed-card/95 backdrop-blur-xl border border-themed-medium rounded-xl shadow-2xl w-72 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">

          {menuView === 'main' ? (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-themed-subtle flex items-center gap-3">
                <div className="p-2 bg-accent-primary/10 rounded-lg">
                  <Zap className="text-accent-primary" size={16} />
                </div>
                <div>
                  <div className="text-sm font-black text-themed-primary header-text">Artis Nova</div>
                  <div className="text-[10px] text-themed-muted uppercase tracking-widest font-black">DSP Processor</div>
                </div>
              </div>

              {/* View Mode Section */}
              <div className="p-2">
                <div className="px-3 pt-2 pb-1 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Navigation</div>
                <div className="space-y-0.5">
                  <button onClick={() => { setActiveMode('playback'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'playback' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Play size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Playback</span></div>
                    {activeMode === 'playback' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('processing'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'processing' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Activity size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Processing</span></div>
                    {activeMode === 'processing' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('lyrics'); setMenuOpen(false); }} disabled={!lyrics} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${!lyrics ? 'opacity-30 cursor-not-allowed' : activeMode === 'lyrics' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><MessageCircle size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Lyrics</span></div>
                    {activeMode === 'lyrics' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('queue'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'queue' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Music size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Queue</span></div>
                    {activeMode === 'queue' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Backend Section */}
              <div className="p-2">
                <div className="px-3 pt-1 pb-2 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Device</div>
                <div className="flex gap-2 px-1">
                  <button onClick={() => setBackend('local')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all ${backend === 'local' ? 'border border-accent-primary/20' : 'bg-themed-deep border border-themed-medium text-themed-muted hover:border-themed-secondary'}`} style={{ backgroundColor: backend === 'local' ? '#000000' : 'transparent', color: '#ffffff' }}>
                    <Monitor size={14} /><span className="text-[11px] font-black">Local</span>
                    {backend === 'local' && <Check size={10} strokeWidth={4} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => raspiOnline && setBackend('raspi')} disabled={!raspiOnline} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all ${!raspiOnline ? 'opacity-30 cursor-not-allowed bg-themed-deep border border-themed-medium text-themed-muted' : backend === 'raspi' ? 'border border-accent-primary/20' : 'bg-themed-deep border border-themed-medium text-themed-muted hover:border-themed-secondary'}`} style={{ backgroundColor: backend === 'raspi' ? '#000000' : 'transparent', color: '#ffffff' }}>
                    <Server size={14} /><span className="text-[11px] font-black">RPi</span>
                    {backend === 'raspi' && <Check size={10} strokeWidth={4} style={{ color: '#ffffff' }} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-themed-subtle my-1" />

              {/* Audio Config Trigger */}
              <div className="p-2">
                <button onClick={() => setMenuView('settings')} className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-white/5 text-themed-secondary transition-all">
                  <div className="flex items-center gap-3">
                    <Settings size={16} style={{ color: '#ffffff' }} />
                    <span className="text-sm font-bold">Audio Settings</span>
                  </div>
                  <ChevronRight size={16} style={{ color: '#ffffff' }} />
                </button>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Theme Toggle */}
              <div className="p-2">
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-white/5 text-themed-secondary transition-all">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon size={16} style={{ color: '#ffffff' }} /> : <Sun size={16} style={{ color: '#ffffff' }} />}
                    <span className="text-sm font-bold">{theme === 'dark' ? 'Dark Mode' : 'Light Mode'}</span>
                  </div>
                  <div className={`w-9 h-5 rounded-full relative transition-colors ${theme === 'light' ? 'bg-accent-primary' : 'bg-themed-deep border border-themed-medium'}`}>
                    <div className={`absolute top-0.5 w-3.5 h-3.5 bg-white rounded-full transition-all ${theme === 'light' ? 'left-4.5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* Status Footer */}
              <div className="px-5 py-3 bg-themed-deep border-t border-themed-subtle flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-themed-subtle">
                  <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-accent-primary shadow-[0_0_8px_var(--glow-cyan)]' : 'bg-accent-danger'}`} />
                  <span className="text-[10px] font-black text-themed-muted uppercase tracking-widest">{isRunning ? 'DSP ON' : 'DSP OFF'}</span>
                </div>
                <span className="text-[9px] text-accent-primary font-black tracking-widest">{(sampleRate / 1000).toFixed(1)}K / {bitDepth}B</span>
              </div>
            </>
          ) : (
            <>
              {/* Settings Header */}
              <div className="px-4 py-3 border-b border-themed-subtle flex items-center gap-2">
                <button onClick={() => setMenuView('main')} className="p-2 hover:bg-white/5 rounded-lg transition-all text-themed-muted hover:text-themed-primary">
                  <ChevronLeft size={18} />
                </button>
                <div className="text-sm font-black text-themed-primary header-text">Settings</div>
              </div>

              {/* Settings Content */}
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Sample Rate</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[44100, 48000, 96000, 192000].map(sr => (
                      <button
                        key={sr}
                        onClick={() => setSampleRate(sr)}
                        className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${sampleRate === sr ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary' : 'bg-themed-deep border-themed-medium text-themed-muted hover:border-themed-secondary'}`}
                      >
                        {(sr / 1000).toFixed(1)} kHz
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Bit Depth</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[16, 24, 32].map(bd => (
                      <button
                        key={bd}
                        onClick={() => setBitDepth(bd)}
                        className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${bitDepth === bd ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary' : 'bg-themed-deep border-themed-medium text-themed-muted hover:border-themed-secondary'}`}
                      >
                        {bd}-bit
                      </button>
                    ))}
                  </div>
                </div>
              </div>


              {/* Auto-save hint */}
              <div className="px-6 py-4 text-center">
                <p className="text-[10px] text-[#404060] font-medium leading-relaxed italic">
                  Changes are applied when the DSP engine is restarted.
                </p>
              </div>
            </>
          )}
        </div>
      )}




      {/* MAIN CONTENT with safe area padding */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden p-4 md:p-8 flex flex-col">
        {renderLayout()}
      </div>

      {/* Floating Media Source & Zone Selector (Bottom Left) */}
      <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))] z-50 flex flex-col-reverse items-start gap-4">
        <button
          onClick={() => setSourcePopoverOpen(!sourcePopoverOpen)}
          className="group p-4 rounded-full shadow-xl active:scale-95 transition-all"
          style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
          title="Direct Source"
        >
          <Cast size={24} style={{ color: '#ffffff' }} />
        </button>

        {sourcePopoverOpen && (
          <div className="flex items-end gap-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-300">
            {/* Main Source Selector */}
            <div className="bg-themed-card/95 backdrop-blur-2xl border border-themed-medium rounded-xl shadow-2xl p-2.5 w-52">
              <div className="px-3 pt-2 pb-2 text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] border-b border-themed-subtle mb-1">Fuente de Audio</div>
              <div className="space-y-1">
                <button
                  onClick={() => { setMediaSource('apple'); if (mediaSource === 'apple') setSourcePopoverOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${mediaSource === 'apple' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}
                >
                  <div className={`p-1.5 rounded-lg ${mediaSource === 'apple' ? 'bg-accent-primary/20' : 'bg-white/5'}`}>
                    <Music size={14} />
                  </div>
                  <span className="text-sm font-bold">Apple Music</span>
                  {mediaSource === 'apple' && <Check size={14} strokeWidth={4} className="ml-auto" />}
                </button>
                <button
                  onClick={() => { setMediaSource('roon'); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${mediaSource === 'roon' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}
                >
                  <div className={`p-1.5 rounded-lg ${mediaSource === 'roon' ? 'bg-accent-primary/20' : 'bg-white/5'}`}>
                    <Zap size={14} />
                  </div>
                  <span className="text-sm font-bold">Roon</span>
                  {mediaSource === 'roon' && <Check size={14} strokeWidth={4} className="ml-auto" />}
                </button>
              </div>
            </div>

            {/* Roon Zones Sub-menu (Show only if Roon is selected) */}
            {mediaSource === 'roon' && (
              <div className="bg-themed-card/95 backdrop-blur-2xl border border-themed-medium rounded-xl shadow-2xl p-2.5 w-56">
                <div className="px-3 pt-2 pb-2 text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] border-b border-themed-subtle mb-1 flex items-center justify-between">
                  <span>Zonas Roon</span>
                  {roonZones.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-accent-success shadow-[0_0_8px_var(--accent-success)]" />}
                </div>
                <div className="space-y-1 max-h-64 overflow-y-auto custom-scrollbar">
                  {roonZones.length === 0 ? (
                    <div className="px-4 py-6 text-center">
                      <div className="text-[10px] text-[#404060] italic">Buscando zonas...</div>
                    </div>
                  ) : (
                    roonZones.map(zone => (
                      <button
                        key={zone.id}
                        onClick={() => { selectRoonZone(zone.id); setSourcePopoverOpen(false); }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all ${zone.active ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-muted'}`}
                      >
                        <div className="flex flex-col items-start text-left">
                          <span className="text-[11px] font-black uppercase tracking-widest">{zone.name}</span>
                          <span className="text-[9px] opacity-70 font-mono capitalize">{zone.state}</span>
                        </div>
                        {zone.active && <Check size={12} strokeWidth={4} />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Popover overlay for clicking outside */}
      {sourcePopoverOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/10 backdrop-blur-[2px]"
          onClick={() => setSourcePopoverOpen(false)}
        />
      )}
      <div className="fixed bottom-2 right-4 pointer-events-none opacity-20 text-[6px] font-mono tracking-widest text-[#606080]">
        ARTIS NOVA v1.2.6-LYRICS
      </div>

      {/* Click outside to close menu - Placed at bottom for best event capturing */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-[45] bg-black/10 backdrop-blur-[2px] cursor-default"
          onClick={() => setMenuOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
