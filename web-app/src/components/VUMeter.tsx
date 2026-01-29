import { useEffect, useState, useRef } from 'react';
import AnalogVUMeter from './AnalogVUMeter';
import { RefreshCw } from 'lucide-react';
import axios from 'axios';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    onClick?: () => void;
    onLevelsChange?: (left: number, right: number) => void;
    className?: string;
    skin?: 'modern' | 'classic' | 'dark' | 'minimal' | 'retro' | 'waves';
    customColor?: string | null;
}

const VUMeter: React.FC<Props> = ({ isRunning, wsUrl = 'ws://localhost:5005', onLevelsChange, className = "", skin = 'modern', customColor }) => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    const [levels, setLevels] = useState({ left: -60, right: -60 });
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const [silenceDuration, setSilenceDuration] = useState(0);
    const [isReconnecting, setIsReconnecting] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSignalTimeRef = useRef<number>(Date.now());

    // Check if we're in "no signal" state (connected but silence for 5+ seconds)
    const isNoSignal = status === 'connected' && silenceDuration >= 5;

    // Use refs for reactive values to prevent useEffect closure staleness or redundant re-runs
    const isRunningRef = useRef(isRunning);
    const wsUrlRef = useRef(wsUrl);
    const onLevelsChangeRef = useRef(onLevelsChange);

    useEffect(() => {
        isRunningRef.current = isRunning;
        wsUrlRef.current = wsUrl;
        onLevelsChangeRef.current = onLevelsChange;
    }, [isRunning, wsUrl, onLevelsChange]);

    const cleanup = () => {
        if (wsRef.current) {
            wsRef.current.onclose = null;
            wsRef.current.onerror = null;
            wsRef.current.close();
            wsRef.current = null;
        }
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = null;
        }
    };

    const connect = (isCleaningUp: { current: boolean }) => {
        if (isCleaningUp.current) return;
        if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
            return;
        }

        cleanup();
        setStatus('connecting');

        // In development (port 3000), Vite's WS proxy doesn't work reliably
        // Connect directly to the backend on port 3001
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const isDev = window.location.port === '3000';
        const host = isDev ? `${window.location.hostname}:3001` : window.location.host;
        const currentUrl = `${protocol}//${host}/ws/levels`;

        console.log(`VUMeter: Connecting to: ${currentUrl}`);

        try {
            const ws = new WebSocket(currentUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                if (isCleaningUp.current) return;
                console.log(`VUMeter: CONNECTED to proxy`);
                setStatus('connected');
            };

            ws.onmessage = (event) => {
                if (isCleaningUp.current) return;
                try {
                    const data = JSON.parse(event.data);

                    // Proxy format is usually just the level array [L, R]
                    // but we handle standard Camilla format too for resilience
                    const value = Array.isArray(data) ? data : (data.GetCaptureSignalPeak ? data.GetCaptureSignalPeak.value : null);

                    if (value && Array.isArray(value) && value.length >= 2) {
                        const [left, right] = value;
                        const leftNum = typeof left === 'number' ? left : parseFloat(left);
                        const rightNum = typeof right === 'number' ? right : parseFloat(right);

                        if (isNaN(leftNum) || isNaN(rightNum)) return;

                        const newLevels = {
                            left: Math.max(-100, leftNum),
                            right: Math.max(-100, rightNum)
                        };

                        setLevels(newLevels);
                        onLevelsChangeRef.current?.(newLevels.left, newLevels.right);

                        if (newLevels.left > -100 || newLevels.right > -100) {
                            lastSignalTimeRef.current = Date.now();
                            setSilenceDuration(0);
                        } else {
                            const silenceSeconds = Math.floor((Date.now() - lastSignalTimeRef.current) / 1000);
                            setSilenceDuration(silenceSeconds);
                        }
                    }
                } catch (e) {
                    console.error('VUMeter: Parse error', e);
                }
            };

            ws.onclose = () => {
                if (isCleaningUp.current) return;
                wsRef.current = null;
                setStatus('disconnected');
                if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = setTimeout(() => connect(isCleaningUp), 1000); // Reduced from 2000ms to 1000ms
            };

            ws.onerror = (err) => {
                if (isCleaningUp.current) return;
                console.error('VUMeter: WS Error', err);
                ws.close();
            };
        } catch (e) {
            if (isCleaningUp.current) return;
            console.error('VUMeter: Connection error', e);
            setStatus('disconnected');
            if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
            reconnectTimeoutRef.current = setTimeout(() => connect(isCleaningUp), 1500); // Reduced from 3000ms to 1500ms
        }
    };

    useEffect(() => {
        const isCleaningUp = { current: false };
        connect(isCleaningUp);

        return () => {
            isCleaningUp.current = true;
            cleanup();
        };
    }, []);

    // Manual reconnect handler
    const handleReconnect = async () => {
        if (isReconnecting) return;

        setIsReconnecting(true);
        console.log('VUMeter: Manual reconnect triggered');

        try {
            // Call backend to restart probe
            await axios.post('/api/probe/restart');

            // Close current WS and reconnect
            cleanup();
            setStatus('connecting');

            // Wait a moment for backend to restart
            await new Promise(r => setTimeout(r, 1000));

            // Reconnect WebSocket
            const isCleaningUp = { current: false };
            connect(isCleaningUp);
        } catch (err) {
            console.error('VUMeter: Reconnect failed', err);
        } finally {
            setIsReconnecting(false);
        }
    };

    // Determine status badge
    const getStatusBadge = () => {
        if (status === 'disconnected') return { text: 'OFFLINE', className: 'bg-accent-danger/10 text-accent-danger border border-accent-danger/20' };
        if (status === 'connecting') return { text: 'CONNECTING', className: 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20' };
        if (isNoSignal) return { text: 'NO SIGNAL', className: 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20 animate-pulse' };
        return { text: 'LIVE', className: 'bg-accent-success/10 text-accent-success border border-accent-success/20' };
    };

    const statusBadge = getStatusBadge();

    return (
        <div className={`w-full h-full flex flex-col relative overflow-visible group vumeter-main-wrapper ${className}`}>
            {/* Header / Brand Plate */}
            <div className={`flex justify-between items-center z-10 shrink-0 ${isMobile ? 'mb-1' : 'mb-1 md:mb-10'}`}>
                <div className="flex flex-col">
                    <div className="text-[10px] text-themed-muted uppercase font-black tracking-[0.3em] header-text">
                        Analog Monitoring
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Reconnect Button */}
                    <button
                        onClick={handleReconnect}
                        disabled={isReconnecting}
                        className={`p-1.5 rounded-lg border transition-all duration-200 ${isReconnecting
                            ? 'bg-accent-primary/20 text-accent-primary border-accent-primary/30 cursor-wait'
                            : 'bg-white/5 text-themed-muted border-white/10 hover:bg-white/10 hover:text-themed-primary hover:border-white/20'
                            }`}
                        title="Reconnect VU Meters"
                    >
                        <RefreshCw size={12} className={isReconnecting ? 'animate-spin' : ''} />
                    </button>
                    {/* Status Badge */}
                    <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest ${statusBadge.className}`}>
                        {statusBadge.text}
                    </div>
                </div>
            </div>

            {/* Meters Container - Added padding-bottom to prevent shadow clipping */}
            <div className="flex-1 flex flex-row items-center justify-center gap-2 md:gap-8 min-h-0 overflow-visible pb-4">
                <div className="flex-1 min-w-0">
                    <AnalogVUMeter level={levels.left} channel="L" skin={skin} customColor={customColor} />
                </div>
                <div className="flex-1 min-w-0">
                    <AnalogVUMeter level={levels.right} channel="R" skin={skin} customColor={customColor} />
                </div>
            </div>
        </div>
    );
};

export default VUMeter;
