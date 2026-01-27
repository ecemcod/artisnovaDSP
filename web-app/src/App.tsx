import { useEffect, useState, useRef, useCallback } from 'react';
import axios from 'axios';
import FilterGraph from './components/FilterGraph';
import PEQEditor from './components/PEQEditor';
import VisualizationPage from './components/VisualizationPage';
import { SimpleNavigationProvider } from './components/SimpleNavigationProvider';
import { SimpleMusicNavigationView } from './components/SimpleMusicNavigationView';
import ArtistInfo from './components/ArtistInfo';
import { createPortal } from 'react-dom';
import {
  Panel,
  Group,
  Separator,
} from "react-resizable-panels";
import PlayQueue from './components/PlayQueue';
import Lyrics from './components/Lyrics';
import History from './components/History';
import { ErrorBoundary } from './components/ErrorBoundary';
// import { DebugComponent } from './components/DebugComponent';
import SignalPathPopover from './components/SignalPathPopover';
import type { FilterParam } from './types';
import {
  Play, Save, Zap, SkipBack, SkipForward, Pause,
  Music, Activity, MessageCircle, Server, Monitor, Menu, ChevronRight, ChevronLeft, Check, Volume2, RefreshCcw, Cast, Upload, Settings, Asterisk, Gauge, Power, X, ExternalLink, BookOpen
} from 'lucide-react';
import './index.css';
import './App.css';
import { parseRewFile } from './utils/rewParser';
import { AppStorage } from './utils/storage';
import { extractDominantColor, generateDynamicBackgroundCSS } from './utils/colorExtractor';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const PROTOCOL = window.location.protocol;
const API_BASE = `${PROTOCOL}//${API_HOST}:3001`;
const API_URL = `${API_BASE}/api`;

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

const resolveArtworkUrl = (url?: string | null, retryKey?: number) => {
  if (!url) return null;

  // If it's already a full URL, return it
  if (url.startsWith('http')) return url;

  // For relative API paths, ensure they work regardless of hostname/port
  // Use relative path if we are on the same origin (standard for production build)
  const isProd = import.meta.env.PROD || window.location.port !== '5173';
  const baseUrl = isProd ? '' : API_BASE;

  let finalUrl = `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

  if (retryKey && retryKey > 0) {
    const separator = finalUrl.includes('?') ? '&' : '?';
    finalUrl += `${separator}retry=${retryKey}`;
  }
  return finalUrl;
};

// Dark background color options
const BACKGROUND_COLORS = [
  { id: 'dynamic', name: 'Dynamic Album', color: 'dynamic' }, // Nueva opción dinámica
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
  activeMode?: 'playback' | 'processing' | 'lyrics' | 'info' | 'queue' | 'history' | 'visualization' | 'navigation';
  backend?: 'local' | 'raspi';
  bypass?: boolean;
  bgColor?: BgColorId;
}

const BACKENDS = {
  local: { name: 'Local', wsUrl: `ws://${window.location.hostname}:5005` },
  raspi: { name: 'Raspberry Pi', wsUrl: 'ws://raspberrypi.local:1234' }
} as const;

type LayoutMode = 'playback' | 'processing' | 'lyrics' | 'info' | 'queue' | 'history' | 'visualization' | 'navigation';

function App() {
  // Add global error handlers
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error('Global JavaScript Error:', event.error);
      console.error('Error message:', event.message);
      console.error('Error filename:', event.filename);
      console.error('Error line:', event.lineno);
      console.error('Error column:', event.colno);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled Promise Rejection:', event.reason);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, []);

  return (
    <SimpleNavigationProvider>
      <AppContent />
    </SimpleNavigationProvider>
  );
}

function AppContent() {
  // Wrap the entire component in error boundary
  return (
    <ErrorBoundary>
      <AppContentInner />
    </ErrorBoundary>
  );
}

