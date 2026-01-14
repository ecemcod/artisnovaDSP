import { useEffect, useState, useRef } from 'react';
import AnalogVUMeter from './AnalogVUMeter';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    onClick?: () => void;
    onLevelsChange?: (left: number, right: number) => void;
    className?: string;
}

const VUMeter: React.FC<Props> = ({ isRunning, wsUrl = 'ws://localhost:5005', onLevelsChange, className = "" }) => {
    const isMobile = typeof window !== 'undefined' ? window.innerWidth < 768 : false;
    const [levels, setLevels] = useState({ left: -60, right: -60 });
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const [silenceDuration, setSilenceDuration] = useState(0);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastSignalTimeRef = useRef<number>(Date.now());

    // Check if we're in "no signal" state (connected but silence for 5+ seconds)
    const isNoSignal = status === 'connected' && silenceDuration >= 5;

    useEffect(() => {
        const cleanup = () => {
            if (wsRef.current) {
                wsRef.current.close();
                wsRef.current = null;
            }
            if (reconnectTimeoutRef.current) {
                clearTimeout(reconnectTimeoutRef.current);
                reconnectTimeoutRef.current = null;
            }
            setStatus('disconnected');
        };

        const connect = (overrideUrl?: string) => {
            if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
                return;
            }

            cleanup();
            setStatus('connecting');

            // Determine which URL to use
            let currentUrl = overrideUrl;
            if (!currentUrl) {
                if (isRunning) {
                    currentUrl = wsUrl;
                } else {
                    // Force using the current hostname for the probe to ensure accessibility
                    currentUrl = `ws://${window.location.hostname}:3000/ws/levels`;
                }
            }

            console.log('VUMeter: Connecting to', currentUrl);

            try {
                const ws = new WebSocket(currentUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('VUMeter: Connected to', currentUrl);
                    setStatus('connected');
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        // Handle both CamillaDSP format and Server Probe format (simple array)
                        const value = data.GetCaptureSignalPeak ? data.GetCaptureSignalPeak.value : (Array.isArray(data) ? data : null);

                        if (value && Array.isArray(value)) {
                            const [left, right] = value;
                            const newLevels = {
                                left: Math.max(-60, left),
                                right: Math.max(-60, right)
                            };
                            setLevels(newLevels);
                            onLevelsChange?.(newLevels.left, newLevels.right);

                            // Track silence duration
                            if (left > -60 || right > -60) {
                                lastSignalTimeRef.current = Date.now();
                                setSilenceDuration(0);
                            } else {
                                const silenceSeconds = Math.floor((Date.now() - lastSignalTimeRef.current) / 1000);
                                setSilenceDuration(silenceSeconds);
                            }
                        }
                    } catch (e) { }
                };

                ws.onclose = () => {
                    console.log('VUMeter: Closed');
                    wsRef.current = null;
                    setStatus('disconnected');

                    // Retry logic: toggle between DSP and Probe if needed
                    const isProbe = currentUrl.includes('/ws/levels');
                    let nextUrl = currentUrl;

                    if (!isProbe && !isRunning) {
                        // If we were trying DSP but it's not running, try probe
                        nextUrl = `ws://${window.location.hostname}:3000/ws/levels`;
                    } else if (isProbe && isRunning) {
                        // If we were on probe but DSP is back, try DSP
                        nextUrl = wsUrl;
                    }

                    console.log(`VUMeter: Reconnecting to ${nextUrl} in 2s...`);
                    reconnectTimeoutRef.current = setTimeout(() => {
                        connect(nextUrl);
                    }, 2000);
                };

                ws.onerror = (err) => {
                    console.error('VUMeter: WS Error', err);
                    ws.close();
                };
            } catch (e) {
                console.error('VUMeter: Error', e);
                setStatus('disconnected');
                reconnectTimeoutRef.current = setTimeout(() => connect(), 2000);
            }
        };

        const pollInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN && wsRef.current.url.includes(':5005')) {
                wsRef.current.send('"GetCaptureSignalPeak"');
            }
        }, 200);

        connect();

        return () => {
            clearInterval(pollInterval);
            cleanup();
        };
    }, [isRunning, wsUrl, onLevelsChange]);

    // Determine status badge
    const getStatusBadge = () => {
        if (status === 'disconnected') return { text: 'OFFLINE', className: 'bg-accent-danger/10 text-accent-danger border border-accent-danger/20' };
        if (status === 'connecting') return { text: 'CONNECTING', className: 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20' };
        if (isNoSignal) return { text: 'NO SIGNAL', className: 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20 animate-pulse' };
        return { text: 'LIVE', className: 'bg-accent-success/10 text-accent-success border border-accent-success/20' };
    };

    const statusBadge = getStatusBadge();

    return (
        <div className={`w-full h-full flex flex-col relative overflow-hidden group vumeter-main-wrapper ${className}`}>
            {/* Header / Brand Plate */}
            <div className={`flex justify-between items-center z-10 shrink-0 ${isMobile ? 'mb-1' : 'mb-1 md:mb-10'}`}>
                <div className="flex flex-col">
                    <div className="text-[10px] text-themed-muted uppercase font-black tracking-[0.3em] header-text">
                        Analog Monitoring
                    </div>
                </div>
                <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest ${statusBadge.className}`}>
                    {statusBadge.text}
                </div>
            </div>

            {/* Meters Container */}
            <div className="flex-1 flex flex-row items-center justify-center gap-2 md:gap-8 min-h-0 overflow-hidden">
                <div className="flex-1 h-full min-h-0">
                    <AnalogVUMeter level={levels.left} channel="L" />
                </div>
                <div className="flex-1 h-full min-h-0">
                    <AnalogVUMeter level={levels.right} channel="R" />
                </div>
            </div>
        </div>
    );
};

export default VUMeter;
