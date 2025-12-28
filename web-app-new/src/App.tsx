import { useEffect, useState } from 'react';
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
  Music, Activity, MessageCircle, Settings, Server, Monitor, Menu, X, ChevronRight, ChevronLeft, Check
} from 'lucide-react';
import './index.css';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const API_URL = `http://${API_HOST}:3000/api`;

// Device detection
const isMobile = () => window.innerWidth < 768;
const getDeviceType = () => {
  const width = window.screen.width;
  if (width >= 1024) return 'desktop';
  if (width >= 768) return 'tablet';
  return 'mobile';
};
const STORAGE_KEY = `artisNovaDSP_config_${getDeviceType()}`;

interface SavedConfig {
  filters: FilterParam[];
  preamp: number;
  sampleRate: number;
  bitDepth: number;
  selectedPreset: string | null;
  activeMode?: 'playback' | 'processing' | 'lyrics';
  backend?: 'local' | 'raspi';
}

const BACKENDS = {
  local: { name: 'Local', wsUrl: `ws://${window.location.hostname}:1234` },
  raspi: { name: 'Raspberry Pi', wsUrl: 'ws://raspberrypi.local:1234' }
} as const;

type LayoutMode = 'playback' | 'processing' | 'lyrics';

const PANEL_STORAGE_KEY = `artisNovaDSP_layout_${getDeviceType()}`;

