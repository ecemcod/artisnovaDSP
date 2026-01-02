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
import History from './components/History';
import SignalPathPopover from './components/SignalPathPopover';
import type { FilterParam } from './types';
import {
  Play, Save, Zap, SkipBack, SkipForward, Pause,
  Music, Activity, MessageCircle, Server, Monitor, Menu, ChevronRight, ChevronLeft, Check, Volume2, RefreshCcw, Cast, Upload, Target, Settings, PowerOff, Asterisk
} from 'lucide-react';
import './index.css';
import { parseRewFile } from './utils/rewParser';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const PROTOCOL = window.location.protocol;
const API_URL = `${PROTOCOL}//${API_HOST}:3000/api`;

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
const BG_COLOR_STORAGE_KEY = `artisNovaDSP_bgColor`;

// Dark background color options
const BACKGROUND_COLORS = [
  { id: 'noir', name: 'Midnight Noir', color: '#08080a' },
  { id: 'crimson', name: 'Crimson Shadow', color: '#2a0a0a' },
  { id: 'cobalt', name: 'Cobalt Night', color: '#0a0e2a' },
  { id: 'emerald', name: 'Deep Forest', color: '#0a2a12' },
  { id: 'amber', name: 'Burnt Orange', color: '#2a1e0a' },
  { id: 'purple', name: 'Imperial Purple', color: '#1c0a2a' },
  { id: 'teal', name: 'Deep Teal', color: '#0a2a2a' },
  { id: 'rose', name: 'Rose Ebony', color: '#2a0a1c' },
  { id: 'ocean', name: 'Ocean Depth', color: '#0a1c2a' },
  { id: 'olive', name: 'Golden Olive', color: '#262a0a' },
  { id: 'graphite', name: 'Graphite Noir', color: '#16161a' },
  { id: 'carbon', name: 'Dark Carbon', color: '#0e0e12' },
] as const;

type BgColorId = typeof BACKGROUND_COLORS[number]['id'];

interface SavedConfig {
  filters: FilterParam[];
  preamp: number;
  sampleRate: number | null;
  bitDepth: number;
  selectedPreset: string | null;
  activeMode?: 'playback' | 'processing' | 'lyrics' | 'queue' | 'history';
  backend?: 'local' | 'raspi';
  bypass?: boolean;
  bgColor?: BgColorId;
}

const BACKENDS = {
  local: { name: 'Local', wsUrl: `ws://${window.location.hostname}:5005` },
  raspi: { name: 'Raspberry Pi', wsUrl: 'ws://raspberrypi.local:5005' }
} as const;

type LayoutMode = 'playback' | 'processing' | 'lyrics' | 'queue' | 'history';