function AppContentInner() {
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterParam[]>([]);
  const [preamp, setPreamp] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [isBypass, setIsBypass] = useState(() => {
    const saved = AppStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const config = JSON.parse(saved);
        return !!config.bypass;
      } catch { }
    }
    return false;
  });
  const [isAutoMuted, setIsAutoMuted] = useState(false); // New: Tracks auto-mute status
  const [sampleRate, setSampleRate] = useState<number | null>(96000);
  const [bitDepth, setBitDepth] = useState(24);
  const [isLoaded, setIsLoaded] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{
    state: string;
    track: string;
    artist: string;
    album?: string;
    year?: string | number;
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
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ track: string; artist: string; album?: string; artworkUrl?: string }[]>([]);
  const [backend, setBackend] = useState<'local' | 'raspi'>('local');
  const [raspiOnline, setRaspiOnline] = useState(false);
  const [activeMode, setActiveMode] = useState<LayoutMode>(() => {
    const saved = AppStorage.getItem('artisNovaDSP_activeMode');
    const savedMode = saved as LayoutMode;
    // Temporarily redirect 'navigation' mode to 'processing' until Music Explorer is ready
    if (savedMode === 'navigation') {
      return 'processing';
    }
    return savedMode || 'processing';
  });
  const [panelSizes, setPanelSizes] = useState<number[]>([55, 45]);
  const [isLayoutLoaded, setIsLayoutLoaded] = useState(false);
  const [volume, setVolume] = useState(50);
  const [bgColor, setBgColor] = useState<BgColorId>(() => {
    const saved = AppStorage.getItem(BG_COLOR_STORAGE_KEY);
    return (saved as BgColorId) || 'noir';
  });
  const [dynamicBgColor, setDynamicBgColor] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [mediaZones, setMediaZones] = useState<{ id: string, name: string, active: boolean, state: string, source: 'apple' | 'roon' | 'lms' }[]>([]);
  const [mediaSource, setMediaSource] = useState<'apple' | 'roon' | 'lms'>(() => {
    const saved = AppStorage.getItem('artisNovaDSP_mediaSource');
    return (saved === 'roon' || saved === 'apple' || saved === 'lms') ? saved : 'apple';
  });
  const [hostname, setHostname] = useState<string>('Local');
  const [sourcePopoverOpen, setSourcePopoverOpen] = useState(false);
  const [signalPathOpen, setSignalPathOpen] = useState(false);
  const [signalAnchorRect, setSignalAnchorRect] = useState<DOMRect | undefined>(undefined);
  const signalBtnRef = useRef<HTMLButtonElement>(null);
  const nowPlayingContainerRef = useRef<HTMLDivElement>(null);
  const secondaryContainerRef = useRef<HTMLDivElement>(null);
  const [isDspManaged, setIsDspManaged] = useState(false);
  const [, setIsTrackChanging] = useState(false);
  const [artworkRetryKey, setArtworkRetryKey] = useState(0);
  const burstPollingRef = useRef<number | null>(null);
  // Debug function to force lyrics fetch (uncomment when debugging)
  // const debugForceLyricsFetch = () => {
  //   console.log('DEBUG: Forcing lyrics fetch for current track');
  //   // Clear cache
  //   lastPanelData.current.lyrics = { track: '', artist: '', lyrics: null };
  //   setLyrics(null);
  //   // Force fetch
  //   if (nowPlaying.track && nowPlaying.artist) {
  //     fetchLyrics(nowPlaying.track, nowPlaying.artist, nowPlaying.device);
  //   }
  // };

  // Cache system to prevent unnecessary panel refreshes
  const lastPanelData = useRef({
    lyrics: { track: '', artist: '', lyrics: null as string | null },
    artistInfo: { artist: '', album: '' },
    queue: { lastUpdate: 0, data: [] as any[] }
  });

  // Burst polling when track changes are detected - BALANCED for stability
  const startBurstPolling = () => {
    if (burstPollingRef.current) return; // Already burst polling

    console.log('App: Starting BALANCED burst polling for track change');
    setIsTrackChanging(true);

    let attempts = 0;
    const maxAttempts = 8; // Reduced from 12 to 8 attempts (4 seconds total)

    burstPollingRef.current = setInterval(() => {
      console.log(`App: Balanced burst poll attempt ${attempts + 1}/${maxAttempts}`);
      fetchNowPlayingRef.current();
      attempts++;

      if (attempts >= maxAttempts) {
        console.log('App: Ending balanced burst polling');
        if (burstPollingRef.current) {
          clearInterval(burstPollingRef.current);
          burstPollingRef.current = null;
        }
        setIsTrackChanging(false);
      }
    }, 250) as unknown as number; // Reduced from 500ms to 250ms for ultra-fast response
  };
  const [isArtworkModalOpen, setIsArtworkModalOpen] = useState(false); // New: Artwork Modal State
  const isSeeking = useRef(false);
  const mediaSourceRef = useRef(mediaSource);

  useEffect(() => {
    mediaSourceRef.current = mediaSource;
  }, [mediaSource]);

  const nowPlayingTrackRef = useRef(nowPlaying.track);
  useEffect(() => {
    nowPlayingTrackRef.current = nowPlaying.track;
  }, [nowPlaying.track]);

  const wsConnectedRef = useRef(false);
  const hasRestoredZoneRef = useRef(false);

  // DSP Context Configuration

  const [availableBackends, setAvailableBackends] = useState<{ id: string, name: string, wsUrl: string }[]>([]);
  const [fullZoneConfig, setFullZoneConfig] = useState<{ zones: Record<string, string>, defaults: { dspBackend: string } }>({ zones: {}, defaults: { dspBackend: 'local' } });
  const [settingsHost, setSettingsHost] = useState<'local' | 'raspi'>(backend);

  // Backend URL overrides (e.g. if .local doesn't work in browser)
  const [backendOverrides, setBackendOverrides] = useState<Record<string, string>>(() => {
    const saved = AppStorage.getItem('artisNovaDSP_backendOverrides');
    return saved ? JSON.parse(saved) : {};
  });

  const getActiveWsUrl = useCallback((backendId: string) => {
    if (backendOverrides[backendId]) return backendOverrides[backendId];
    const backend = availableBackends.find(b => b.id === backendId);
    if (backend) return backend.wsUrl;
    // Fallback to constants
    const fallback = (BACKENDS as any)[backendId];
    return fallback ? fallback.wsUrl : `ws://${window.location.hostname}:5005`;
  }, [backendOverrides, availableBackends, BACKENDS]);

  const updateBackendOverride = async (backendId: string, url: string) => {
    const next = { ...backendOverrides, [backendId]: url };
    setBackendOverrides(next);
    AppStorage.setItem('artisNovaDSP_backendOverrides', JSON.stringify(next));

    // Sync with server if it's an IP or custom host
    try {
      if (url.startsWith('ws://')) {
        const parts = url.replace('ws://', '').split(':');
        const host = parts[0];
        const port = parts[1] ? parseInt(parts[1]) : 5005;
        await axios.post(`${API_URL}/zones/backend-settings`, {
          backendId,
          settings: { host, port }
        });
      }
    } catch (err) {
      console.error('Failed to sync backend settings to server:', err);
    }
  };

  const fetchZoneConfig = async () => {
    try {
      const res = await axios.get(`${API_URL}/zones/config`);
      setAvailableBackends(res.data.backends || []);
      setFullZoneConfig({ zones: res.data.zones || {}, defaults: res.data.defaults || { dspBackend: 'local' } });
    } catch (err) {
      console.error('Failed to fetch zone config:', err);
    }
  };

  const updateZoneBackend = async (zoneName: string, backendId: string | null) => {
    try {
      await axios.post(`${API_URL}/zones/config`, { zoneId: zoneName, backend: backendId });
      fetchZoneConfig();
    } catch (err) {
      console.error('Failed to update zone backend:', err);
    }
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


  useEffect(() => {
    AppStorage.setItem('artisNovaDSP_mediaSource', mediaSource);

    // Initial Restoration: If we are on Roon and haven't restored yet, do it.
    if (!hasRestoredZoneRef.current && mediaSource === 'roon') {
      const lastZone = AppStorage.getItem('artisNovaDSP_lastRoonZone');
      if (lastZone) {
        console.log(`App: Restoring last Roon zone on mount/switch: ${lastZone}`);
        selectZone(lastZone, 'roon');
        hasRestoredZoneRef.current = true;
      }
    }
  }, [mediaSource]);

  // DSP is active if the backend says the zone is managed and it's running
  const isDspActive = isDspManaged && isRunning;

  // Auto-switch to playback mode if the current zone is not managed but we are in processing mode
  useEffect(() => {
    if (activeMode === 'processing' && !isDspManaged) {
      console.log('App: Auto-switching to playback mode (Zone not managed by DSP)');
      setActiveMode('playback');
    }
  }, [activeMode, isDspManaged]);

  // Apply background color
  useEffect(() => {
    const selectedColor = BACKGROUND_COLORS.find(c => c.id === bgColor);
    if (selectedColor) {
      if (bgColor === 'dynamic' && dynamicBgColor) {
        // Usar color dinámico extraído de la portada
        document.documentElement.style.setProperty('--bg-app', dynamicBgColor);
        document.body.style.backgroundColor = dynamicBgColor;

        // Aplicar CSS personalizado para colores dinámicos
        const dynamicCSS = generateDynamicBackgroundCSS(dynamicBgColor);
        let styleElement = document.getElementById('dynamic-bg-styles');
        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = 'dynamic-bg-styles';
          document.head.appendChild(styleElement);
        }
        styleElement.textContent = `:root { ${dynamicCSS} }`;
      } else if (selectedColor.color !== 'dynamic') {
        // Usar color fijo seleccionado
        document.documentElement.style.setProperty('--bg-app', selectedColor.color);
        document.body.style.backgroundColor = selectedColor.color;

        // Limpiar estilos dinámicos
        const styleElement = document.getElementById('dynamic-bg-styles');
        if (styleElement) {
          styleElement.remove();
        }
      }
      AppStorage.setItem(BG_COLOR_STORAGE_KEY, bgColor);
    }
  }, [bgColor, dynamicBgColor]);

  // Extract dynamic color from album artwork (Always available for components that need it)
  useEffect(() => {
    if (nowPlaying.artworkUrl) {
      const artworkUrl = resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey);
      if (artworkUrl) {
        extractDominantColor(artworkUrl)
          .then(color => {
            if (color) {
              // console.log('Extracted dynamic color:', color);
              setDynamicBgColor(color);
            }
          })
          .catch(err => {
            console.error('Failed to extract color:', err);
            // Fallback to default dark color
            setDynamicBgColor('#08080a');
          });
      }
    }
  }, [nowPlaying.artworkUrl, artworkRetryKey]);

  useEffect(() => {
    console.log("Artis Nova DSP v1.2.2 - Loading Layout...");
    const savedLayout = AppStorage.getItem(PANEL_STORAGE_KEY);
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

    fetchZoneConfig();
  }, []);


  useEffect(() => {
    // Save source preference independently
    AppStorage.setItem('artisNovaDSP_mediaSource', mediaSource);

    // Also update legacy config for backward compatibility, but don't depend on it for reading
    const saved = AppStorage.getItem(STORAGE_KEY);
    const config = saved ? JSON.parse(saved) : {};
    AppStorage.setItem(STORAGE_KEY, JSON.stringify({ ...config, mediaSource }));
  }, [mediaSource]);

  const onLayoutChange = (sizes: any) => {
    if (!isLayoutLoaded) return; // Guard against initial mount overwrite

    // Only save if different from current
    if (JSON.stringify(sizes) !== JSON.stringify(panelSizes)) {
      console.log('Saving layout:', sizes);
      setPanelSizes(sizes);
      AppStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(sizes));
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
      fetchMediaZones();
    }
  }, [menuOpen, sourcePopoverOpen]);

  // Periodic polling for zones when popover or menu is open
  useEffect(() => {
    if ((menuOpen || sourcePopoverOpen)) {
      const interval = setInterval(fetchMediaZones, 3000); // Reduced from 5000ms to 3000ms for faster zone updates
      return () => clearInterval(interval);
    }
  }, [menuOpen, sourcePopoverOpen]);

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

  const fetchMediaZones = async () => {
    try {
      const res = await axios.get(`${API_URL}/media/zones`);
      setMediaZones(res.data);
    } catch { }
  };

  const selectZone = async (zoneId: string, source: 'apple' | 'roon' | 'lms') => {
    console.log('selectZone called:', { zoneId, source });

    try {
      const targetZone = mediaZones.find(z => z.id === zoneId && z.source === source);
      console.log('targetZone found:', targetZone);

      // Optimistic UI update
      setMediaZones(prev => prev.map(z => ({
        ...z,
        active: z.id === zoneId && z.source === source
      })));

      if (source === 'apple') {
        console.log('Setting media source to apple');
        setMediaSource('apple');
        setBackend('local');
      } else if (source === 'roon') {
        console.log('Setting media source to roon, saving zone:', zoneId);
        AppStorage.setItem('artisNovaDSP_lastRoonZone', zoneId);
        setMediaSource('roon');

        // Context Awareness: Switch DSP backend based on Roon zone mapping
        if (targetZone) {
          const mappedBackend = fullZoneConfig?.zones?.[targetZone.name] || fullZoneConfig?.defaults?.dspBackend || 'local';
          console.log('Setting backend to:', mappedBackend);
          setBackend(mappedBackend as 'local' | 'raspi');
        }

        console.log('Making API call to select Roon zone');
        await axios.post(`${API_URL}/media/roon/select`, { zoneId });
      } else if (source === 'lms') {
        console.log('Setting media source to lms');
        setMediaSource('lms');
        setBackend('raspi'); // LMS is always on the Pi
        await axios.post(`${API_URL}/media/lms/select`, { playerId: zoneId });
      }

      console.log('Clearing lyrics and fetching media zones');
      setLyrics(null);
      fetchMediaZones();

      console.log('Fetching now playing data');
      setTimeout(fetchNowPlaying, 100);
      setTimeout(fetchNowPlaying, 500);

      console.log('selectZone completed successfully');
    } catch (error) {
      console.error('Error in selectZone:', error);
      // Don't throw the error, just log it
    }
  };

  // WebSocket for instantaneous updates - ULTRA-STABLE connection
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let reconnectAttempts = 0;
    const maxReconnectAttempts = 3; // Limit reconnection attempts

    const connect = () => {
      // Don't attempt if we've exceeded max attempts
      if (reconnectAttempts >= maxReconnectAttempts) {
        console.log('App: Max WebSocket reconnection attempts reached. Waiting 5 minutes before retry...');
        setTimeout(() => {
          reconnectAttempts = 0; // Reset attempts after long delay
          connect();
        }, 300000); // 5 minutes
        return;
      }

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.hostname}:3000`;
      console.log(`App: Connecting to metadata WebSocket (attempt ${reconnectAttempts + 1}):`, wsUrl);

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('App: Metadata WebSocket connected successfully');
        wsConnectedRef.current = true;
        reconnectAttempts = 0; // Reset attempts on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('App: WebSocket message received:', message.type);
          if (message.type === 'metadata_update') {
            // SYNC CHECK: Use Ref for current media source to be up to date
            const currentSource = mediaSourceRef.current;
            if (message.data?.source === currentSource || !message.data?.source) {
              console.log(`App: Relevant WS update (${message.data?.source || 'unknown'}). Updating STATE immediately.`);

              // INSTANT UPDATE: Use the data directly from WebSocket
              if (message.data?.info) {
                const newData = message.data.info;

                setNowPlaying(prev => {
                  // Detect track change
                  const trackChanged = newData.track !== prev.track || newData.artist !== prev.artist;

                  if (trackChanged) {
                    console.log(`App: INSTANT Update - Track changed to "${newData.track}"`);
                    // Reset lyrics on track change
                    setLyrics(null);
                    setArtworkRetryKey(0);

                    // Trigger lyrics fetch (redundant w/ server-side automation but good safety)
                    setTimeout(() => {
                      fetchLyrics(newData.track, newData.artist, newData.device);
                    }, 100);
                  }

                  return {
                    ...prev,
                    ...newData,
                    // Ensure defaults
                    state: newData.state || 'unknown',
                    track: newData.track || '',
                    artist: newData.artist || '',
                    album: newData.album || '',
                    position: newData.position || 0,
                    duration: newData.duration || 0
                  };
                });
              }

              // Still fetch to sync perfectly, but we are already visually updated
              // Reduced aggression since we have data
              fetchNowPlayingRef.current();

              if (message.data?.source === 'roon') {
                fetchMediaZones(); // Refresh zones when Roon update happens
              }
            } else {
              console.log(`App: Ignoring background metadata update from ${message.data?.source}`);
            }
          }
        } catch (e) {
          console.error('WS Message parsing error:', e);
        }
      };

      ws.onclose = () => {
        console.log('App: Metadata WebSocket closed. Implementing ULTRA-STABLE reconnection...');
        wsConnectedRef.current = false;
        reconnectAttempts++;

        // ULTRA-CONSERVATIVE reconnection with exponential backoff
        const baseDelay = 2000; // Start with 2 seconds
        const backoffDelay = Math.min(baseDelay * Math.pow(2, reconnectAttempts - 1), 30000); // Max 30s

        console.log(`App: Will reconnect in ${backoffDelay}ms (attempt ${reconnectAttempts}/${maxReconnectAttempts})`);
        reconnectTimeout = setTimeout(connect, backoffDelay);
      };

      ws.onerror = (err) => {
        console.warn('App: Metadata WebSocket error:', err);
        wsConnectedRef.current = false;
      };
    };

    connect();
    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const isFetchingRef = useRef(false);
  const fetchNowPlaying = useCallback(async () => {
    if (isFetchingRef.current) return;
    try {
      isFetchingRef.current = true;
      // ALWAYS use the latest ref for the source to avoid stale closure fetches
      const currentSource = mediaSourceRef.current;
      console.log(`App: Fetching now playing from ${currentSource}...`);
      const res = await axios.get(`${API_URL}/media/info?source=${currentSource}`, { timeout: 3000 });
      if (res.data && !res.data.error) {
        // STRICT SOURCE FILTER: Discard if source doesn't match current selection
        // This prevents "metadata flickering" when Roon background changes affect Apple/LMS view.
        if (res.data.source && res.data.source !== mediaSourceRef.current) {
          console.log(`App: Data source mismatch. Expected ${mediaSourceRef.current}, got ${res.data.source}. Ignoring.`);
          return;
        }

        // TRACK CHANGE: Full update
        if (res.data.track !== nowPlaying.track || res.data.artist !== nowPlaying.artist) {
          console.log(`App: Track changed from "${nowPlaying.track}" by "${nowPlaying.artist}" to "${res.data.track}" by "${res.data.artist}". Full state update.`);

          // Clear lyrics immediately when track changes to prevent showing wrong lyrics
          setLyrics(null);

          // CLEAR lyrics cache on track change to force fresh fetch
          lastPanelData.current.lyrics = {
            track: '',
            artist: '',
            lyrics: null
          };

          setNowPlaying(prev => ({
            ...prev,
            ...res.data,
            state: res.data.state || 'unknown',
            track: res.data.track || '',
            artist: res.data.artist || '',
            album: res.data.album || '',
            position: res.data.position || 0,
            duration: res.data.duration || 0
          }));
          nowPlayingTrackRef.current = res.data.track; // Update Ref immediately for fetchLyrics
          setArtworkRetryKey(0); // Reset retry on track change

          // Fetch lyrics with a small delay to ensure track info is stable
          setTimeout(() => {
            fetchLyrics(res.data.track, res.data.artist, res.data.device);
          }, 100);
        } else {
          // SAME TRACK: Only update dynamic fields (position, state, signalPath)
          setNowPlaying(prev => {
            // Stability checks - only update if actually different to minimize renders
            const stateChanged = res.data.state !== prev.state;
            const posChanged = Math.abs((res.data.position || 0) - prev.position) > 1;
            const pathChanged = JSON.stringify(res.data.signalPath) !== JSON.stringify(prev.signalPath);
            const artworkChanged = res.data.artworkUrl !== prev.artworkUrl;
            const yearChanged = res.data.year !== prev.year;
            const styleChanged = res.data.style !== prev.style;

            if (!stateChanged && !posChanged && !pathChanged && !artworkChanged && !yearChanged && !styleChanged) return prev;

            console.log(`App: Same track, updating dynamic fields - state: ${stateChanged}, pos: ${posChanged}, path: ${pathChanged}`);
            return {
              ...prev,
              state: res.data.state,
              position: res.data.position || 0,
              duration: res.data.duration || 0,
              signalPath: res.data.signalPath,
              artist: res.data.artist || prev.artist,
              album: res.data.album || prev.album,
              year: res.data.year ? res.data.year : prev.year,
              artworkUrl: res.data.artworkUrl ? res.data.artworkUrl : prev.artworkUrl,
              style: res.data.style ? res.data.style : prev.style,
              device: res.data.device || prev.device
            };
          });
        }
      }
    } catch (err: any) {
      console.warn('App: Fetch NowPlaying failed:', err.message);
    } finally {
      isFetchingRef.current = false;
    }
  }, [nowPlaying.track]); // Removed mediaSource dependency to avoid frequent re-creation

  const fetchNowPlayingRef = useRef(fetchNowPlaying);
  useEffect(() => {
    fetchNowPlayingRef.current = fetchNowPlaying;
  }, [fetchNowPlaying]);

  useEffect(() => {
    console.log('App: Starting STABLE now playing polling loop');
    fetchNowPlayingRef.current();
    const interval = setInterval(() => {
      // Only poll if WebSocket is disconnected to minimize traffic and conflicts
      if (!wsConnectedRef.current) {
        console.log('App: Polling now playing (WebSocket disconnected)');
        fetchNowPlayingRef.current();
      } else if (Math.random() < 0.1) { // Reduced from 25% to 10% for stability
        console.log('App: Occasional sync poll');
        fetchNowPlayingRef.current();
      }
    }, 1500); // Increased from 800ms to 1500ms for stability
    return () => clearInterval(interval);
  }, []); // Static interval

  const fetchLyrics = async (track: string, artist: string, device?: string) => {
    if (!track || !artist) {
      setLyrics(null);
      return;
    }

    // Race condition protection: Capture current track to validate response later
    const requestedTrack = track;
    const requestedArtist = artist;

    // SIMPLIFIED: Only skip if we have lyrics AND it's the exact same track
    const currentTrackKey = `${track}-${artist}`;
    const lastLyricsData = lastPanelData.current.lyrics;
    const lastTrackKey = `${lastLyricsData.track}-${lastLyricsData.artist}`;

    // Only skip if: same track AND we have lyrics AND lyrics are currently displayed
    if (currentTrackKey === lastTrackKey && lastLyricsData.lyrics !== null && lyrics === lastLyricsData.lyrics) {
      console.log(`App: SKIPPING lyrics fetch - already have and displaying lyrics for "${track}" by "${artist}"`);
      return;
    }

    // Safety: If track matches device name, it's a Roon metadata artifact (e.g. AirPlay stream)
    if (device && track === device) {
      console.log('Skipping lyrics: Track equals Device name (Metadata artifact)');
      setLyrics(null);
      return;
    }

    try {
      console.log(`App: Fetching lyrics for "${track}" by "${artist}"...`);
      const res = await axios.get(`${API_URL}/media/lyrics`, { params: { track, artist } });

      // Only update if we are still on the same track AND artist
      if (requestedTrack !== nowPlayingTrackRef.current || requestedArtist !== nowPlaying.artist) {
        console.log(`App: Lyrics received for "${requestedTrack}" by "${requestedArtist}" but current track migrated to "${nowPlayingTrackRef.current}" by "${nowPlaying.artist}". Ignoring.`);
        return;
      }

      const lyricsResult = res.data.instrumental ? "[INSTRUMENTAL]" : (res.data.plain || null);
      setLyrics(lyricsResult);

      // Update cache
      lastPanelData.current.lyrics = {
        track: requestedTrack,
        artist: requestedArtist,
        lyrics: lyricsResult
      };

      console.log(`App: Lyrics ${lyricsResult ? 'found' : 'not found'} for "${track}" by "${artist}"`);
    } catch (error) {
      console.error(`App: Error fetching lyrics for "${track}" by "${artist}":`, error);
      // Only clear if we failed for the actual current track
      if (requestedTrack === nowPlaying.track && requestedArtist === nowPlaying.artist) {
        setLyrics(null);
        lastPanelData.current.lyrics = {
          track: requestedTrack,
          artist: requestedArtist,
          lyrics: null
        };
      }
    }
  };

  // Load saved config on mount
  // Track saved bypass preference for auto-start
  const savedBypassRef = useRef<boolean>(false);

  useEffect(() => {
    const saved = AppStorage.getItem(STORAGE_KEY);
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
    AppStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    AppStorage.setItem('artisNovaDSP_activeMode', activeMode);
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
      const newQueue = res.data.queue || [];

      // Only update if queue actually changed
      const currentQueueStr = JSON.stringify(queue);
      const newQueueStr = JSON.stringify(newQueue);

      if (currentQueueStr !== newQueueStr) {
        console.log('App: Queue changed, updating');
        setQueue(newQueue);
        lastPanelData.current.queue = { lastUpdate: Date.now(), data: newQueue };
      } else {
        console.log('App: Queue unchanged, skipping update');
      }
    } catch { }
  };



  const loadPresets = async () => { try { const res = await axios.get(`${API_URL}/presets`); setPresets(res.data || []); } catch { } };

  // Track if we've already attempted auto-start to avoid repeated attempts
  const hasAutoStartedRef = useRef(false);

  const checkStatus = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);

      // Update basic states only if they changed to minimize renders
      setIsRunning(prev => prev !== res.data.running ? res.data.running : prev);

      // Update sample rate and bit depth from server (dynamic update)
      if (res.data.running) {
        if (res.data.roonSampleRate !== undefined) {
          setSampleRate(prev => prev !== res.data.roonSampleRate ? res.data.roonSampleRate : prev);
        } else {
          const newSR = res.data.sampleRate > 0 ? res.data.sampleRate : null;
          setSampleRate(prev => prev !== newSR ? newSR : prev);
        }
        setBitDepth(prev => prev !== res.data.bitDepth ? res.data.bitDepth : prev);
        setIsBypass(prev => prev !== (res.data.bypass || false) ? (res.data.bypass || false) : prev);
      }

      setIsDspManaged(prev => prev !== (res.data.isDspManaged || false) ? (res.data.isDspManaged || false) : prev);

      // FORCED BACKEND SYNC: Ensure all devices use the backend the server reports as active
      if (res.data.backend && res.data.backend !== backend) {
        console.log(`App: Syncing backend with server -> "${res.data.backend}"`);
        setBackend(res.data.backend as 'local' | 'raspi');
      }

      // ENHANCED AUTO-SOURCE TOGGLE: Check both zone and direct Roon status
      if (mediaSource !== 'roon') {
        // Check if there's an active Roon zone
        const hasActiveRoonZone = res.data.zone && res.data.zone !== 'Camilla';

        if (hasActiveRoonZone) {
          console.log(`App: Detected active Roon zone "${res.data.zone}", checking playback status...`);
          axios.get(`${API_URL}/media/info?source=roon`).then(r => {
            if (r.data.state === 'playing') {
              console.log(`App: Auto-switching media source to ROON (zone: ${res.data.zone})`);
              setMediaSource('roon');
            } else {
              console.log(`App: Roon zone active but not playing (state: ${r.data.state})`);
            }
          }).catch(err => {
            console.error('App: Failed to check Roon status:', err.message);
          });
        } else {
          // Also check if Roon is playing even without zone info
          axios.get(`${API_URL}/media/info?source=roon`).then(r => {
            if (r.data.state === 'playing') {
              console.log(`App: Auto-switching media source to ROON (direct detection)`);
              setMediaSource('roon');
            }
          }).catch(() => { });
        }
      }

      // SYNC ACTIVE ZONE
      if (res.data.activeZoneId && mediaSource === 'roon') {
        setMediaZones(prev => {
          const activeZone = prev.find(z => z.active);
          if (!activeZone || activeZone.id !== res.data.activeZoneId) {
            return prev.map(z => ({
              ...z,
              active: z.id === res.data.activeZoneId && z.source === 'roon'
            }));
          }
          return prev;
        });
      }

      // Auto-start logic...
      // Auto-state sync logic (Initial Load)
      if (!hasAutoStartedRef.current) {
        hasAutoStartedRef.current = true;

        // Scenario A: Server is NOT running, but we want DSP
        if (!res.data.running && !savedBypassRef.current) {
          console.log('App: Auto-starting DSP (Saved state is ENABLED)...');
          await axios.post(`${API_URL}/start`, { directConfig: { filters, preamp }, sampleRate, bitDepth });
        }
        // Scenario B: Server IS running, but we wanted Bypass and it's NOT bypassed
        else if (res.data.running && savedBypassRef.current && !res.data.bypass) {
          console.log('App: Mismatch detected - Forcing Bypass as per saved preference');
          await axios.post(`${API_URL}/bypass`).catch(() => { });
        }
      }

      if (res.data.isAutoMuted !== undefined) {
        setIsAutoMuted(prev => prev !== res.data.isAutoMuted ? res.data.isAutoMuted : prev);
      }
    } catch { }
  }, [backend, mediaSource, sampleRate, bitDepth, filters, preamp]);

  // Main polling effect - must be after checkStatus is defined
  useEffect(() => {
    loadPresets();
    checkStatus();
    fetchQueue();
    fetchMediaZones();
    const statusInterval = setInterval(checkStatus, 2500); // Increased from 1500ms to 2500ms for stability
    const queueInterval = setInterval(fetchQueue, 10000); // Increased from 6000ms to 10000ms
    const zoneInterval = setInterval(fetchMediaZones, 15000); // Increased from 10000ms to 15000ms
    return () => {
      clearInterval(statusInterval);
      clearInterval(queueInterval);
      clearInterval(zoneInterval);
    };
  }, [checkStatus, mediaSource]);

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

  const handleArtworkError = () => {
    if (artworkRetryKey < 10) {
      console.log(`App: Artwork load failed (attempt ${artworkRetryKey + 1}). Retrying in 1s...`);
      setTimeout(() => setArtworkRetryKey((prev: number) => prev + 1), 1000);
    } else {
      console.warn('App: Artwork load failed after 10 retries.');
    }
  };

  useEffect(() => {
    setArtworkRetryKey(0);
  }, [nowPlaying.artworkUrl]);

  // MediaSession API for OS-level media key integration
  // This enables keyboard media keys (⏯️ ⏭️ ⏮️) to control playback on all platforms
  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    // Update metadata when track changes
    if (nowPlaying.track && nowPlaying.artist) {
      const artworkUrl = resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey);
      navigator.mediaSession.metadata = new MediaMetadata({
        title: nowPlaying.track,
        artist: nowPlaying.artist,
        album: nowPlaying.album || '',
        artwork: artworkUrl ? [
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' }
        ] : []
      });
    }

    // Update playback state
    navigator.mediaSession.playbackState = nowPlaying.state === 'playing' ? 'playing' : 'paused';

    // Register action handlers for media keys
    const handlePlay = () => {
      handleMediaControl('playpause');
    };
    const handlePause = () => {
      handleMediaControl('playpause');
    };
    const handlePreviousTrack = () => {
      handleMediaControl('prev');
    };
    const handleNextTrack = () => {
      handleMediaControl('next');
    };
    const handleSeekTo = (details: MediaSessionActionDetails) => {
      if (details.seekTime !== undefined) {
        axios.post(`${API_URL}/media/seek?source=${mediaSource}`, { position: details.seekTime }).catch(() => { });
      }
    };

    try {
      navigator.mediaSession.setActionHandler('play', handlePlay);
      navigator.mediaSession.setActionHandler('pause', handlePause);
      navigator.mediaSession.setActionHandler('previoustrack', handlePreviousTrack);
      navigator.mediaSession.setActionHandler('nexttrack', handleNextTrack);
      navigator.mediaSession.setActionHandler('seekto', handleSeekTo);
    } catch (e) {
      // Some action handlers may not be supported on all platforms
      console.log('MediaSession: Some handlers not supported', e);
    }

    // Update position state for seekbar display in OS
    if (nowPlaying.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: nowPlaying.duration,
          playbackRate: 1,
          position: Math.min(nowPlaying.position, nowPlaying.duration)
        });
      } catch (e) {
        // Position state not supported on all platforms
      }
    }

    // Cleanup handlers on unmount
    return () => {
      try {
        navigator.mediaSession.setActionHandler('play', null);
        navigator.mediaSession.setActionHandler('pause', null);
        navigator.mediaSession.setActionHandler('previoustrack', null);
        navigator.mediaSession.setActionHandler('nexttrack', null);
        navigator.mediaSession.setActionHandler('seekto', null);
      } catch (e) { }
    };
  }, [nowPlaying.track, nowPlaying.artist, nowPlaying.album, nowPlaying.artworkUrl, nowPlaying.state, nowPlaying.position, nowPlaying.duration, mediaSource]);

  const handleStart = async () => {
    setIsTransitioning(true);
    try {
      await axios.post(`${API_URL}/start`, { directConfig: { filters, preamp }, sampleRate, bitDepth });
      await checkStatus();
    }
    catch (err: any) { alert("Start Failed: " + (err.response?.data?.error || err.message)); }
    finally { setIsTransitioning(false); }
  };

  const handleMediaControl = async (action: string, params: any = {}) => {
    try {
      console.log(`App: Media control action: ${action}`);
      await axios.post(`${API_URL}/media/${action}`, { ...params, source: mediaSource });

      // Start burst polling for track changes
      if (action === 'next' || action === 'prev' || action === 'playpause') {
        console.log('App: Starting burst polling after media control');
        startBurstPolling();
      }

      // Immediate optimistic update or fetch
      console.log('App: Triggering immediate fetch after media control');
      setTimeout(fetchNowPlaying, 50); // Very fast first attempt
      if (action === 'next' || action === 'prev') {
        setTimeout(fetchNowPlaying, 300); // Second attempt for slower metadata updates
        setTimeout(fetchNowPlaying, 800); // Third attempt to be sure
      }
    }
    catch (err: any) { alert("Control Failed: " + (err.response?.data?.error || err.message)); }
  };



  const handleBypass = async () => {
    setIsTransitioning(true);
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
    finally { setIsTransitioning(false); }
  };

  const handleSave = async () => {
    const name = prompt("Preset Name:", selectedPreset?.replace('.txt', '').replace('.json', '') || "New Preset");
    if (!name) return;
    try {
      const res = await axios.post(`${API_URL}/presets`, { name, filters, preamp });
      await loadPresets();
      if (res.data.id) setSelectedPreset(res.data.id);
    }
    catch { alert('Save failed'); }
  };

  const handleReboot = async () => {
    if (!confirm("Are you sure you want to reboot the system?")) return;
    try {
      await axios.post(`${API_URL}/system/reboot`);
      alert("System is rebooting...");
    } catch (err: any) {
      alert("Reboot Failed: " + (err.response?.data?.error || err.message));
    }
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
      <div ref={nowPlayingContainerRef} className="h-screen w-full relative overflow-clip group flex flex-col">
        {/* 1. Background - Dynamic "Solid" Color - Tinted by selected Bg Color */}
        <div className="absolute inset-0 z-0 overflow-hidden" style={{ backgroundColor: 'var(--bg-app)' }}>
          {/* Subtle radial gradient for depth */}
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_center,_var(--accent-primary)_0%,_transparent_70%)]" />
          {/* Dynamic Background */}
          {nowPlaying.artworkUrl && artworkRetryKey < 10 && (
            <img
              src={resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey) || ''}
              alt=""
              className="absolute inset-0 w-full h-full object-cover filter blur-[100px] scale-[5.0] saturate-150 opacity-30"
              onError={handleArtworkError}
            />
          )}
        </div>

        {/* 2. Content Layer */}
        <div className="flex-1 overflow-y-auto custom-scrollbar py-4 md:py-8 relative z-20 flex flex-col now-playing-header">

          {/* Main Content Container - Vertically Centered with Dynamic Sizing */}
          <div className="w-full max-w-lg mx-auto flex flex-col justify-center flex-1 min-h-0 px-4">

            {/* Artwork - Dynamic Size Based on Available Height */}
            <div
              className="aspect-square w-full mx-auto mb-4 md:mb-8 relative group/art now-playing-artwork"
              style={{
                maxWidth: 'min(90vw, min(70vh, 500px))',
                width: 'min(90vw, min(70vh, 500px))'
              }}
              onClick={() => setIsArtworkModalOpen(true)}
            >
              <div className="absolute inset-0 bg-black/40 rounded-2xl transform translate-y-2 blur-xl opacity-50" />
              <div className="relative w-full h-full bg-white/5 rounded-2xl overflow-hidden shadow-2xl">
                {nowPlaying.artworkUrl && artworkRetryKey < 10 ? (
                  <img
                    src={resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey) || ''}
                    alt="Album Art"
                    className="w-full h-full object-cover"
                    onError={handleArtworkError}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20"><Music size={64} strokeWidth={1} /></div>
                )}
              </div>
            </div>

            {/* Track Info & Actions - Centered */}
            <div className="w-full flex flex-col items-center text-center mb-4 md:mb-6 px-2 now-playing-info">
              <div className="w-full relative">
                <div className="flex items-center justify-center gap-4 mb-2">
                  <h2 className="text-display font-display font-bold text-white leading-tight line-clamp-2 tracking-tight">{nowPlaying.track || 'Not Playing'}</h2>
                  <button
                    ref={signalBtnRef}
                    onClick={(e) => {
                      setSignalAnchorRect(e.currentTarget.getBoundingClientRect());
                      setSignalPathOpen(!signalPathOpen);
                    }}
                    className={`flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all shadow-xl active:scale-90`}
                    style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                    title="Signal Path"
                  >
                    <Asterisk size={16} strokeWidth={3} />
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center">
                  <p className="text-headline font-body text-white/70 font-medium line-clamp-1 mb-6 md:mb-10 max-w-[90vw] tracking-wide">
                    <span className="font-semibold text-white/85 font-serif">{nowPlaying.album || 'No Album Info'} {nowPlaying.year ? `(${nowPlaying.year})` : ''}</span> — <span className="font-display font-medium">{nowPlaying.artist || 'Not Connected'}</span>
                  </p>
                  {nowPlaying.style && (
                    <div className="mt-2 md:mt-4 animate-in fade-in slide-in-from-top-1 duration-500">
                      <span className="inline-block px-6 md:px-10 py-1.5 rounded-full bg-white text-black text-caption font-black uppercase border border-white/20 shadow-xl backdrop-blur-md tracking-widest">
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
              <div className="w-full mx-auto mb-4 md:mb-6 now-playing-progress">
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
                    onInput={(e) => setCurrentTime(Number(e.currentTarget.value))}
                    onChange={(e) => handleSeek(Number(e.currentTarget.value))}
                  />
                </div>
                <div className="flex justify-between mt-2 text-[10px] md:text-xs font-medium text-white/40 tabular-nums">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(nowPlaying.duration)}</span>
                </div>
              </div>


              <div className="flex items-center justify-center gap-6 mb-4 md:mb-8 now-playing-controls">
                <button
                  onClick={() => handleMediaControl('prev')}
                  className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                  style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                >
                  <SkipBack size={20} fill="currentColor" />
                </button>
                <button
                  onClick={() => handleMediaControl('playpause')}
                  className="rounded-full p-3 hover:opacity-80 hover:scale-105 active:scale-95 transition-all shadow-xl"
                  style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                >
                  {nowPlaying.state === 'playing' ? <Pause size={28} fill="currentColor" /> : <Play size={28} fill="currentColor" />}
                </button>
                <button
                  onClick={() => handleMediaControl('next')}
                  className="rounded-full p-2 hover:opacity-80 transition-all active:scale-95"
                  style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
                >
                  <SkipForward size={20} fill="currentColor" />
                </button>
              </div>

              {/* Resolution Badge / Separator */}
              {isDspManaged && (
                <div
                  className="text-[10px] font-black tracking-[0.3em] leading-none select-none py-4 text-center uppercase now-playing-badge"
                  style={{ color: '#9b59b6' }}
                >
                  {isDspActive ? (sampleRate ? `${(sampleRate / 1000).toFixed(1)} kHz — ${bitDepth} bits` : 'Unknown') : 'Direct Mode'}
                </div>
              )}

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

    return (
      <div className="flex-1 flex flex-col h-full min-h-0 bg-themed-deep overflow-hidden">
        <div className="flex-1 flex flex-col h-full p-3 md:p-8 pt-14 md:pt-20 space-y-2 md:space-y-4 overflow-hidden">

          {/* 1. INTEGRATED PEQ EDITOR, ANALYZER & BANDS - Fills remaining space */}
          <section className="bg-themed-panel border border-themed-medium rounded-xl p-4 md:p-8 shadow-lg mb-4 flex flex-col flex-1 min-h-0 overflow-hidden relative">
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-accent-primary shadow-[0_0_10px_var(--glow-cyan)]" />
                <span className="text-[10px] text-themed-muted font-black tracking-[0.3em] uppercase">PEQ Editor, Analyzer & Bands</span>
              </div>
              <button
                onClick={() => setActiveMode('playback')}
                className="p-2 hover:bg-white/5 rounded-lg transition-colors text-themed-muted hover:text-white"
                title="Close DSP Settings"
              >
                <X size={20} />
              </button>
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
                      {presets.map(p => <option key={p} value={p}>{p.replace('.txt', '').replace('.json', '')}</option>)}
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
                    <div className="flex items-center gap-2">
                      {(!isRunning && !isTransitioning) ? (
                        <button onClick={handleStart} className="w-18 md:w-24 py-2 bg-accent-primary text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all">START</button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleStart}
                            disabled={isTransitioning}
                            className={`w-18 md:w-24 py-2 ${isTransitioning ? 'bg-themed-medium cursor-not-allowed opacity-50' : 'bg-accent-warning'} text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all`}
                            title="Restart DSP Engine"
                          >
                            {isTransitioning ? 'WAIT...' : 'RESTART'}
                          </button>
                          {/* Separator */}
                          <div className="w-px h-6 bg-themed-medium mx-1" />
                          {/* Bypass Toggle */}
                          <button
                            onClick={handleBypass}
                            disabled={isTransitioning}
                            className={`w-18 md:w-24 py-2 ${isTransitioning ? 'bg-themed-medium cursor-not-allowed opacity-50' : isBypass ? 'bg-amber-500 ring-2 ring-amber-400/50' : 'bg-amber-600/60 hover:bg-amber-600'} text-white rounded-lg font-black text-[10px] uppercase tracking-widest shadow-lg active:scale-95 transition-all`}
                            title={isBypass ? "Exit Bypass Mode" : "Enter Bypass Mode"}
                          >
                            {isTransitioning ? '● ● ●' : isBypass ? '● BYP' : 'BYPASS'}
                          </button>
                        </div>
                      )}
                    </div>
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
    console.log('renderLayout called with activeMode:', activeMode);

    try {
      const mobile = isMobile();
      console.log('Mobile detected:', mobile);

      if (mobile) {
        console.log('Rendering mobile layout for mode:', activeMode);
        switch (activeMode) {
          case 'playback':
            console.log('Rendering mobile playback');
            return renderNowPlaying();
          case 'processing':
            console.log('Rendering mobile processing');
            return renderProcessingTools();
          case 'lyrics':
            console.log('Rendering mobile lyrics');
            return <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />;
          case 'info':
            console.log('Rendering mobile info with ArtistInfo');
            return <ArtistInfo artist={nowPlaying.artist || ''} album={nowPlaying.album || ''} />;
          case 'navigation':
            console.log('Rendering mobile navigation with SimpleMusicNavigationView');
            return <SimpleMusicNavigationView />;
          case 'queue':
            console.log('Rendering mobile queue');
            return <PlayQueue queue={queue} mediaSource={mediaSource} />;
          case 'history':
            console.log('Rendering mobile history');
            return <History />;
          case 'visualization':
            console.log('Rendering mobile visualization');
            return <VisualizationPage isRunning={isRunning} wsUrl={getActiveWsUrl(backend)} nowPlaying={nowPlaying} resolvedArtworkUrl={resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey)} dynamicColor={dynamicBgColor} />;
          default:
            console.log('Rendering mobile default (playback)');
            return renderNowPlaying();
        }
      }

      console.log('Rendering desktop layout for mode:', activeMode);

      if (activeMode === 'playback') {
        console.log('Rendering desktop playback mode');
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

      // Visualization - Fullscreen mode (no split panel)
      if (activeMode === 'visualization') {
        console.log('Rendering desktop visualization mode');
        return <VisualizationPage isRunning={isRunning} wsUrl={getActiveWsUrl(backend)} nowPlaying={nowPlaying} resolvedArtworkUrl={resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey)} dynamicColor={dynamicBgColor} />;
      }

      // Navigation - Fullscreen mode (no split panel)
      if (activeMode === 'navigation') {
        console.log('Rendering desktop navigation mode with SimpleMusicNavigationView');
        return <SimpleMusicNavigationView />;
      }

      console.log('Rendering desktop panel layout');
      return (
        <Group orientation="horizontal" className="h-full w-full" onLayoutChange={onLayoutChange}>
          <Panel defaultSize={panelSizes[0]} minSize={30} id="now-playing">
            <div
              className="h-full w-full cursor-pointer"
              onClick={(e) => {
                // Don't navigate if clicking on buttons, inputs, or signal path elements
                const target = e.target as HTMLElement;
                const clickedInteractive = target.closest('button, input, a, [role="button"], .signal-path-popover');
                if (!clickedInteractive) {
                  setActiveMode('playback');
                }
              }}
            >
              {renderNowPlaying()}
            </div>
          </Panel>
          <Separator className="w-1 bg-themed-deep hover:bg-accent-primary/20 cursor-col-resize mx-0.5 rounded-full flex items-center justify-center transition-colors">
            <div className="w-1 h-12 bg-themed-medium rounded-full" />
          </Separator>
          <Panel defaultSize={panelSizes[1]} minSize={25} id="secondary">
            <div ref={secondaryContainerRef} className="h-full w-full flex flex-col pt-8 px-4 pb-4 lg:pt-10 lg:px-6 lg:pb-6">
              {/* 3. LYRICS/QUEUE/HISTORY/PROCESSING - Based on activeMode */}
              {activeMode === 'processing' && renderProcessingTools()}
              {activeMode === 'lyrics' && <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />}
              {activeMode === 'info' && <ArtistInfo artist={nowPlaying.artist || ''} album={nowPlaying.album || ''} />}
              {activeMode === 'queue' && <PlayQueue queue={queue} mediaSource={mediaSource} />}
              {activeMode === 'history' && <History />}
            </div>
          </Panel>
        </Group>
      );
    } catch (error) {
      console.error('Error in renderLayout:', error);
      return (
        <div className="p-8 bg-red-100 border border-red-300 rounded-lg">
          <h2 className="text-xl font-bold text-red-800 mb-4">Layout Error</h2>
          <p className="text-red-700">Error rendering layout: {error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      );
    }
  };

  return (
    <div
      className="flex flex-col h-screen w-full bg-themed-deep text-themed-primary overflow-hidden"
      style={{ backgroundColor: 'var(--bg-app)' }}
    >
      {/* FLOATING MENU BUTTON - Safe area padding for mobile */}
      <button
        ref={menuButtonRef}
        onClick={() => setMenuOpen(!menuOpen)}
        className="fixed top-[max(1rem,env(safe-area-inset-top))] left-[max(1rem,env(safe-area-inset-left))] p-3 rounded-xl shadow-xl hover:opacity-80 transition-all active:scale-95"
        style={{
          backgroundColor: 'transparent',
          color: 'white',
          border: 'none',
          outline: 'none',
          zIndex: 2147483647, // Maximum z-index value
          position: 'fixed',
          isolation: 'isolate'
        }}
      >
        <Menu size={20} />
      </button>

      {/* DROPDOWN MENU */}
      {menuOpen && (
        <div
          ref={sideMenuRef}
          onMouseDown={() => setMenuActivity(Date.now())}
          className="fixed top-[max(4.5rem,calc(env(safe-area-inset-top)+3.5rem))] left-[max(1rem,env(safe-area-inset-left))] border border-themed-medium rounded-xl shadow-[0_20px_50px_rgba(0,0,0,1)] w-72 overflow-hidden animate-in fade-in slide-in-from-top-4 duration-300 bg-black/80 backdrop-blur-md"
          style={{
            zIndex: 2147483647, // Maximum z-index value
            position: 'fixed',
            isolation: 'isolate'
          }}
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
                {/* Auto Mute Badge */}
                {/* Auto Mute Badge Removed */}{/*
                {isAutoMuted && (
                  <div className="ml-auto px-2 py-1 bg-red-500/20 border border-red-500/50 rounded flex items-center gap-1.5 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-[9px] font-black text-red-500 uppercase tracking-widest">Muted (Group)</span>
                  </div>
                )}
                */}
              </div>

              {/* Backend Section */}
              {isDspManaged && (
                <div className="p-2">
                  <div className="px-3 pt-1 pb-2 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Device</div>
                  <div className="flex gap-2 px-1">
                    <button onClick={() => setBackend('local')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all text-white ${backend === 'local' ? 'bg-white/20 border border-white/30' : 'bg-black/20 border border-white/10 hover:bg-white/10'}`}>
                      <Monitor size={14} /><span className="text-[11px] font-black truncate max-w-[100px]">{hostname}</span>
                      {backend === 'local' && <Check size={10} strokeWidth={4} />}
                    </button>
                    <button onClick={() => raspiOnline && setBackend('raspi')} disabled={!raspiOnline} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg transition-all text-white ${!raspiOnline ? 'opacity-30 cursor-not-allowed bg-black/20 border border-white/10' : backend === 'raspi' ? 'bg-white/20 border border-white/30' : 'bg-black/20 border border-white/10 hover:bg-white/10'}`}>
                      <Server size={14} /><span className="text-[11px] font-black">RPi</span>
                      {backend === 'raspi' && <Check size={10} strokeWidth={4} />}
                    </button>
                  </div>
                  <div className="mx-4 border-t border-themed-subtle my-2" />
                </div>
              )}

              {/* View Mode Section */}
              <div className="p-2">
                <div className="px-3 pt-2 pb-1 text-[9px] text-themed-muted font-black uppercase tracking-[0.2em]">Navigation</div>
                <div className="space-y-0.5">
                  <button
                    onClick={() => { setActiveMode('playback'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'playback' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'playback' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <Play size={16} style={activeMode === 'playback' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Playback Only</span>
                    </div>
                    {activeMode === 'playback' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>

                  {isDspManaged && (
                    <button
                      onClick={() => { setActiveMode('processing'); setMenuOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'processing' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                      style={activeMode === 'processing' ? { backgroundColor: 'white', color: 'black' } : {}}
                    >
                      <div className="flex items-center gap-3">
                        <Activity size={16} style={activeMode === 'processing' ? { color: 'black' } : { color: '#606080' }} />
                        <span className="text-sm font-black">DSP Control</span>
                      </div>
                      {activeMode === 'processing' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                    </button>
                  )}

                  <button
                    onClick={() => { setActiveMode('lyrics'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'lyrics' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'lyrics' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <MessageCircle size={16} style={activeMode === 'lyrics' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Lyrics</span>
                    </div>
                    {activeMode === 'lyrics' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>

                  <button
                    onClick={() => { setActiveMode('info'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'info' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'info' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <BookOpen size={16} style={activeMode === 'info' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Music Info</span>
                    </div>
                    {activeMode === 'info' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>

                  {/* Music Explorer - Temporarily hidden until fully functional
                  <button
                    onClick={() => { setActiveMode('navigation'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'navigation' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'navigation' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <Navigation size={16} style={activeMode === 'navigation' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Music Explorer</span>
                    </div>
                    {activeMode === 'navigation' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>
                  */}

                  <button
                    onClick={() => { setActiveMode('queue'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'queue' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'queue' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <Music size={16} style={activeMode === 'queue' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Queue</span>
                    </div>
                    {activeMode === 'queue' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>

                  <button
                    onClick={() => { setActiveMode('history'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'history' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'history' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <RefreshCcw size={16} style={activeMode === 'history' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">History</span>
                    </div>
                    {activeMode === 'history' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>

                  <button
                    onClick={() => { setActiveMode('visualization'); setMenuOpen(false); }}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${activeMode === 'visualization' ? 'shadow-xl scale-[1.02]' : 'text-themed-muted hover:text-white hover:bg-white/5'}`}
                    style={activeMode === 'visualization' ? { backgroundColor: 'white', color: 'black' } : {}}
                  >
                    <div className="flex items-center gap-3">
                      <Gauge size={16} style={activeMode === 'visualization' ? { color: 'black' } : { color: '#606080' }} />
                      <span className="text-sm font-black">Visualization</span>
                    </div>
                    {activeMode === 'visualization' && <Check size={14} strokeWidth={4} style={{ color: 'black' }} />}
                  </button>
                </div>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Settings Trigger */}
              <div className="p-2">
                <button
                  onClick={() => setMenuView('settings')}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all hover:bg-white/10 text-white bg-black/40 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <Settings size={18} style={{ color: '#ffffff' }} />
                    <span className="text-sm font-black">Settings</span>
                  </div>
                  <ChevronRight size={16} style={{ color: '#ffffff', opacity: 0.6 }} />
                </button>
              </div>

              <div className="mx-4 border-t border-[#2a2a3e] my-1" />

              {/* Background Color Submenu Trigger */}
              <div className="p-2">
                <button
                  onClick={() => setMenuView('colors')}
                  className="w-full flex items-center justify-between px-3 py-3 rounded-lg transition-all hover:bg-white/10 text-white bg-black/40 border border-white/5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-sm border shadow-lg border-white/40"
                      style={{
                        backgroundColor: bgColor === 'dynamic' && dynamicBgColor
                          ? dynamicBgColor
                          : BACKGROUND_COLORS.find(c => c.id === bgColor)?.color || '#000000',
                        backgroundImage: bgColor === 'dynamic' && !dynamicBgColor
                          ? 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4)'
                          : 'none'
                      }}
                    />
                    <span className="text-sm font-black">Background Color</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[80px] text-white/40">{BACKGROUND_COLORS.find(c => c.id === bgColor)?.name}</span>
                    <ChevronRight size={16} style={{ color: '#ffffff', opacity: 0.6 }} />
                  </div>
                </button>
              </div>

              {/* Status Footer */}
              <div className="px-5 py-3 bg-themed-deep border-t border-themed-subtle flex items-center justify-between">
                {isAutoMuted ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50 animate-pulse">
                    <div className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">DSP MUTED</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-themed-subtle">
                    <div className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-accent-primary shadow-[0_0_8px_var(--glow-cyan)]' : 'bg-accent-danger'}`} />
                    <span className="text-[10px] font-black text-themed-muted uppercase tracking-widest">{isRunning ? 'DSP ON' : 'DSP OFF'}</span>
                  </div>
                )}
                <span className="text-[9px] text-accent-primary font-black tracking-widest">{isDspActive ? (sampleRate ? `${(sampleRate / 1000).toFixed(1)}K / ${bitDepth}B` : '--') : 'DIRECT'}</span>
              </div>
            </>
          ) : menuView === 'settings' ? (
            <div className="flex-1 flex flex-col min-h-0 bg-themed-panel relative overflow-hidden">
              {/* Settings Header - ULTRA CONTRAST */}
              <div className="flex-shrink-0 px-4 pt-4 pb-4 border-b border-themed-subtle shadow-xl z-30" style={{ backgroundColor: 'white' }}>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3" style={{ color: 'black' }}>
                    <Settings size={18} strokeWidth={3} />
                    <h2 className="text-sm font-black uppercase tracking-widest">Configuración</h2>
                  </div>
                  <button onClick={() => setMenuView('main')} className="p-1 hover:bg-black/10 rounded-lg transition-all" style={{ color: 'black' }}>
                    <X size={20} strokeWidth={4} />
                  </button>
                </div>

                <div className="flex p-1 bg-black rounded-xl border border-white/10 shadow-2xl">
                  <button
                    onClick={() => setSettingsHost('local')}
                    style={settingsHost === 'local' ? { backgroundColor: 'white', color: 'black' } : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)' }}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${settingsHost === 'local' ? 'shadow-lg scale-[1.02]' : 'hover:text-white/80 hover:bg-white/5'}`}
                  >
                    Mac Mini
                  </button>
                  <button
                    onClick={() => setSettingsHost('raspi')}
                    style={settingsHost === 'raspi' ? { backgroundColor: 'white', color: 'black' } : { backgroundColor: 'transparent', color: 'rgba(255,255,255,0.4)' }}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${settingsHost === 'raspi' ? 'shadow-lg scale-[1.02]' : 'hover:text-white/80 hover:bg-white/5'}`}
                  >
                    Raspberry Pi
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                {/* Connection Status */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Estado del Servidor</label>
                  <div className="p-3 bg-themed-deep rounded-xl border border-themed-medium flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${settingsHost === 'local' || raspiOnline ? 'bg-accent-success shadow-[0_0_8px_var(--glow-green)]' : 'bg-accent-danger shadow-[0_0_8px_var(--glow-red)]'} ${settingsHost === 'raspi' && raspiOnline ? 'animate-pulse' : ''}`} />
                      <span className="text-[11px] font-bold text-themed-primary uppercase">{settingsHost === 'local' ? 'Mac Mini (Local)' : 'Raspberry Pi (Remote)'}</span>
                    </div>
                    <span className="text-[9px] font-black text-themed-muted uppercase tracking-widest">
                      {settingsHost === 'local' || raspiOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>

                {/* WebSocket Config Section */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">WebSocket Bridge</label>
                  {availableBackends.filter(b => b.id === settingsHost).map(b => (
                    <div key={b.id} className="space-y-2 bg-themed-deep p-3 rounded-xl border border-themed-medium">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[9px] font-bold text-themed-muted uppercase">Bridge URL</span>
                        <span className="text-[9px] text-accent-primary font-mono">{getActiveWsUrl(b.id)}</span>
                      </div>
                      <input
                        type="text"
                        defaultValue={backendOverrides[b.id] || b.wsUrl}
                        placeholder={b.wsUrl}
                        onBlur={(e) => updateBackendOverride(b.id, e.target.value)}
                        className="w-full bg-black/60 border border-themed-subtle rounded-lg px-3 py-2 text-[11px] text-themed-secondary focus:outline-none focus:border-accent-primary transition-all font-mono"
                      />
                    </div>
                  ))}
                </div>

                {/* Roon Mapping Section */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Mapeo de Zonas Roon</label>
                  <p className="text-[9px] text-themed-muted px-1 pb-1">Define qué zonas se procesan en este servidor.</p>
                  <div className="space-y-2">
                    {mediaZones.filter(z => z.source === 'roon').length === 0 ? <div className="text-[10px] text-themed-muted italic px-2">No se detectan zonas...</div> :
                      mediaZones.filter(z => z.source === 'roon').map(zone => (
                        <div key={zone.id} className="space-y-2 bg-themed-deep p-3 rounded-xl border border-themed-medium">
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[11px] font-bold text-themed-primary">{zone.name}</span>
                            <div className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${fullZoneConfig?.zones?.[zone.name] === settingsHost ? 'bg-accent-primary/20 text-accent-primary' : (fullZoneConfig?.zones?.[zone.name] ? 'bg-themed-card-hover text-themed-muted' : (settingsHost === 'local' ? 'bg-accent-primary/20 text-accent-primary' : 'bg-themed-card-hover text-themed-muted'))}`}>
                              {fullZoneConfig?.zones?.[zone.name] === settingsHost ? 'ACTIVO AQUÍ' : (fullZoneConfig?.zones?.[zone.name] || 'DEFAULT')}
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-1">
                            <button
                              onClick={() => updateZoneBackend(zone.name, null)}
                              className={`py-1.5 rounded text-[8px] font-black uppercase tracking-tighter transition-all ${!fullZoneConfig?.zones?.[zone.name] ? 'bg-accent-primary text-white' : 'bg-black/40 text-themed-muted'}`}
                            >
                              Default
                            </button>
                            <button
                              onClick={() => updateZoneBackend(zone.name, 'local')}
                              className={`py-1.5 rounded text-[8px] font-black uppercase tracking-tighter transition-all ${fullZoneConfig?.zones?.[zone.name] === 'local' ? 'bg-accent-primary text-white' : 'bg-black/40 text-themed-muted'}`}
                            >
                              Local
                            </button>
                            <button
                              onClick={() => updateZoneBackend(zone.name, 'raspi')}
                              className={`py-1.5 rounded text-[8px] font-black uppercase tracking-tighter transition-all ${fullZoneConfig?.zones?.[zone.name] === 'raspi' ? 'bg-accent-primary text-white' : 'bg-black/40 text-themed-muted'}`}
                            >
                              Raspi
                            </button>
                          </div>
                        </div>
                      ))
                    }
                  </div>
                </div>

                {/* External Actions (Pi Context) */}
                {settingsHost === 'raspi' && !window.location.hostname.includes('raspberrypi') && (
                  <div className="space-y-1.5 pt-2 border-t border-themed-subtle">
                    <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Acciones Remotas</label>
                    <button
                      onClick={() => window.location.href = 'http://raspberrypi.local:3000'}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent-primary/10 border border-accent-primary/20 text-accent-primary hover:bg-accent-primary/20 transition-all text-[11px] font-black uppercase tracking-widest"
                    >
                      <ExternalLink size={14} />
                      Abrir Dashboard en Pi
                    </button>
                  </div>
                )}

                {/* External Actions (Return to Local) */}
                {settingsHost === 'local' && window.location.hostname.includes('raspberrypi') && (
                  <div className="space-y-1.5 pt-2 border-t border-themed-subtle">
                    <label className="text-[10px] text-themed-muted font-black uppercase tracking-widest px-1">Navegación</label>
                    <button
                      onClick={() => window.location.href = 'http://macmini.local:3000'}
                      className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent-success/10 border border-accent-success/20 text-accent-success hover:bg-accent-success/20 transition-all text-[11px] font-black uppercase tracking-widest"
                    >
                      <Monitor size={14} />
                      Abrir Dashboard Local
                    </button>
                  </div>
                )}

                {/* System Actions */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                  <button
                    onClick={() => window.location.reload()}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-themed-deep border border-themed-subtle text-themed-primary hover:border-themed-primary transition-all text-[11px] font-black uppercase tracking-widest"
                  >
                    <RefreshCcw size={14} />
                    Reset App
                  </button>
                  <button
                    onClick={handleReboot}
                    className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-accent-danger/10 border border-accent-danger/20 text-accent-danger hover:bg-accent-danger/20 transition-all text-[11px] font-black uppercase tracking-widest"
                  >
                    <Power size={14} />
                    Reboot
                  </button>
                </div>
              </div>
            </div>
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
                          style={{
                            backgroundColor: colorObj.id === 'dynamic'
                              ? (dynamicBgColor || '#08080a')
                              : colorObj.color,
                            backgroundImage: colorObj.id === 'dynamic' && !dynamicBgColor
                              ? 'linear-gradient(45deg, #ff6b6b, #4ecdc4, #45b7d1, #96ceb4)'
                              : 'none'
                          }}
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
          style={{ backgroundColor: 'transparent', color: 'white', border: 'none', outline: 'none' }}
          title="Direct Source"
        >
          <Cast size={24} />
        </button>

        {sourcePopoverOpen && (
          <div
            ref={sourceSelectorRef}
            onMouseDown={() => setSourceActivity(Date.now())}
            className="flex items-end gap-3 animate-in fade-in zoom-in-95 slide-in-from-bottom-6 duration-300"
          >
            {/* Unified Player Selection */}
            <div className="bg-black border border-themed-medium rounded-xl shadow-2xl p-2.5 w-64 min-w-[260px]">
              <div className="px-3 pt-2 pb-2 text-[10px] text-themed-muted font-black uppercase tracking-[0.2em] border-b border-themed-subtle mb-1 flex items-center justify-between">
                <span>Selección de Reproductor</span>
                {mediaZones.length > 0 && <div className="w-1.5 h-1.5 rounded-full bg-accent-success shadow-[0_0_8px_var(--accent-success)]" />}
              </div>

              <div className="space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar p-1">

                {/* 1. Directo (Apple Music) */}
                <div className="space-y-1">
                  <div className="px-2 pb-1 text-[9px] text-[#404060] font-black uppercase tracking-widest">Directo</div>
                  {mediaZones.filter(z => z.source === 'apple').map(zone => (
                    <button
                      key={zone.id}
                      onClick={() => { selectZone(zone.id, zone.source); setSourcePopoverOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all ${zone.active && mediaSource === 'apple' ? 'bg-themed-muted/20 text-themed-primary border border-themed-muted/30' : 'hover:bg-white/5 text-themed-muted border border-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${zone.active && mediaSource === 'apple' ? 'bg-themed-muted/40' : 'bg-white/5'}`}>
                          <Music size={14} />
                        </div>
                        <div className="flex flex-col items-start">
                          <span className="text-xs font-bold leading-none mb-1">{zone.name}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-50">Local Mac</span>
                        </div>
                      </div>
                      {zone.active && mediaSource === 'apple' && <Check size={14} strokeWidth={4} className="text-themed-primary" />}
                    </button>
                  ))}
                </div>

                {/* 2. Streaming (ArtisNova Pi) */}
                <div className="space-y-1">
                  <div className="px-2 pb-1 text-[9px] text-accent-success/60 font-black uppercase tracking-widest">Streaming (Pi)</div>
                  {mediaZones.filter(z => z.source === 'lms').map(zone => (
                    <button
                      key={zone.id}
                      onClick={() => { selectZone(zone.id, zone.source); setSourcePopoverOpen(false); }}
                      className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all ${zone.active && mediaSource === 'lms' ? 'bg-accent-success/10 text-accent-success border border-accent-success/20' : 'hover:bg-white/5 text-themed-muted border border-transparent'}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${zone.active && mediaSource === 'lms' ? 'bg-accent-success/20' : 'bg-white/5'}`}>
                          <Activity size={14} />
                        </div>
                        <div className="flex flex-col items-start text-left">
                          <span className="text-xs font-bold leading-none mb-1">{zone.name}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest opacity-50">Spotify / Qobuz / AirPlay</span>
                        </div>
                      </div>
                      {zone.active && mediaSource === 'lms' && <Check size={14} strokeWidth={4} />}
                    </button>
                  ))}
                </div>

                {/* 3. Roon Zones */}
                <div className="space-y-1">
                  <div className="px-2 pb-1 text-[9px] text-accent-primary/60 font-black uppercase tracking-widest">Zonas Roon</div>
                  {mediaZones.filter(z => z.source === 'roon').length === 0 ? (
                    <div className="px-4 py-2 text-[10px] text-[#404060] italic">No hay zonas Roon...</div>
                  ) : (
                    mediaZones.filter(z => z.source === 'roon').map(zone => (
                      <button
                        key={zone.id}
                        onClick={() => { selectZone(zone.id, zone.source); setSourcePopoverOpen(false); }}
                        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-all ${zone.active && mediaSource === 'roon' ? 'bg-accent-primary/10 text-accent-primary border border-accent-primary/20' : 'hover:bg-themed-card-hover/40 text-themed-muted border border-transparent'}`}
                      >
                        <div className="flex flex-col items-start text-left flex-1 min-w-0 pr-2">
                          <div className="flex items-center gap-2 mb-0.5">
                            <Zap size={10} className={zone.active && mediaSource === 'roon' ? "text-accent-primary" : "text-themed-muted/40"} />
                            <span className="text-[10px] font-black uppercase tracking-widest truncate">{zone.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[8px] font-black px-1 rounded ${zone.state === 'playing' ? 'bg-accent-success/20 text-accent-success' : 'bg-themed-card-hover text-themed-muted'}`}>
                              {zone.state.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        {zone.active && mediaSource === 'roon' && <Check size={12} strokeWidth={4} className="shrink-0" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <SignalPathPopover
        isOpen={signalPathOpen}
        onClose={() => setSignalPathOpen(false)}
        nodes={(() => {
          let nodes = nowPlaying.signalPath?.nodes ? [...nowPlaying.signalPath.nodes] : [];
          if (isAutoMuted) {
            // @ts-ignore
            nodes = nodes.map(n => ({ ...n }));
            // @ts-ignore
            const dspNode: any = nodes.find(n => n.description.includes('Camilla') || n.description.includes('Probe'));
            if (dspNode) {
              dspNode.warning = true;
              dspNode.comment = "Muted (Hybrid Group)";
              dspNode.status = undefined;
            } else {
              // @ts-ignore
              nodes.push({
                type: 'dsp',
                description: 'Auto-Mute Active',
                details: 'DSP output muted to prevent double audio',
                warning: true,
                comment: 'Hybrid Group Detected'
              } as any);
            }
          }
          // @ts-ignore
          return nodes;
        })()}
        quality={nowPlaying.signalPath?.quality}
        anchorRect={signalAnchorRect}
        nowPlayingRect={nowPlayingContainerRef.current?.getBoundingClientRect()}
        secondaryRect={secondaryContainerRef.current?.getBoundingClientRect()}
      />

      {/* Artwork Modal - Portaled to Body for Full Screen */}
      {isArtworkModalOpen && createPortal(
        <div
          className="artwork-modal"
          onClick={() => setIsArtworkModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            zIndex: 99999,
            backdropFilter: 'blur(10px)'
          }}
        >
          <img
            src={resolveArtworkUrl(nowPlaying.artworkUrl, artworkRetryKey) || ''}
            alt="Full Artwork"
            className="artwork-modal-image"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '90vw',
              maxHeight: '90vh',
              objectFit: 'contain',
              boxShadow: '0 20px 50px rgba(0,0,0,0.5)'
            }}
          />
        </div>,
        document.body
      )}
    </div >
  );
}

export default App;
