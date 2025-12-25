import { useEffect, useState } from 'react';
import axios from 'axios';
import FilterGraph from './components/FilterGraph';
import PEQEditor from './components/PEQEditor';
import VUMeter from './components/VUMeter';
import Lyrics from './components/Lyrics';
import type { FilterParam } from './types';
import {
  Play, Save, Zap, SkipBack, SkipForward, Pause,
  Layers, Music, Activity, MessageCircle, Settings, Server, Monitor
} from 'lucide-react';
import './index.css';

// Use current hostname to support access from any device on the local network
const API_HOST = window.location.hostname;
const API_URL = `http://${API_HOST}:3000/api`;

// Device-specific storage key (based on screen size category)
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
  visibility?: Record<string, boolean>;
  backend?: 'local' | 'raspi';
}

const BACKENDS = {
  local: { name: 'Local', wsUrl: `ws://${window.location.hostname}:1234`, icon: Monitor },
  raspi: { name: 'Raspberry Pi', wsUrl: 'ws://raspberrypi.local:1234', icon: Server }
} as const;

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
  const [visibility, setVisibility] = useState<Record<string, boolean>>({
    nowPlaying: true,
    vuMeter: true,
    peq: true,
    lyrics: true
  });
  const [showConfig, setShowConfig] = useState(false);
  const [backend, setBackend] = useState<'local' | 'raspi'>('local');
  const [raspiOnline, setRaspiOnline] = useState(false);

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
      if (res.data.plain) {
        setLyrics(res.data.plain);
      } else {
        setLyrics(null);
      }
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
        if (config.visibility) setVisibility(config.visibility);
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
    const config: SavedConfig = { filters, preamp, sampleRate, bitDepth, selectedPreset, visibility, backend };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }, [filters, preamp, sampleRate, bitDepth, selectedPreset, isLoaded, visibility, backend]);

  // Check Raspberry Pi connectivity
  useEffect(() => {
    const checkRaspi = async () => {
      try {
        const ws = new WebSocket(BACKENDS.raspi.wsUrl);
        const timeout = setTimeout(() => {
          ws.close();
          setRaspiOnline(false);
        }, 3000);
        ws.onopen = () => {
          clearTimeout(timeout);
          setRaspiOnline(true);
          ws.close();
        };
        ws.onerror = () => {
          clearTimeout(timeout);
          setRaspiOnline(false);
        };
      } catch {
        setRaspiOnline(false);
      }
    };
    checkRaspi();
    const interval = setInterval(checkRaspi, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    loadPresets();
    checkStatus();
    const interval = setInterval(checkStatus, 2000);
    return () => clearInterval(interval);
  }, []);

  const loadPresets = async () => {
    try {
      const res = await axios.get(`${API_URL}/presets`);
      setPresets(res.data || []);
    } catch (err) { }
  };

  const checkStatus = async () => {
    try {
      const res = await axios.get(`${API_URL}/status`);
      setIsRunning(res.data.running);
    } catch (err) { }
  };

  const selectPreset = async (name: string) => {
    if (!name) return;
    setSelectedPreset(name);
    try {
      const res = await axios.get(`${API_URL}/presets/${name}`);
      setFilters(res.data.filters);
      setPreamp(res.data.preamp);
    } catch (err: any) { alert("Load Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleStart = async () => {
    try {
      await axios.post(`${API_URL}/start`, {
        directConfig: { filters, preamp },
        sampleRate,
        bitDepth
      });
      await checkStatus();
    } catch (err: any) { alert("Start Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleStop = async () => {
    try {
      await axios.post(`${API_URL}/stop`);
      await checkStatus();
    } catch (err: any) { alert("Stop Failed: " + (err.response?.data?.error || err.message)); }
  };

  const handleSave = async () => {
    const name = prompt("Preset Name:", selectedPreset?.replace('.txt', '') || "New Preset");
    if (!name) return;
    try {
      await axios.post(`${API_URL}/presets`, { name, filters, preamp });
      loadPresets();
      setSelectedPreset(name.endsWith('.txt') ? name : name + '.txt');
    } catch (err) { alert('Save failed'); }
  };

  const toggleVisibility = (block: string) => {
    setVisibility(prev => ({ ...prev, [block]: !prev[block] }));
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

  return (
    <div className="flex flex-col h-screen bg-[#06060a] text-white overflow-hidden p-4 gap-4">

      {/* PROFESSIONAL RIBBON: BLOCK TOGGLES & CONFIG */}
      <div className="flex items-center justify-between bg-[#12121a] border border-[#1f1f2e] rounded-xl px-4 py-2 shadow-lg">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <Zap className="text-[#00ff88] animate-pulse" size={16} />
            <span className="text-[11px] font-black tracking-[0.4em] uppercase text-white/50">Artis Nova V4</span>
          </div>

          <div className="h-4 w-px bg-[#2a2a3e]" />

          {/* Module Toggles */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => toggleVisibility('nowPlaying')}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${visibility.nowPlaying ? 'bg-[#00d4ff]/10 text-[#00d4ff] border border-[#00d4ff]/20 shadow-[0_0_10px_rgba(0,212,255,0.1)]' : 'text-[#606080] hover:bg-white/5'}`}
              title="Toggle Now Playing"
            >
              <Music size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Playing</span>
            </button>
            <button
              onClick={() => toggleVisibility('vuMeter')}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${visibility.vuMeter ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20 shadow-[0_0_10px_rgba(0,255,136,0.1)]' : 'text-[#606080] hover:bg-white/5'}`}
              title="Toggle VU Meters"
            >
              <Activity size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Levels</span>
            </button>
            <button
              onClick={() => toggleVisibility('peq')}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${visibility.peq ? 'bg-[#ffaa00]/10 text-[#ffaa00] border border-[#ffaa00]/20 shadow-[0_0_10px_rgba(255,170,0,0.1)]' : 'text-[#606080] hover:bg-white/5'}`}
              title="Toggle Processing"
            >
              <Layers size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">EQ</span>
            </button>
            <button
              onClick={() => toggleVisibility('lyrics')}
              disabled={!lyrics}
              className={`p-2 rounded-lg transition-all flex items-center gap-2 ${!lyrics ? 'opacity-30 cursor-not-allowed' : visibility.lyrics ? 'bg-[#7b68ee]/10 text-[#7b68ee] border border-[#7b68ee]/20 shadow-[0_0_10px_rgba(123,104,238,0.1)]' : 'text-[#606080] hover:bg-white/5'}`}
              title={lyrics ? "Toggle Lyrics" : "No lyrics available"}
            >
              <MessageCircle size={14} />
              <span className="text-[10px] font-bold uppercase tracking-wider hidden sm:inline">Lyrics</span>
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Backend Selector */}
          <div className="flex items-center gap-1 bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg p-1">
            <button
              onClick={() => setBackend('local')}
              className={`px-2 py-1 rounded flex items-center gap-1.5 transition-all ${backend === 'local' ? 'bg-[#00d4ff]/20 text-[#00d4ff]' : 'text-[#606080] hover:text-white'}`}
              title="Local DSP"
            >
              <Monitor size={12} />
              <span className="text-[9px] font-bold">Local</span>
            </button>
            <button
              onClick={() => raspiOnline && setBackend('raspi')}
              disabled={!raspiOnline}
              className={`px-2 py-1 rounded flex items-center gap-1.5 transition-all ${!raspiOnline ? 'opacity-30 cursor-not-allowed' : backend === 'raspi' ? 'bg-[#ff6b9d]/20 text-[#ff6b9d]' : 'text-[#606080] hover:text-white'}`}
              title={raspiOnline ? "Raspberry Pi DSP" : "Raspberry Pi offline"}
            >
              <Server size={12} />
              <span className="text-[9px] font-bold">RPi</span>
              <div className={`w-1.5 h-1.5 rounded-full ${raspiOnline ? 'bg-[#00ff88]' : 'bg-[#ff4444]'}`} />
            </button>
          </div>

          {/* Sample Rate & Bit Depth Display */}
          <div className="flex items-center gap-2 bg-[#0a0a0f] border border-[#1f1f2e] rounded-lg px-3 py-1">
            <span className="text-[9px] text-[#404060] font-bold">SR</span>
            <span className="text-[10px] text-[#00d4ff] font-mono font-bold">{(sampleRate / 1000).toFixed(1)}k</span>
            <span className="text-[#2a2a3e]">/</span>
            <span className="text-[9px] text-[#404060] font-bold">BD</span>
            <span className="text-[10px] text-[#00d4ff] font-mono font-bold">{bitDepth}bit</span>
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-[9px] font-black tracking-widest ${isRunning ? 'text-[#00ff88]' : 'text-[#ff4444]'}`}>
              {isRunning ? "PROCESSING LIVE" : "ENGINE STANDBY"}
            </span>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2 rounded-lg transition-all ${showConfig ? 'bg-white/10 text-white' : 'text-[#606080] hover:bg-white/5'}`}
            >
              <Settings size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* SYSTEM CONFIG POPUP */}
      {showConfig && (
        <div className="absolute top-20 right-8 z-50 bg-[#1a1a28] border border-[#2a2a3e] rounded-2xl p-6 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-300 w-80">
          <h3 className="text-xs font-black text-[#606080] uppercase tracking-[0.3em] mb-4">DSP Configuration</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[9px] text-[#404060] font-bold uppercase">Sample Rate</label>
              <select
                value={sampleRate}
                onChange={(e) => setSampleRate(Number(e.target.value))}
                className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#00d4ff] font-bold outline-none"
              >
                <option value={44100}>44.1 kHz</option>
                <option value={48000}>48.0 kHz</option>
                <option value={88200}>88.2 kHz</option>
                <option value={96000}>96.0 kHz</option>
                <option value={192000}>192.0 kHz</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[9px] text-[#404060] font-bold uppercase">Bit Depth</label>
              <select
                value={bitDepth}
                onChange={(e) => setBitDepth(Number(e.target.value))}
                className="w-full bg-[#0a0a0f] border border-[#2a2a3e] rounded-lg p-2 text-xs text-[#00d4ff] font-bold outline-none"
              >
                <option value={16}>16-bit PCM</option>
                <option value={24}>24-bit PCM</option>
                <option value={32}>32-bit Float</option>
              </select>
            </div>
            <div className="pt-2">
              <p className="text-[10px] text-[#606080] italic">Settings take effect after restarting DSP.</p>
            </div>
          </div>
        </div>
      )}

      {/* MODULAR DASHBOARD GRID */}
      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">

        {/* Main Workspace (Left/Center) */}
        <div className={`flex-[7] flex flex-col gap-4 min-h-0 min-w-0 ${!visibility.lyrics || !lyrics ? 'w-full' : ''}`}>

          {/* Top Half (Now Playing & VU) */}
          {(visibility.nowPlaying || visibility.vuMeter) && (
            <div className={`flex-[4] flex gap-4 min-h-0`}>
              {visibility.nowPlaying && (
                <div className="flex-[4] bg-[#18151f] border border-[#2a2535] rounded-2xl relative overflow-hidden group shadow-xl flex flex-col items-center justify-center p-4 md:p-6 min-w-0">
                  {/* Ambient Background */}
                  {nowPlaying.artworkUrl && (
                    <div className="absolute inset-0 opacity-10 filter blur-3xl scale-125 transform transition-transform duration-1000 group-hover:scale-110">
                      <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div className="relative z-10 flex flex-col md:flex-row items-center gap-3 md:gap-6 w-full">
                    {/* Album Art */}
                    <div className="w-24 h-24 md:w-32 md:h-32 lg:w-40 lg:h-40 bg-[#1a1a28] rounded-xl md:rounded-2xl overflow-hidden shadow-xl border border-[#2a2a3e] relative flex-shrink-0">
                      {nowPlaying.artworkUrl ? (
                        <img src={nowPlaying.artworkUrl.startsWith('http') ? nowPlaying.artworkUrl : `${API_URL.replace('/api', '')}${nowPlaying.artworkUrl}`} alt="Album Art" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[#2a2a3e]">
                          <Zap size={36} strokeWidth={1} />
                        </div>
                      )}
                    </div>
                    {/* Track Info & Controls */}
                    <div className="flex flex-col items-center md:items-start gap-2 md:gap-3 flex-1 min-w-0">
                      <div className="text-center md:text-left w-full">
                        <h2 className="text-lg md:text-xl font-bold tracking-tight text-white line-clamp-1">{nowPlaying.track || 'Standby'}</h2>
                        <p className="text-sm text-[#00d4ff] font-medium line-clamp-1">{nowPlaying.artist || 'Waiting for audio...'}</p>
                      </div>
                      {/* Playback Controls - Always visible */}
                      <div className="flex items-center gap-3 md:gap-4">
                        <button onClick={() => axios.post(`${API_URL}/media/prev`).catch(() => { })} className="p-3 md:p-2 rounded-full bg-white/5 active:bg-white/10 transition-all text-[#606080] hover:text-[#00d4ff]">
                          <SkipBack size={22} />
                        </button>
                        <button onClick={() => axios.post(`${API_URL}/media/playpause`).catch(() => { })} className="p-4 md:p-4 bg-[#00ff88]/10 hover:bg-[#00ff88]/20 rounded-full transition-all active:scale-90 border border-[#00ff88]/20">
                          {nowPlaying.state === 'playing' ? <Pause size={28} className="text-[#ffaa00]" fill="currentColor" /> : <Play size={28} className="text-[#00ff88]" fill="currentColor" />}
                        </button>
                        <button onClick={() => axios.post(`${API_URL}/media/next`).catch(() => { })} className="p-3 md:p-2 rounded-full bg-white/5 active:bg-white/10 transition-all text-[#606080] hover:text-[#00d4ff]">
                          <SkipForward size={22} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {visibility.vuMeter && (
                <div className="flex-[4] min-w-0">
                  <VUMeter isRunning={isRunning} wsUrl={BACKENDS[backend].wsUrl} />
                </div>
              )}
            </div>
          )}

          {/* Bottom Half (PEQ & Graph) */}
          {visibility.peq && (
            <div className={`flex-[6] flex gap-4 min-h-0`}>
              <div className="flex-[4] bg-[#0e1318] border border-[#1a2530] rounded-2xl overflow-hidden relative p-6 shadow-xl min-w-0">
                <div className="absolute top-4 left-6 z-10 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#00d4ff] shadow-[0_0_8px_#00d4ff]" />
                  <span className="text-[9px] text-[#606080] font-black tracking-[0.2em] uppercase">Analyzer</span>
                </div>
                <div className="w-full h-full pt-4">
                  <FilterGraph filters={filters} preamp={preamp} />
                </div>
              </div>

              <div className="flex-[4] flex flex-col bg-[#141416] border border-[#252528] rounded-2xl overflow-hidden shadow-xl min-w-0">
                <div className="p-3 bg-white/5 border-b border-[#1f1f2e] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <select
                      value={selectedPreset || ''}
                      onChange={e => e.target.value ? selectPreset(e.target.value) : handleNewPreset()}
                      className="bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-3 py-1 text-[10px] text-[#00d4ff] font-bold outline-none transition-colors hover:border-[#00d4ff]/50 min-w-[140px]"
                    >
                      <option value="">+ New Preset</option>
                      {presets.map(p => <option key={p} value={p}>{p.replace('.txt', '')}</option>)}
                    </select>
                    <button onClick={handleSave} className="p-1.5 text-[#606080] hover:text-white transition-colors"><Save size={14} /></button>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 bg-[#1a1a28] border border-[#2a2a3e] rounded-lg px-2 py-1">
                      <span className="text-[8px] text-[#404060] font-black">GAIN</span>
                      <input type="number" step={0.1} value={preamp || 0} onChange={e => setPreamp(Number(e.target.value) || 0)} className="w-10 bg-transparent text-center text-xs text-[#ffaa00] font-mono outline-none" />
                    </div>
                    {!isRunning ? (
                      <button onClick={handleStart} className="bg-gradient-to-r from-[#00d4ff] to-[#7b68ee] text-white px-3 py-1.5 rounded-lg font-black text-[9px] hover:opacity-90 shadow-lg active:scale-95 transition-all">START</button>
                    ) : (
                      <button onClick={handleStop} className="bg-[#ff6b9d] text-white px-3 py-1.5 rounded-lg font-black text-[9px] hover:bg-[#ff5a8a] shadow-lg active:scale-95 transition-all">STOP</button>
                    )}
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                  <PEQEditor filters={filters} onChange={setFilters} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Lyrics Sidebar (Right) */}
        {visibility.lyrics && lyrics && (
          <div className="flex-[3] min-w-0 h-full">
            <Lyrics lyrics={lyrics} trackInfo={{ track: nowPlaying.track, artist: nowPlaying.artist }} />
          </div>
        )}

      </div>
    </div>
  );
}

export default App;