function App() {
  const [presets, setPresets] = useState<string[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterParam[]>([]);
  const [preamp, setPreamp] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [sampleRate, setSampleRate] = useState(44100);
  const [bitDepth, setBitDepth] = useState(24);
  const [isLoaded, setIsLoaded] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<{ state: string; track: string; artist: string; album?: string; artworkUrl?: string }>({ state: 'unknown', track: '', artist: '' });
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ track: string; artist: string; album?: string; artworkUrl?: string }[]>([]);
  const [backend, setBackend] = useState<'local' | 'raspi'>('local');
  const [raspiOnline, setRaspiOnline] = useState(false);
  const [activeMode, setActiveMode] = useState<LayoutMode>(isMobile() ? 'playback' : 'processing');
  const [panelSizes, setPanelSizes] = useState<number[]>([55, 45]);

  useEffect(() => {
    const savedLayout = localStorage.getItem(PANEL_STORAGE_KEY);
    if (savedLayout) {
      try {
        setPanelSizes(JSON.parse(savedLayout));
      } catch { }
    }
  }, []);

  const onLayoutChange = (sizes: number[]) => {
    setPanelSizes(sizes);
    localStorage.setItem(PANEL_STORAGE_KEY, JSON.stringify(sizes));
  };

  // Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuView, setMenuView] = useState<'main' | 'settings'>('main');

  useEffect(() => {
    if (!menuOpen) setMenuView('main');
  }, [menuOpen]);

  // Poll for now playing info
  useEffect(() => {
    const fetchNowPlaying = async () => {
      try {
        const res = await axios.get(`${API_URL}/media/info`);
        if (res.data.track !== nowPlaying.track) {
          setNowPlaying(res.data);
          fetchLyrics(res.data.track, res.data.artist);
        } else if (res.data.state !== nowPlaying.state) {
          setNowPlaying(prev => ({ ...prev, state: res.data.state }));
        }
      } catch { }
    };
    fetchNowPlaying();
    const interval = setInterval(fetchNowPlaying, 2000);
    return () => clearInterval(interval);
  }, [nowPlaying.track, nowPlaying.state]);

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
    try { const res = await axios.get(`${API_URL}/presets/${name}`); setFilters(res.data.filters); setPreamp(res.data.preamp); }
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
    <div className="h-full w-full bg-[#18151f] border border-[#2a2535] rounded-3xl relative overflow-hidden group shadow-xl flex flex-col items-center justify-center p-6 md:p-8">
      {nowPlaying.artworkUrl && (
        <div className="absolute inset-0 opacity-10 filter blur-[100px] scale-150">
          <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="relative z-10 flex flex-col items-center gap-6 md:gap-10 w-full max-w-2xl text-center">
        <div className="w-40 h-40 md:w-56 md:h-56 lg:w-72 lg:h-72 bg-[#1a1a28] rounded-[32px] md:rounded-[48px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.6)] border-2 border-[#2a2a3e]">
          {nowPlaying.artworkUrl ? (
            <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="Album Art" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#2a2a3e]"><Zap size={64} strokeWidth={1} /></div>
          )}
        </div>
        <div className="w-full space-y-3">
          <h2 className="text-xl md:text-3xl lg:text-4xl font-black tracking-tighter text-white line-clamp-2 uppercase">{nowPlaying.track || 'Standby'}</h2>
          <p className="text-base md:text-lg text-[#00d4ff] font-bold tracking-[0.15em] uppercase opacity-90">{nowPlaying.artist || 'Waiting for audio...'}</p>
        </div>
        <div className="flex items-center gap-6 md:gap-8">
          <button onClick={() => axios.post(`${API_URL}/media/prev`).catch(() => { })} className="p-3 md:p-5 rounded-full bg-white/5 hover:bg-white/10 text-[#606080] hover:text-[#00d4ff] border border-white/5"><SkipBack size={28} /></button>
          <button onClick={() => axios.post(`${API_URL}/media/playpause`).catch(() => { })} className="p-6 md:p-8 bg-[#00ff88]/10 hover:bg-[#00ff88]/20 rounded-full border-2 border-[#00ff88]/20 shadow-[0_0_60px_rgba(0,255,136,0.15)]">
            {nowPlaying.state === 'playing' ? <Pause size={40} className="text-[#ffaa00]" fill="currentColor" /> : <Play size={40} className="text-[#00ff88]" fill="currentColor" />}
          </button>
          <button onClick={() => axios.post(`${API_URL}/media/next`).catch(() => { })} className="p-3 md:p-5 rounded-full bg-white/5 hover:bg-white/10 text-[#606080] hover:text-[#00d4ff] border border-white/5"><SkipForward size={28} /></button>
        </div>
      </div>
    </div>
  );

  // Render Processing Tools
  const renderProcessingTools = () => (
    <div className="h-full w-full flex flex-col gap-3">
      <div className="flex-[2] min-h-0">
        <VUMeter isRunning={true} wsUrl={BACKENDS[backend].wsUrl} />
      </div>
      <div className="flex-1 min-h-0 bg-[#0e1318] border border-[#1a2530] rounded-2xl p-4 flex flex-col">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_#00d4ff]" />
          <span className="text-[9px] text-[#606080] font-black tracking-[0.2em] uppercase">Analyzer</span>
        </div>
        <div className="flex-1 min-h-0"><FilterGraph filters={filters} preamp={preamp} /></div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-[#141416] border border-[#252528] rounded-2xl overflow-hidden">
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
              <button onClick={handleStart} className="bg-gradient-to-r from-[#00d4ff] to-[#7b68ee] text-white px-3 py-1 rounded-lg font-black text-[8px]">START</button>
            ) : (
              <button onClick={handleStop} className="bg-[#ff6b9d] text-white px-3 py-1 rounded-lg font-black text-[8px]">STOP</button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 custom-scrollbar"><PEQEditor filters={filters} onChange={setFilters} /></div>
      </div>
    </div>
  );

  // Render Lyrics Sidebar
  const renderLyricsSidebar = () => (
    <div className="h-full w-full flex flex-col gap-3">
      {lyrics && <div className="flex-1 min-h-0"><Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} /></div>}
      <div className="flex-1 min-h-0"><PlayQueue queue={queue} /></div>
    </div>
  );

  // Main layout
  const renderLayout = () => {
    const mobile = isMobile();
    if (mobile) {
      switch (activeMode) {
        case 'playback': return renderNowPlaying();
        case 'processing': return renderProcessingTools();
        case 'lyrics': return renderLyricsSidebar();
      }
    }
    if (activeMode === 'playback') return renderNowPlaying();
    return (
      <Group orientation="horizontal" className="h-full w-full" onLayout={onLayoutChange}>
        <Panel defaultSize={panelSizes[0]} minSize={30} id="now-playing">{renderNowPlaying()}</Panel>
        <Separator className="w-2 bg-[#0a0a0f] hover:bg-[#7b68ee]/40 cursor-col-resize mx-1 rounded-full flex items-center justify-center">
          <div className="w-1 h-20 bg-[#2a2a3e] hover:bg-[#7b68ee] rounded-full" />
        </Separator>
        <Panel defaultSize={panelSizes[1]} minSize={25} id="secondary">
          {activeMode === 'processing' ? renderProcessingTools() : renderLyricsSidebar()}
        </Panel>
      </Group>
    );
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#06060a] text-white overflow-hidden">
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
                <div className="px-3 pt-2 pb-1 text-[9px] text-[#404060] font-black uppercase tracking-[0.2em]">Pantalla</div>
                <div className="space-y-0.5">
                  <button onClick={() => { setActiveMode('playback'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeMode === 'playback' ? 'bg-[#00d4ff]/10 text-[#00d4ff]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><Music size={16} /><span className="text-sm font-bold">Reproducción</span></div>
                    {activeMode === 'playback' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <button onClick={() => { setActiveMode('processing'); setMenuOpen(false); }} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${activeMode === 'processing' ? 'bg-[#00ff88]/10 text-[#00ff88]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><Activity size={16} /><span className="text-sm font-bold">Procesamiento</span></div>
                    {activeMode === 'processing' && <Check size={14} strokeWidth={3} />}
                  </button>
                  <button onClick={() => { setActiveMode('lyrics'); setMenuOpen(false); }} disabled={!lyrics && queue.length === 0} className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all ${!lyrics && queue.length === 0 ? 'opacity-30 cursor-not-allowed' : activeMode === 'lyrics' ? 'bg-[#7b68ee]/10 text-[#7b68ee]' : 'hover:bg-white/5 text-[#909090]'}`}>
                    <div className="flex items-center gap-3"><MessageCircle size={16} /><span className="text-sm font-bold">Letras y Cola</span></div>
                    {activeMode === 'lyrics' && <Check size={14} strokeWidth={3} />}
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

      {/* Click outside to close menu */}
      {menuOpen && <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />}

      {/* MAIN CONTENT with safe area padding */}
      <div className="flex-1 min-h-0 min-w-0 p-3 pt-[max(4rem,calc(env(safe-area-inset-top)+3rem))] pb-[max(0.75rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]">
        {renderLayout()}
      </div>
    </div>
  );
}

export default App;
