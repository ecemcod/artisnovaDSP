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
  Music, Activity, MessageCircle, Settings, Server, Monitor, Menu, X, ChevronRight, ChevronLeft, Check, Volume2, Volume1, VolumeX, RefreshCcw, Sun, Moon, Cast
} from 'lucide-react';
import './index.css';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const API_URL = `http://${API_HOST}:3000/api`;

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

  // Render Now Playing
  const renderNowPlaying = () => (
    <div className="h-full w-full bg-[#18151f] border border-[#2a2535] rounded-3xl relative overflow-hidden group shadow-xl flex flex-col">
      {/* 1. Static Background Layer */}
      {nowPlaying.artworkUrl && (
        <div className="absolute inset-0 opacity-10 filter blur-[100px] scale-150 pointer-events-none">
          <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="" className="w-full h-full object-cover" />
        </div>
      )}

      {/* 2. Content Layer with Refined Centering */}
      <div className="flex-1 overflow-y-auto custom-scrollbar grid place-items-center p-4 md:p-8">
        <div className="w-full max-w-2xl flex flex-col items-center gap-6 md:gap-10 lg:gap-14 py-8 relative z-10">
          <div className="w-24 h-24 xs:w-32 xs:h-32 sm:w-40 sm:h-40 md:w-56 md:h-56 lg:w-72 lg:h-72 bg-[#1a1a28] rounded-[24px] sm:rounded-[32px] md:rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] border-2 border-[#2a2a3e] flex-shrink-0">
            {nowPlaying.artworkUrl ? (
              <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="Album Art" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#2a2a3e]"><Zap size={64} strokeWidth={1} /></div>
            )}
          </div>
          <div className="w-full space-y-4 mb-4 md:mb-8 text-center">
            <h2 className="text-xl md:text-3xl lg:text-4xl font-black tracking-tighter text-white line-clamp-2 uppercase leading-tight text-center w-full">{nowPlaying.track || 'Standby'}</h2>
            <p className="text-sm md:text-lg text-[#00d4ff] font-bold tracking-[0.15em] uppercase opacity-90 text-center w-full">{nowPlaying.artist || 'Waiting for audio...'}</p>

            {/* Roon Signal Path Quality Indicator */}
            {mediaSource === 'roon' && nowPlaying.signalPath && (
              <div className="flex items-center justify-center gap-2 mt-2 group/signal">
                <div className={`w-2 h-2 rounded-full transition-shadow duration-500 shadow-[0_0_10px_rgba(0,0,0,0.5)] ${nowPlaying.signalPath.quality === 'lossless' ? 'bg-[#9b59b6] shadow-[#9b59b6]/50' :
                    nowPlaying.signalPath.quality === 'enhanced' ? 'bg-[#3498db] shadow-[#3498db]/50' :
                      nowPlaying.signalPath.quality === 'high_quality' ? 'bg-[#2ecc71] shadow-[#2ecc71]/50' :
                        'bg-[#f1c40f] shadow-[#f1c40f]/50'
                  }`} />
                <span className="text-[10px] font-bold tracking-[0.3em] uppercase text-white/30 group-hover/signal:text-[#00d4ff] transition-colors">
                  {nowPlaying.signalPath.quality.replace(/_/g, ' ')}
                </span>
              </div>
            )}
          </div>

          {/* Track Progress */}
          <div className="w-full flex justify-center mb-0">
            <div className="w-2/3 max-w-2xl flex items-center gap-3 md:gap-5 group/progress">
              <span className="text-[10px] md:text-xs font-black text-[#00d4ff] tabular-nums min-w-[35px] md:min-w-[45px] text-right">
                {formatTime(currentTime)}
              </span>
              <div className="flex-1 relative h-6 flex items-center">
                <div className="absolute inset-x-0 h-2 bg-white/10 rounded-full border border-white/5 pointer-events-none overflow-hidden">
                  <div
                    className="absolute left-0 top-0 h-full bg-gradient-to-r from-[#00ff88] via-[#00d4ff] to-[#00d4ff] shadow-[0_0_15px_rgba(0,212,255,0.6)] transition-all duration-500 ease-linear"
                    style={{ width: `${nowPlaying.duration > 0 ? (Math.min(currentTime, nowPlaying.duration) / nowPlaying.duration) * 100 : 0}%` }}
                  />
                </div>
                <input
                  type="range"
                  min={0}
                  max={nowPlaying.duration || 100}
                  step={1}
                  value={currentTime}
                  className="absolute inset-x-0 w-full h-full opacity-100 z-10 cursor-pointer progress-slider"
                  onMouseDown={() => { isSeeking.current = true; }}
                  onMouseUp={() => { isSeeking.current = false; }}
                  onTouchStart={() => { isSeeking.current = true; }}
                  onTouchEnd={() => { isSeeking.current = false; }}
                  onInput={(e) => {
                    const val = Number(e.currentTarget.value);
                    setCurrentTime(val);
                  }}
                  onChange={(e) => {
                    const val = Number(e.currentTarget.value);
                    handleSeek(val);
                  }}
                />
              </div>
              <span className="text-[10px] md:text-xs font-black text-[#606080] tabular-nums min-w-[35px] md:min-w-[45px] text-left">
                {formatTime(nowPlaying.duration)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 md:gap-8">
            <button onClick={() => axios.post(`${API_URL}/media/prev?source=${mediaSource}`).catch(() => { })} className="p-3 md:p-5 rounded-full bg-white/5 hover:bg-white/10 text-[#606080] hover:text-[#00d4ff] border border-white/5 transition-all active:scale-95"><SkipBack size={24} className="md:w-7 md:h-7" /></button>
            <button onClick={() => axios.post(`${API_URL}/media/playpause?source=${mediaSource}`).catch(() => { })} className="p-5 md:p-8 bg-[#00d4ff]/10 hover:bg-[#00d4ff]/20 rounded-full border-2 border-[#00d4ff]/20 shadow-[0_0_60px_rgba(0,212,255,0.15)] transition-all active:scale-95">
              {nowPlaying.state === 'playing' ? <Pause size={32} className="md:w-10 md:h-10 text-[#7b68ee]" fill="currentColor" /> : <Play size={32} className="md:w-10 md:h-10 text-[#00d4ff]" fill="currentColor" />}
            </button>
            <button onClick={() => axios.post(`${API_URL}/media/next?source=${mediaSource}`).catch(() => { })} className="p-3 md:p-5 rounded-full bg-white/5 hover:bg-white/10 text-[#606080] hover:text-[#00d4ff] border border-white/5 transition-all active:scale-95"><SkipForward size={24} className="md:w-7 md:h-7" /></button>
          </div>

          {/* Global Volume Slider */}
          <div className="w-full max-w-[220px] px-2 flex items-center gap-3 mt-8">
            <button className="text-[#606080] hover:text-[#00ff88] transition-colors" onClick={() => handleVolumeChange(0)}>
              {volume === 0 ? <VolumeX size={18} /> : <Volume1 size={18} />}
            </button>
            <div className="flex-1 relative">
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="volume-slider w-full"
              />
            </div>
            <button className="text-[#606080] hover:text-[#00ff88] transition-colors" onClick={() => handleVolumeChange(100)}>
              <Volume2 size={18} />
            </button>
          </div>
          <div className="text-[10px] font-bold text-[#606080] tracking-widest mt-1">{volume}%</div>
        </div>
      </div>
    </div>
  );

  // Render Processing Tools
  const renderProcessingTools = () => {
    const mobile = isMobile();
    return (
      <div className="h-full w-full flex flex-col gap-2 md:gap-3">
        <div className={`${mobile ? 'flex-[1.2]' : 'flex-[2]'} min-h-0`}>
          <VUMeter isRunning={true} wsUrl={BACKENDS[backend].wsUrl} />
        </div>
        <div className="flex-1 min-h-0 bg-[#0e1318] border border-[#1a2530] rounded-2xl p-2 md:p-4 flex flex-col transition-all">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_#00d4ff]" />
            <span className="text-[9px] text-[#606080] font-black tracking-[0.2em] uppercase">Analyzer</span>
          </div>
          <div className="flex-1 min-h-0"><FilterGraph filters={filters} preamp={preamp} /></div>
        </div>
        <div className={`${mobile ? 'flex-[1.5]' : 'flex-1'} min-h-0 flex flex-col bg-[#141416] border border-[#252528] rounded-2xl overflow-hidden transition-all text-themed-primary`}>
          <div className="p-2 bg-white/5 border-b border-[#1f1f2e] flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <select value={selectedPreset || ''} onChange={e => e.target.value ? selectPreset(e.target.value) : handleNewPreset()} className="bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-2 py-1 text-[9px] text-[#00d4ff] font-bold outline-none">
                <option value="">+ New</option>
                {presets.map(p => <option key={p} value={p}>{p.replace('.txt', '')}</option>)}
              </select>
              <button onClick={handleSave} className="p-1 text-[#606080] hover:text-white"><Save size={14} /></button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-2 py-0.5">
                <span className="text-[8px] text-[#404060] font-black">GAIN</span>
                <input type="number" step={0.1} value={preamp || 0} onChange={e => setPreamp(Number(e.target.value) || 0)} className="w-8 bg-transparent text-center text-[10px] text-[#ffaa00] font-mono outline-none" />
              </div>
              {!isRunning ? (
                <button onClick={handleStart} className="bg-gradient-to-r from-[#00d4ff] to-[#7b68ee] text-white px-3 py-1 rounded-lg font-black text-[8px] flex items-center gap-1.5 uppercase tracking-wider">START</button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button onClick={handleStart} className="bg-white/10 hover:bg-white/20 text-[#00ff88] p-1.5 rounded-lg transition-colors border border-white/5" title="Reload Settings"><RefreshCcw size={12} /></button>
                  <button onClick={handleStop} className="bg-[#ff6b9d] text-white px-3 py-1 rounded-lg font-black text-[8px] uppercase tracking-wider">STOP</button>
                </div>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar"><PEQEditor filters={filters} onChange={setFilters} /></div>
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
        <div className="h-full w-full">
          {renderNowPlaying()}
        </div>
      );
    }

    return (
      <Group orientation="horizontal" className="h-full w-full" onLayoutChange={onLayoutChange}>
        <Panel defaultSize={panelSizes[0]} minSize={30} id="now-playing">{renderNowPlaying()}</Panel>
        <Separator className="w-2 bg-[#0a0a0f] hover:bg-[#7b68ee]/40 cursor-col-resize mx-1 rounded-full flex items-center justify-center">
          <div className="w-1 h-20 bg-[#2a2a3e] hover:bg-[#7b68ee] rounded-full" />
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
    <div className="flex flex-col h-screen w-screen bg-themed-deep text-themed-primary overflow-hidden transition-colors">
      {/* FLOATING MENU BUTTON - Safe area padding for mobile */}
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-50 p-3 bg-[#1a1a28]/90 backdrop-blur-xl border border-[#2a2a3e] rounded-2xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] hover:bg-[#252535] transition-all"
      >
        {menuOpen ? <X size={20} className="text-white" /> : <Menu size={20} className="text-[#00d4ff]" />}
      </button>

      {/* DROPDOWN MENU */}
      {menuOpen && (
        <div className="fixed top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-[max(1rem,env(safe-area-inset-left))] z-50 bg-[#1a1a28]/95 backdrop-blur-xl border border-[#2a2a3e] rounded-3xl shadow-[0_30px_80px_rgba(0,0,0,0.7)] w-72 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300">

          {menuView === 'main' ? (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-[#2a2a3e] flex items-center gap-3">
                <div className="p-2 bg-[#00ff88]/10 rounded-xl">
                  <Zap className="text-[#00ff88]" size={16} />
                </div>
                <div>
                  <div className="text-sm font-black text-white">Artis Nova</div>
                  <div className="text-[10px] text-[#606080] uppercase tracking-wider">DSP Processor</div>
                </div>
              </div>

              {/* View Mode Section */}
              <div className="p-2">
                <div className="px-3 pt-2 pb-1 text-[9px] text-[#404060] font-black uppercase tracking-[0.2em]">Navegación</div>
                <div className="space-y-0.5">
                  <button onClick={() => { setActiveMode('playback'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeMode === 'playback' ? 'bg-[#ffaa00]/10 text-[#ffaa00]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><Play size={16} /><span className="text-sm font-bold">Reproducción</span></div>
                    {activeMode === 'playback' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <button onClick={() => { setActiveMode('processing'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeMode === 'processing' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><Activity size={16} /><span className="text-sm font-bold">Procesamiento</span></div>
                    {activeMode === 'processing' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <button onClick={() => { setActiveMode('lyrics'); setMenuOpen(false); }} disabled={!lyrics} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${!lyrics ? 'opacity-30 cursor-not-allowed' : activeMode === 'lyrics' ? 'bg-[#7b68ee]/10 text-[#7b68ee]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><MessageCircle size={16} /><span className="text-sm font-bold">Letras</span></div>
                    {activeMode === 'lyrics' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <button onClick={() => { setActiveMode('queue'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeMode === 'queue' ? 'bg-[#00d4ff]/10 text-[#00d4ff]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><Music size={16} /><span className="text-sm font-bold">Cola</span></div>
                    {activeMode === 'queue' && <Check size={14} strokeWidth={3} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Backend Section */}
              <div className="p-2">
                <div className="px-3 pt-1 pb-2 text-[9px] text-[#404060] font-black uppercase tracking-[0.2em]">Dispositivo</div>
                <div className="flex gap-2 px-1">
                  <button onClick={() => setBackend('local')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all ${backend === 'local' ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20' : 'bg-[#0a0a0f] border border-[#2a2a3e] text-[#606080]'}`}>
                    <Monitor size={14} /><span className="text-[11px] font-black">Local</span>
                    {backend === 'local' && <Check size={10} strokeWidth={4} />}
                  </button>
                  <button onClick={() => raspiOnline && setBackend('raspi')} disabled={!raspiOnline} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl transition-all ${!raspiOnline ? 'opacity-30 cursor-not-allowed bg-[#0a0a0f] border border-[#2a2a3e] text-[#606080]' : backend === 'raspi' ? 'bg-[#ff6b9d]/10 text-[#ff6b9d] border border-[#ff6b9d]/20' : 'bg-[#0a0a0f] border border-[#2a2a3e] text-[#606080]'}`}>
                    <Server size={14} /><span className="text-[11px] font-black">RPi</span>
                    {backend === 'raspi' && <Check size={10} strokeWidth={4} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Audio Config Trigger */}
              <div className="p-2">
                <button onClick={() => setMenuView('settings')} className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/5 text-[#909090] transition-all">
                  <div className="flex items-center gap-3">
                    <Settings size={16} />
                    <span className="text-sm font-bold">Configuración Audio</span>
                  </div>
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Theme Toggle */}
              <div className="p-2">
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="w-full flex items-center justify-between px-3 py-3 rounded-xl hover:bg-white/5 text-[#909090] transition-all">
                  <div className="flex items-center gap-3">
                    {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
                    <span className="text-sm font-bold">{theme === 'dark' ? 'Tema Oscuro' : 'Tema Claro'}</span>
                  </div>
                  <div className={`w-10 h-5 rounded-full relative transition-colors ${theme === 'light' ? 'bg-[#00d4ff]' : 'bg-[#2a2a3e]'}`}>
                    <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-all ${theme === 'light' ? 'left-5' : 'left-0.5'}`} />
                  </div>
                </button>
              </div>

              {/* Status Footer */}
              <div className="px-5 py-3 bg-[#0a0a0f] border-t border-[#2a2a3e] flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-[#00ff88] shadow-[0_0_8px_#00ff88]' : 'bg-[#ff4444]'}`} />
                  <span className="text-[9px] text-[#606080] font-black uppercase tracking-wider">{isRunning ? 'Active' : 'Stopped'}</span>
                </div>
                <span className="text-[9px] text-[#00d4ff] font-bold tracking-wider">{(sampleRate / 1000).toFixed(1)}K / {bitDepth}B</span>
              </div>
            </>
          ) : (
            <>
              {/* Settings Header */}
              <div className="px-4 py-3 border-b border-[#2a2a3e] flex items-center gap-2">
                <button onClick={() => setMenuView('main')} className="p-2 hover:bg-white/5 rounded-xl transition-all text-[#606080] hover:text-white">
                  <ChevronLeft size={18} />
                </button>
                <div className="text-sm font-black text-white">Configuración</div>
              </div>

              {/* Settings Content */}
              <div className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#606080] font-black uppercase tracking-widest px-1">Sample Rate</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[44100, 48000, 96000, 192000].map(sr => (
                      <button
                        key={sr}
                        onClick={() => setSampleRate(sr)}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${sampleRate === sr ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]' : 'bg-[#0a0a0f] border-[#2a2a3e] text-[#606080] hover:border-[#404060]'}`}
                      >
                        {(sr / 1000).toFixed(1)} kHz
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-[#606080] font-black uppercase tracking-widest px-1">Bit Depth</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[16, 24, 32].map(bd => (
                      <button
                        key={bd}
                        onClick={() => setBitDepth(bd)}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${bitDepth === bd ? 'bg-[#00d4ff]/10 border-[#00d4ff]/30 text-[#00d4ff]' : 'bg-[#0a0a0f] border-[#2a2a3e] text-[#606080] hover:border-[#404060]'}`}
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
                  Los cambios se aplican al reiniciar el motor DSP.
                </p>
              </div>
            </>
          )}
        </div>
      )}




      {/* MAIN CONTENT with safe area padding */}
      <div className="flex-1 min-h-0 min-w-0 p-2 md:p-3 pt-[max(3.5rem,calc(env(safe-area-inset-top)+2.5rem))] pb-[max(0.5rem,env(safe-area-inset-bottom))] pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))]">
        {renderLayout()}
      </div>

      {/* Floating Media Source & Zone Selector (Bottom Left) */}
      <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))] z-50 flex flex-col-reverse items-start gap-4">
        <button
          onClick={() => setSourcePopoverOpen(!sourcePopoverOpen)}
          className={`group p-4 rounded-full border backdrop-blur-xl transition-all shadow-[0_10px_40px_rgba(0,0,0,0.5)] ${sourcePopoverOpen ? 'bg-white/10 border-white/20 text-white' : 'bg-[#1a1a28]/80 border-[#2a2a3e] text-[#606080] hover:border-[#404060] hover:text-white'}`}
          title="Emisión"
        >
          <Cast size={24} className={mediaSource === 'apple' ? 'text-[#ffaa00]' : 'text-[#7b68ee]'} />
        </button>

        {sourcePopoverOpen && (
          <div className="flex items-end gap-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-300">
            {/* Main Source Selector */}
            <div className="bg-[#1a1a28]/95 backdrop-blur-2xl border border-[#2a2a3e] rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.7)] p-2.5 w-52">
              <div className="px-3 pt-2 pb-2 text-[10px] text-[#606080] font-black uppercase tracking-[0.2em] border-b border-[#2a2a3e]/50 mb-1">Fuente de Audio</div>
              <div className="space-y-1">
                <button
                  onClick={() => { setMediaSource('apple'); if (mediaSource === 'apple') setSourcePopoverOpen(false); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${mediaSource === 'apple' ? 'bg-[#ffaa00]/10 text-[#ffaa00]' : 'hover:bg-white/5 text-[#909090]'}`}
                >
                  <div className={`p-1.5 rounded-lg ${mediaSource === 'apple' ? 'bg-[#ffaa00]/20' : 'bg-white/5'}`}>
                    <Music size={14} />
                  </div>
                  <span className="text-sm font-bold">Apple Music</span>
                  {mediaSource === 'apple' && <Check size={14} strokeWidth={4} className="ml-auto" />}
                </button>
                <button
                  onClick={() => { setMediaSource('roon'); }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition-all ${mediaSource === 'roon' ? 'bg-[#7b68ee]/10 text-[#7b68ee]' : 'hover:bg-white/5 text-[#909090]'}`}
                >
                  <div className={`p-1.5 rounded-lg ${mediaSource === 'roon' ? 'bg-[#7b68ee]/20' : 'bg-white/5'}`}>
                    <Zap size={14} />
                  </div>
                  <span className="text-sm font-bold">Roon</span>
                  {mediaSource === 'roon' && <Check size={14} strokeWidth={4} className="ml-auto" />}
                </button>
              </div>
            </div>

            {/* Roon Zones Sub-menu (Show only if Roon is selected) */}
            {mediaSource === 'roon' && (
              <div className="bg-[#1a1a28]/95 backdrop-blur-2xl border border-[#2a2a3e] rounded-[2rem] shadow-[0_30px_80px_rgba(0,0,0,0.7)] p-2.5 w-56">
                <div className="px-3 pt-2 pb-2 text-[10px] text-[#606080] font-black uppercase tracking-[0.2em] border-b border-[#2a2a3e]/50 mb-1 flex items-center justify-between">
                  <span>Zonas Roon</span>
                  {roonZones.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-[#00ff88] shadow-[0_0_8px_#00ff88]" />}
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
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl transition-all ${zone.active ? 'bg-[#7b68ee]/10 text-[#7b68ee]' : 'hover:bg-white/5 text-[#606080]'}`}
                      >
                        <div className="flex flex-col items-start">
                          <span className="text-[11px] font-black uppercase tracking-wider">{zone.name}</span>
                          <span className="text-[9px] opacity-50 capitalize">{zone.state}</span>
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