function App() {
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterParam[]>([]);
  const [preamp, setPreamp] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isBypass, setIsBypass] = useState(false);
  const [sampleRate, setSampleRate] = useState<number | null>(96000);
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
    style?: string;
    device?: string;
  }>({ state: 'unknown', track: '', artist: '', position: 0, duration: 0 });
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ track: string; artist: string; album?: string; artworkUrl?: string }[]>([]);
  const [backend, setBackend] = useState<'local' | 'raspi'>('local');
  const [raspiOnline, setRaspiOnline] = useState(false);
  const [activeMode, setActiveMode] = useState<LayoutMode>('processing');
  const [panelSizes, setPanelSizes] = useState<number[]>([55, 45]);
  const [isLayoutLoaded, setIsLayoutLoaded] = useState(false);
  const [volume, setVolume] = useState(50);
  const [bgColor, setBgColor] = useState<BgColorId>(() => {
    const saved = localStorage.getItem(BG_COLOR_STORAGE_KEY);
    return (saved as BgColorId) || 'noir';
  });
  const [currentTime, setCurrentTime] = useState(0);
  const [roonZones, setRoonZones] = useState<{ id: string, name: string, active: boolean, state: string }[]>([]);
  const [mediaSource, setMediaSource] = useState<'apple' | 'roon'>(() => {
    const saved = localStorage.getItem('artisNovaDSP_mediaSource');
    return (saved === 'roon' || saved === 'apple') ? saved : 'apple';
  });
  const [hostname, setHostname] = useState<string>('Local');
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [signalPathOpen, setSignalPathOpen] = useState(false);
  const [signalAnchorRect, setSignalAnchorRect] = useState<DOMRect | undefined>(undefined);
  const signalBtnRef = useRef<HTMLButtonElement>(null);
  const nowPlayingContainerRef = useRef<HTMLDivElement>(null);
  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const isSeeking = useRef(false);

  // DSP Context Configuration
  const [dspEnabledZones, setDspEnabledZones] = useState<string[]>(() => {
    const saved = localStorage.getItem('artisNovaDSP_dspZones');
    return saved ? JSON.parse(saved) : [];
  });

  const toggleDspZone = (zoneId: string) => {
    setDspEnabledZones(prev => {
      const next = prev.includes(zoneId) ? prev.filter(id => id !== zoneId) : [...prev, zoneId];
      localStorage.setItem('artisNovaDSP_dspZones', JSON.stringify(next));
      return next;
    });
  };

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

  // Persist Media Source and Restore Roon Zone
  useEffect(() => {
    localStorage.setItem('artisNovaDSP_mediaSource', mediaSource);
    if (mediaSource === 'roon') {
      const lastZone = localStorage.getItem('artisNovaDSP_lastRoonZone');
      if (lastZone) selectRoonZone(lastZone);
    }
  }, [mediaSource]);

  // Instant DSP State Detection
  const activeRoonZone = roonZones.find(z => z.active);
  // DSP is active if: Source is Apple OR (Source is Roon AND Zone ID is explicitly enabled)
  const isDspActive = mediaSource === 'apple' || (mediaSource === 'roon' && (!activeRoonZone || (activeRoonZone.id && dspEnabledZones.includes(activeRoonZone.id))));

  // Apply background color
  useEffect(() => {
    const selectedColor = BACKGROUND_COLORS.find(c => c.id === bgColor);
    if (selectedColor) {
      document.documentElement.style.setProperty('--bg-app', selectedColor.color);
      document.body.style.backgroundColor = selectedColor.color;
      localStorage.setItem(BG_COLOR_STORAGE_KEY, bgColor);
    }
  }, [bgColor]);

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

    // Fetch hostname
    axios.get(`${API_URL}/hostname`)
      .then(res => setHostname(res.data.hostname || 'Local'))
      .catch(() => setHostname('Local'));
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
  const [menuView, setMenuView] = useState<'main' | 'settings' | 'colors'>('main');
  const sideMenuRef = useRef<HTMLDivElement>(null);
  const sourceSelectorRef = useRef<HTMLDivElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sourceButtonRef = useRef<HTMLButtonElement>(null);
  const [menuActivity, setMenuActivity] = useState(0);
  const [sourceActivity, setSourceActivity] = useState(0);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Handle Side Menu
      if (menuOpen &&
        sideMenuRef.current &&
        !sideMenuRef.current.contains(event.target as Node) &&
        menuButtonRef.current &&
        !menuButtonRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }

      // Handle Source Selector
      if (sourcePopoverOpen &&
        sourceSelectorRef.current &&
        !sourceSelectorRef.current.contains(event.target as Node) &&
        sourceButtonRef.current &&
        !sourceButtonRef.current.contains(event.target as Node)) {
        setSourcePopoverOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen, sourcePopoverOpen]);

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
  }, [menuOpen, menuActivity, menuView]);

  useEffect(() => {
    if (sourcePopoverOpen) {
      const timer = setTimeout(() => setSourcePopoverOpen(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [sourcePopoverOpen, sourceActivity]);

  const fetchRoonZones = async () => {
    try {
      const res = await axios.get(`${API_URL}/media/roon/zones`);
      setRoonZones(res.data);
    } catch { }
  };

  const selectRoonZone = async (zoneId: string) => {
    localStorage.setItem('artisNovaDSP_lastRoonZone', zoneId);

    // Optimistic UI update for instant feedback
    setRoonZones(prev => prev.map(z => ({
      ...z,
      active: z.id === zoneId
    })));

    try {
      await axios.post(`${API_URL}/media/roon/select`, { zoneId });
      fetchRoonZones();
      setTimeout(fetchNowPlaying, 100); // Trigger immediate update
      setTimeout(fetchNowPlaying, 500); // Trigger separate check for latency
    } catch { }
  };

  // Poll for now playing info
  const fetchNowPlaying = async () => {
    try {
      const res = await axios.get(`${API_URL}/media/info?source=${mediaSource}`);
      if (res.data) {
        if (res.data.track !== nowPlaying.track) {
          setNowPlaying(res.data);
          fetchLyrics(res.data.track, res.data.artist, res.data.device);
        } else {
          setNowPlaying(prev => ({
            ...prev,
            state: res.data.state,
            position: res.data.position || 0,
            duration: res.data.duration || 0,
            // Ensure metadata updates even if track name is identical (e.g. same song, diff zone)
            signalPath: res.data.signalPath,
            artist: res.data.artist,
            album: res.data.album,
            artworkUrl: res.data.artworkUrl,
            style: res.data.style,
            device: res.data.device
          }));
        }
      }
    } catch { }
  };

  useEffect(() => {
    // Initial fetch
    fetchNowPlaying();

    // Poll loop
    const interval = setInterval(fetchNowPlaying, 1000);
    return () => clearInterval(interval);
  }, [mediaSource, nowPlaying.track, nowPlaying.state]);

  const fetchLyrics = async (track: string, artist: string, device?: string) => {
    if (!track || !artist) {
      setLyrics(null);
      return;
    }
    // Safety: If track matches device name, it's a Roon metadata artifact (e.g. AirPlay stream)
    if (device && track === device) {
      console.log('Skipping lyrics: Track equals Device name (Metadata artifact)');
      setLyrics(null);
      return;
    }
    try {
      const res = await axios.get(`${API_URL}/media/lyrics`, { params: { track, artist } });
      if (res.data.instrumental) {
        setLyrics("[INSTRUMENTAL]");
      } else {
        setLyrics(res.data.plain || null);
      }
    } catch {
      setLyrics(null);
    }
  };

  // Load saved config on mount
  // Track saved bypass preference for auto-start
  const savedBypassRef = useRef<boolean>(false);

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
        if (config.bypass) savedBypassRef.current = true; // Remember for auto-start
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

  // Save config whenever it changes (including bypass)
  useEffect(() => {
    if (!isLoaded) return;
    const config: SavedConfig = { filters, preamp, sampleRate, bitDepth, selectedPreset, activeMode, backend, bypass: isBypass };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [filters, preamp, sampleRate, bitDepth, selectedPreset, isLoaded, activeMode, backend, isBypass]);

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
      const res = await axios.get(`${API_URL}/media/queue?source=${mediaSource}`);
      setQueue(res.data.queue || []);
    } catch { }
  };

  useEffect(() => {
    loadPresets();
    checkStatus();
    fetchQueue();
    const statusInterval = setInterval(checkStatus, 1000);
    const queueInterval = setInterval(fetchQueue, 5000);
    return () => { clearInterval(statusInterval); clearInterval(queueInterval); };
  }, [mediaSource, nowPlaying.track]);

  const loadPresets = async () => { try { const res = await axios.get(`${API_URL}/presets`); setPresets(res.data || []); } catch { } };

  // Track if we've already attempted auto-start to avoid repeated attempts
  const hasAutoStartedRef = useRef(false);

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);
      setIsRunning(res.data.running);

      // Update sample rate and bit depth from server (dynamic update)
      if (res.data.running) {
        // Prefer explicit Roon rate if available (even if null), otherwise fallback to DSP rate
        if (res.data.roonSampleRate !== undefined) {
          setSampleRate(res.data.roonSampleRate);
        } else {
          setSampleRate(res.data.sampleRate > 0 ? res.data.sampleRate : null);
        }

        setBitDepth(res.data.bitDepth);
        setIsBypass(res.data.bypass || false);
      }

      // Auto-start CamillaDSP if not running (only on first load)
      if (!res.data.running && !hasAutoStartedRef.current) {
        hasAutoStartedRef.current = true;
        try {
          if (savedBypassRef.current) {
            console.log('Auto-starting CamillaDSP in BYPASS mode (saved preference)...');
            await axios.post(`${API_URL}/bypass`);
          } else {
            console.log('Auto-starting CamillaDSP...');
            await axios.post(`${API_URL}/start`, { directConfig: { filters, preamp }, sampleRate, bitDepth });
          }
        } catch (e) {
          console.log('Auto-start failed, will retry when user interacts');
        }
      }
    } catch { }
  };

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
    try { await axios.post(`${API_URL}/stop`); setIsBypass(false); await checkStatus(); }
    catch (err: any) { alert("Stop Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleBypass = async () => {
    try {
      if (isBypass) {
        // Exit bypass - return to normal DSP mode
        await axios.post(`${API_URL}/start`, { directConfig: { filters, preamp }, sampleRate, bitDepth });
      } else {
        // Enter bypass mode
        await axios.post(`${API_URL}/bypass`);
      }
      await checkStatus();
    }
    catch (err: any) { alert("Bypass Toggle Failed: " + (err.response?.data?.error || err.message)); }
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
      <div ref={nowPlayingContainerRef} className="h-full w-full relative overflow-clip group flex flex-col">
        {/* 1. Background - Dynamic "Solid" Color - Tinted by selected Bg Color */}
        <div className="absolute inset-0 z-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          {/* Subtle radial gradient for depth */}
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,_var(--accent-primary)_0%,_transparent_70%)]" />

          {nowPlaying.artworkUrl && (
            <img
              src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`}
              alt=""
              className="absolute inset-0 w-full h-full object-cover filter blur-[100px] scale-[5.0] saturate-150 opacity-30"
            />
          )}
        </div>

        {/* 2. Content Layer */}
        <div className="flex-1 overflow-y-auto custom-scrollbar pt-8 md:pt-12 relative z-20 flex flex-col">

          {/* Main Content Container - Vertically Centered */}
          <div className="w-full max-w-lg mx-auto flex flex-col justify-center flex-1 min-h-0">

            {/* Artwork - Larger Size */}
            <div className="aspect-square w-full max-w-[380px] mx-auto mb-8 md:mb-12 relative group/art">
              <div className="absolute inset-0 bg-black/40 rounded-2xl transform translate-y-2 blur-xl opacity-50" />
              <div className="relative w-full h-full bg-white/5 rounded-2xl overflow-hidden shadow-2xl">
                {nowPlaying.artworkUrl ? (
                  <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="Album Art" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20"><Music size={64} strokeWidth={1} /></div>
                )}
              </div>
            </div>

            {/* Track Info & Actions - Centered */}
            <div className="w-full flex flex-col items-center text-center mb-8 px-2">
              <div className="w-full relative">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <h2 className="text-xl md:text-3xl font-bold text-white leading-tight line-clamp-2">{nowPlaying.track || 'Not Playing'}</h2>
                  <button
                    ref={signalBtnRef}
                    onClick={(e) => {
                      setSignalAnchorRect(e.currentTarget.getBoundingClientRect());
                      setSignalPathOpen(!signalPathOpen);
                    }}
                    style={{
                      backgroundColor: '#000000',
                      color: '#ffffff',
                      borderColor: '#000000',
                      borderWidth: '2px',
                      borderStyle: 'solid'
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-xl active:scale-90`}
                    title="Signal Path"
                  >
                    <Asterisk size={16} strokeWidth={3} style={{ color: '#ffffff' }} />
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-base md:text-lg text-white/60 font-medium truncate max-w-[95%]">
                    <span className="font-bold text-white/80">{nowPlaying.album || 'No Album Info'}</span> — {nowPlaying.artist || 'System Ready'}
                  </p>
                  {nowPlaying.style && (
                    <div className="mt-4 animate-in fade-in slide-in-from-top-1 duration-500">
                      <span className="inline-block px-10 py-1.5 rounded-full bg-white/5 text-[10px] font-bold uppercase text-accent-secondary border border-white/10 shadow-sm backdrop-blur-md">
                        {nowPlaying.style}
                      </span>
                    </div>
                  )}
                </div>
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
              <div className="flex items-center justify-center gap-6 mb-12">
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

              {/* Resolution Badge / Separator */}
              <div
                className="text-[10px] font-black tracking-[0.3em] leading-none select-none py-8 text-center uppercase"
                style={{ color: '#9b59b6' }}
              >
                {isDspActive ? (sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz — ${bitDepth} bits` : 'Unknown') : 'Direct Mode'}
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
              {nowPlaying.device && (
                <div className="mt-4 text-center animate-in fade-in duration-700 delay-150">
                  <span className="text-[10px] text-white/30 font-black uppercase tracking-[0.25em]">{nowPlaying.device}</span>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    );
  };


  // Render Processing Tools
  const renderProcessingTools = () => {
    // If we're playing to an external zone (Direct Mode), show unavailable message
    if (!isDspActive) {
      return (
        <div className="flex-1 flex flex-col h-full min-h-0 bg-themed-deep items-center justify-center p-8 text-center space-y-4">
          <div className="p-4 bg-white/5 rounded-full mb-2">
            <Target size={48} className="text-themed-muted opacity-50" />
          </div>
          <h2 className="text-xl font-bold text-themed-primary">Processing Unavailable</h2>
          <p className="text-sm text-themed-muted max-w-md">
            Audio is being routed directly to an external device (Direct Mode).
            DSP processing, VU meters, and PEQ are only available when playing through CamillaDSP.
          </p>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#9b59b6] font-bold mt-4 mb-6">
              External Playback Active
            </div>

            {activeRoonZone && (
              <button
                onClick={() => toggleDspZone(activeRoonZone.id)}
                className="px-6 py-3 bg-themed-panel border border-themed-medium rounded-xl hover:bg-white/5 hover:border-themed-subtle transition-all flex items-center gap-3 group"
              >
                <Zap size={16} className="text-accent-primary group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <div className="text-[10px] font-black uppercase text-themed-muted tracking-wider">Enable DSP for</div>
                  <div className="text-sm font-bold text-themed-primary">{activeRoonZone.name}</div>
                </div>
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-themed-deep overflow-hidden">
        <div className="flex-1 flex flex-col h-full p-3 md:p-8 pt-14 md:pt-20 space-y-2 md:space-y-4 overflow-hidden">

          {/* 1. ANALOG MONITORING - Flexible Height (Constrained to ~30% of view) */}
          <div className="flex-none h-[25%] md:h-[30%] min-h-[120px] md:min-h-[200px] flex flex-col">
            <VUMeter isRunning={isRunning} wsUrl={BACKENDS[backend].wsUrl} className="flex-1" />
          </div>



          {/* 2. INTEGRATED PEQ EDITOR, ANALYZER & BANDS - Fills remaining space */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-4 md:p-8 shadow-lg mb-4 flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="flex items-center gap-3 mb-6 shrink-0">
              <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
              <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">PEQ Editor, Analyzer & Bands</span>
            </div>

            <div className="flex-1 flex flex-col gap-6 md:gap-10 min-h-0 overflow-hidden">
              {/* Part 1: Analyzer */}
              <div className="h-[220px] md:h-[400px] shrink-0">
                <FilterGraph filters={filters} preamp={preamp} />
              </div>

              {/* Part 2: Controls Row (Left Aligned) */}
              <div className="flex flex-nowrap items-center justify-start gap-5 md:gap-12 overflow-x-auto custom-scrollbar pb-1 shrink-0">
                {/* Presets */}
                <div className="flex flex-col">
                  <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1.5">Presets</span>
                  <div className="flex items-center gap-2">
                    <select value={selectedPreset || ''} onChange={e => {
                      const val = e.target.value;
                      if (val) selectPreset(val);
                      else handleNewPreset();
                    }} className="bg-themed-deep border border-themed-medium rounded-lg px-2.5 py-2 text-[11px] text-accent-primary font-black outline-none transition-colors hover:border-accent-primary min-w-[110px] md:min-w-[160px]">
                      <option value="">+ New</option>
                      {presets.map(p => <option key={p} value={p}>{p.replace('.txt', '')}</option>)}
                    </select>
                    <button onClick={handleSave} className="p-2 bg-themed-deep border border-themed-medium text-themed-muted hover:text-accent-primary hover:border-accent-primary rounded-lg transition-all shrink-0" title="Save Preset"><Save size={15} /></button>



                  </div>
                </div>

                {/* Gain */}
                <div className="flex flex-col">
                  <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.15em] mb-1.5">Gain</span>
                  <div className="flex items-center gap-1.5">
                    <div className="flex items-center gap-1.5 bg-themed-deep border border-themed-medium rounded-lg px-2 py-1">
                      <input type="number" step={0.1} value={preamp || 0} onChange={e => setPreamp(Number(e.target.value) || 0)} className="w-[52px] md:w-[72px] bg-transparent text-center text-[11px] text-accent-warning font-mono font-black outline-none" />
                      <span className="text-[8px] text-themed-muted font-black">dB</span>
                    </div>
                  </div>
                </div>

                {/* Engine */}
                <div className="flex flex-col">
                  <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1.5">DSP Engine</span>
                  <div className="flex items-center gap-2">
                    {!isRunning ? (
                      <button onClick={handleStart} className="w-18 md:w-24 py-2 bg-accent-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">START</button>
                    ) : (
                      <div className="flex items-center gap-2">
                        {!isBypass && (
                          <button onClick={handleStart} className="bg-white/10 hover:bg-white/20 text-accent-success p-2 rounded-lg transition-colors border border-themed-subtle shrink-0" title="Reload Settings"><RefreshCcw size={14} /></button>
                        )}
                        <button onClick={handleStop} className="w-18 md:w-24 py-2 bg-accent-danger text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">STOP</button>
                        {/* Separator */}
                        <div className="w-px h-6 bg-themed-medium mx-1" />
                        {/* Bypass Toggle */}
                        <button
                          onClick={handleBypass}
                          className={`w-18 md:w-24 py-2 ${isBypass ? 'bg-amber-500 ring-2 ring-amber-400/50' : 'bg-amber-600/60 hover:bg-amber-600'} text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all`}
                          title={isBypass ? "Exit Bypass Mode" : "Enter Bypass Mode"}
                        >
                          {isBypass ? '● BYP' : 'BYPASS'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tools */}
                <div className="flex flex-col">
                  <span className="text-[8px] text-themed-muted font-black uppercase tracking-[0.2em] mb-1.5">Tools</span>
                  <div className="flex items-center gap-2">
                    {/* REW Import Button */}
                    <div className="relative group/rew">
                      <button
                        onClick={() => document.getElementById('rew-upload')?.click()}
                        className="p-2 bg-themed-deep border border-themed-medium text-themed-muted hover:text-accent-warning hover:border-accent-warning rounded-lg transition-all shrink-0"
                        title="Import REW Filter"
                      >
                        <Upload size={15} />
                      </button>
                      <input
                        type="file"
                        id="rew-upload"
                        accept=".txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => {
                            const content = ev.target?.result as string;
                            if (content) {
                              const newFilters = parseRewFile(content);
                              if (newFilters.length > 0) {
                                setFilters(newFilters);
                                alert(`Imported ${newFilters.length} filters from REW!`);
                                e.target.value = '';
                              } else {
                                alert('No valid filters found in file.');
                              }
                            }
                          };
                          reader.readAsText(file);
                        }}
                      />
                      {/* Tooltip */}
                      <div className="absolute bottom-full mb-2 right-0 hidden group-hover/rew:block w-48 p-2 bg-black/90 border border-themed-subtle rounded-lg text-[10px] text-gray-300 z-50 pointer-events-none shadow-xl backdrop-blur-md">
                        <p className="font-bold text-white mb-1">Import REW Filters</p>
                        Export your filters from REW as text (File &gt; Export &gt; Filter Settings as text) and select the file here.
                      </div>
                    </div>

                    {/* Disable DSP Button (Symmetrical Action) */}
                    {isDspActive && mediaSource === 'roon' && activeRoonZone && (
                      <button
                        onClick={() => toggleDspZone(activeRoonZone.id)}
                        className="p-2 bg-themed-deep border border-themed-medium text-themed-muted hover:text-accent-danger hover:border-accent-danger rounded-lg transition-all shrink-0"
                        title={`Disable DSP for ${activeRoonZone.name} (Direct Mode)`}
                      >
                        <PowerOff size={15} />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Part 3: PEQ Editor Bands - Internal Scrollable */}
              <div className="flex-1 min-h-0 pt-4 border-t border-themed-subtle overflow-y-auto custom-scrollbar">
                <PEQEditor filters={filters} onChange={setFilters} />
              </div>
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
        case 'queue': return <PlayQueue queue={queue} mediaSource={mediaSource} />;
        case 'history': return <History />;
        default: return renderNowPlaying();
      }
    }
    if (activeMode === 'playback') {
      return (
        <div className="h-full flex flex-col md:flex-row min-h-0 gap-6 md:gap-10 p-4 md:p-8 bg-themed-deep">
          <div className="flex-[2] min-h-0 flex flex-col">
            {renderNowPlaying()}
          </div>
          <div ref={secondaryContainerRef} className="flex-1 min-w-[300px] max-w-sm hidden lg:flex flex-col">
            <PlayQueue queue={queue} mediaSource={mediaSource} />
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
          <div ref={secondaryContainerRef} className="h-full w-full flex flex-col">
            {/* 3. LYRICS/QUEUE/HISTORY/PROCESSING - Based on activeMode */}
            {activeMode === 'processing' && renderProcessingTools()}
            {activeMode === 'lyrics' && <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />}
            {activeMode === 'queue' && <PlayQueue queue={queue} mediaSource={mediaSource} />}
            {activeMode === 'history' && <History />}
          </div>
        </Panel>
      </Group>
    );
  };

  return (
    <div
      className="flex flex-col h-[100dvh] w-screen bg-themed-deep text-themed-primary overflow-clip transition-all duration-700 ease-in-out"
      style={{ backgroundColor: 'var(--bg-app)' }}
    >
      {/* FLOATING MENU BUTTON - Safe area padding for mobile */}
      <button
        ref={menuButtonRef}
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] z-50 p-3 rounded-xl shadow-xl hover:opacity-80 transition-all active:scale-95"
        style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
      >
        <Menu size={20} style={{ color: '#ffffff' }} />
      </button>

      {/* DROPDOWN MENU */}
      {menuOpen && (
        <div
          ref={sideMenuRef}
          onMouseDown={() => setMenuActivity(Date.now())}
          className="fixed top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-[max(1rem,env(safe-area-inset-left))] z-50 border border-themed-medium rounded-xl shadow-[0_20px_50px_rgba(0,0,0,1)] w-72 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300"
          style={{ backgroundColor: '#000000' }}
        >

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

              {/* Backend Section */}
              <div className="p-2">
                <div className="px-3 pt-1 pb-2 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Device</div>
                <div className="flex gap-2 px-1">
                  <button onClick={() => setBackend('local')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all ${backend === 'local' ? 'border border-accent-primary/20' : 'bg-themed-deep border border-themed-medium text-themed-muted hover:border-themed-secondary'}`} style={{ backgroundColor: backend === 'local' ? '#000000' : 'transparent', color: '#ffffff' }}>
                    <Monitor size={14} /><span className="text-[11px] font-black truncate max-w-[100px]">{hostname}</span>
                    {backend === 'local' && <Check size={10} strokeWidth={4} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => raspiOnline && setBackend('raspi')} disabled={!raspiOnline} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all ${!raspiOnline ? 'opacity-30 cursor-not-allowed bg-themed-deep border border-themed-medium text-themed-muted' : backend === 'raspi' ? 'border border-accent-primary/20' : 'bg-themed-deep border border-themed-medium text-themed-muted hover:border-themed-secondary'}`} style={{ backgroundColor: backend === 'raspi' ? '#000000' : 'transparent', color: '#ffffff' }}>
                    <Server size={14} /><span className="text-[11px] font-black">RPi</span>
                    {backend === 'raspi' && <Check size={10} strokeWidth={4} style={{ color: '#ffffff' }} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-themed-subtle my-1" />

              {/* View Mode Section */}
              <div className="p-2">
                <div className="px-3 pt-2 pb-1 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Navigation</div>
                <div className="space-y-0.5">
                  <button onClick={() => { setActiveMode('playback'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'playback' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Play size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Playback Only</span></div>
                    {activeMode === 'playback' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('processing'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'processing' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Activity size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Processing</span></div>
                    {activeMode === 'processing' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>

                  <button onClick={() => { setActiveMode('lyrics'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'lyrics' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><MessageCircle size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Lyrics</span></div>
                    {activeMode === 'lyrics' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('queue'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'queue' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><Music size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">Queue</span></div>
                    {activeMode === 'queue' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                  <button onClick={() => { setActiveMode('history'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'history' ? 'bg-accent-primary/10 text-accent-primary' : 'hover:bg-white/5 text-themed-secondary'}`}>
                    <div className="flex items-center gap-3"><RefreshCcw size={16} style={{ color: '#ffffff' }} /><span className="text-sm font-bold">History</span></div>
                    {activeMode === 'history' && <Check size={14} strokeWidth={3} style={{ color: '#ffffff' }} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Settings Trigger */}
              <div className="p-2">
                <button onClick={() => setMenuView('settings')} className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-white/5 text-themed-secondary transition-all">
                  <div className="flex items-center gap-3">
                    <Settings size={18} style={{ color: '#ffffff' }} />
                    <span className="text-sm font-bold">Settings</span>
                  </div>
                  <ChevronRight size={16} style={{ color: '#ffffff' }} />
                </button>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Background Color Submenu Trigger */}
              <div className="p-2">
                <button onClick={() => setMenuView('colors')} className="w-full flex items-center justify-between px-3 py-3 rounded-lg hover:bg-white/5 text-themed-secondary transition-all">
                  <div className="flex items-center gap-3">
                    <div className="w-5 h-5 rounded-sm border border-white/40 shadow-lg" style={{ backgroundColor: BACKGROUND_COLORS.find(c => c.id === bgColor)?.color || '#000000' }} />
                    <span className="text-sm font-bold">Background Color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-themed-muted font-black uppercase tracking-widest truncate max-w-[80px]">{BACKGROUND_COLORS.find(c => c.id === bgColor)?.name}</span>
                    <ChevronRight size={16} style={{ color: '#ffffff' }} />
                  </div>
                </button>
              </div>

              {/* Status Footer */}
              <div className="px-5 py-3 bg-themed-deep border-t border-themed-subtle flex items-center justify-between">
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-themed-subtle">
                  <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-accent-primary shadow-[0_0_8px_var(--glow-cyan)]' : 'bg-accent-danger'}`} />
                  <span className="text-[10px] font-black text-themed-muted uppercase tracking-widest">{isRunning ? 'DSP ON' : 'DSP OFF'}</span>
                </div>
                <span className="text-[9px] text-accent-primary font-black tracking-widest">{isDspActive ? (sampleRate ? `${(sampleRate / 1000).toFixed(1)}K / ${bitDepth}B` : '--') : 'DIRECT'}</span>
              </div>
            </>
          ) : menuView === 'settings' ? (
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
                  <div className="grid grid-cols-2 gap-2">
                    {[16, 24, 32].map(bd => (
                      <button
                        key={bd}
                        onClick={() => setBitDepth(bd as 16 | 24 | 32)}
                        className={`px-3 py-2 rounded-lg text-[11px] font-bold border transition-all ${bitDepth === bd ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary' : 'bg-themed-deep border-themed-medium text-themed-muted hover:border-themed-secondary'}`}
                      >
                        {bd} bit
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2 border-t border-themed-subtle">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">DSP Enabled Zones</label>
                  <div className="space-y-1">
                    {roonZones.length === 0 ? <div className="text-[10px] text-themed-muted italic px-2">No Roon zones found</div> :
                      roonZones.map(zone => (
                        <button
                          key={zone.id}
                          onClick={() => toggleDspZone(zone.id)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-all ${dspEnabledZones.includes(zone.id) ? 'bg-accent-primary/10 border-accent-primary/30 text-accent-primary' : 'bg-themed-deep border-themed-medium text-themed-muted hover:border-themed-secondary'}`}
                        >
                          <span className="text-[11px] font-bold">{zone.name}</span>
                          <div className={`w-8 h-4 rounded-full relative transition-colors ${dspEnabledZones.includes(zone.id) ? 'bg-accent-primary' : 'bg-themed-medium'}`}>
                            <div className={`absolute top-0.5 bottom-0.5 w-3 h-3 rounded-full bg-white transition-all shadow-sm ${dspEnabledZones.includes(zone.id) ? 'right-0.5' : 'left-0.5'}`} />
                          </div>
                        </button>
                      ))
                    }
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Colors Header */}
              <div className="px-4 py-3 border-b border-themed-subtle flex items-center gap-2">
                <button onClick={() => setMenuView('main')} className="p-2 hover:bg-white/5 rounded-lg transition-all text-themed-muted hover:text-themed-primary">
                  <ChevronLeft size={18} />
                </button>
                <div className="text-sm font-black text-themed-primary header-text">Background Color</div>
              </div>

              {/* Colors Content */}
              <div className="p-2 overflow-y-auto max-h-[400px] custom-scrollbar">
                <div className="grid grid-cols-1 gap-0.5">
                  {BACKGROUND_COLORS.map(colorObj => (
                    <button
                      key={colorObj.id}
                      onClick={() => {
                        setBgColor(colorObj.id);
                      }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all ${bgColor === colorObj.id ? 'bg-white/10 ring-1 ring-white/20' : 'hover:bg-white/5'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-sm border transition-all ${bgColor === colorObj.id ? 'border-white/80 scale-110 shadow-[0_0_10px_rgba(255,255,255,0.3)]' : 'border-white/20'}`}
                          style={{ backgroundColor: colorObj.color }}
                        />
                        <span className={`text-sm font-bold ${bgColor === colorObj.id ? 'text-accent-primary' : 'text-themed-secondary'}`}>
                          {colorObj.name}
                        </span>
                      </div>
                      {bgColor === colorObj.id && <Check size={16} strokeWidth={3} className="text-accent-primary" />}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          {/* Auto-save hint */}
          <div className="px-6 py-4 text-center">
            <p className="text-[10px] text-[#404060] font-medium leading-relaxed italic">
              Changes are applied when the DSP engine is restarted.
            </p>
          </div>
        </div>
      )
      }




      {/* MAIN CONTENT with safe area padding */}
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {renderLayout()}
      </div>

      {/* Floating Media Source & Zone Selector (Bottom Left) */}
      <div className="fixed bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.5rem,env(safe-area-inset-left))] z-50 flex flex-col-reverse items-start gap-4">
        <button
          ref={sourceButtonRef}
          onClick={() => setSourcePopoverOpen(!sourcePopoverOpen)}
          className="group p-4 rounded-full shadow-xl active:scale-95 transition-all"
          style={{ backgroundColor: '#000000', color: '#ffffff', border: 'none', outline: 'none' }}
          title="Direct Source"
        >
          <Cast size={24} style={{ color: '#ffffff' }} />
        </button>

        {sourcePopoverOpen && (
          <div
            ref={sourceSelectorRef}
            onMouseDown={() => setSourceActivity(Date.now())}
            className="flex items-end gap-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-300"
          >
            {/* Main Source Selector */}
            <div className="bg-black border border-themed-medium rounded-xl shadow-2xl p-2.5 w-52">
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
              <div className="bg-black border border-themed-medium rounded-xl shadow-2xl p-2.5 w-56">
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

      <SignalPathPopover
        isOpen={signalPathOpen}
        onClose={() => setSignalPathOpen(false)}
        nodes={nowPlaying.signalPath?.nodes || []}
        quality={nowPlaying.signalPath?.quality}
        anchorRect={signalAnchorRect}
        nowPlayingRect={nowPlayingContainerRef.current?.getBoundingClientRect()}
        secondaryRect={secondaryContainerRef.current?.getBoundingClientRect()}
      />
    </div >
  );
}

export default App;
