import { useEffect, useState, useRef } from 'react';
import AnalogVUMeter from './AnalogVUMeter';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    onClick?: () => void;
    onLevelsChange?: (left: number, right: number) => void;
}

const VUMeter: React.FC<Props> = ({ isRunning, wsUrl = 'ws://localhost:5005', onLevelsChange }) => {
    const [levels, setLevels] = useState({ left: -60, right: -60 });
    const [status, setStatus] = useState<'connected' | 'disconnected' | 'connecting'>('disconnected');
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

        const connect = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
                return;
            }

            cleanup();
            setStatus('connecting');
            console.log('VUMeter: Connecting to', wsUrl);

            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('VUMeter: Connected');
                    setStatus('connected');
                };

                ws.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        const response = data.GetCaptureSignalPeak ? data.GetCaptureSignalPeak : data;
                        if (response.result === 'Ok' && Array.isArray(response.value)) {
                            const [left, right] = response.value;
                            const newLevels = {
                                left: Math.max(-60, left),
                                right: Math.max(-60, right)
                            };
                            setLevels(newLevels);
                            onLevelsChange?.(newLevels.left, newLevels.right);
                        }
                    } catch (e) { }
                };

                ws.onclose = () => {
                    console.log('VUMeter: Closed');
                    wsRef.current = null;
                    setStatus('disconnected');
                    if (isRunning) {
                        reconnectTimeoutRef.current = setTimeout(connect, 2000);
                    }
                };

                ws.onerror = (err) => {
                    console.error('VUMeter: WS Error', err);
                    ws.close();
                };
            } catch (e) {
                console.error('VUMeter: Error', e);
                setStatus('disconnected');
                if (isRunning) {
                    reconnectTimeoutRef.current = setTimeout(connect, 2000);
                }
            }
        };

        const pollInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send('"GetCaptureSignalPeak"');
            }
        }, 100);

        connect();

        return () => {
            clearInterval(pollInterval);
            cleanup();
        };
    }, [isRunning, wsUrl, onLevelsChange]);

    return (
        <div className="flex-1 w-full h-full bg-[#1a1714] border border-[#2d2820] rounded-2xl p-3 md:p-6 flex flex-col shadow-2xl relative overflow-hidden group">
            {/* Header / Brand Plate */}
            <div className="flex justify-between items-center mb-2 md:mb-6 z-10">
                <div className="flex flex-col">
                    <div className="text-[10px] text-[#8B7355] uppercase font-black tracking-[0.3em]">
                        Handcrafted Precision
                    </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${status === 'connected' ? 'bg-[#003322] text-[#00ff88]' : status === 'connecting' ? 'bg-[#332200] text-[#ffaa00]' : 'bg-[#331111] text-[#ff4444]'}`}>
                    {status === 'connected' ? 'LIVE DATA' : status === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
                </div>
            </div>

            {/* Meters Container */}
            <div className="flex-1 flex flex-wrap items-center justify-center gap-2 md:gap-8 overflow-y-auto custom-scrollbar">
                <div className="flex-1 min-w-[180px] max-w-[320px]">
                    <AnalogVUMeter level={levels.left} channel="L" />
                </div>
                <div className="flex-1 min-w-[180px] max-w-[320px]">
                    <AnalogVUMeter level={levels.right} channel="R" />
                </div>
            </div>

            {/* Ambient Wood Texture Background (Subtle) */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')]" />
        </div>
    );
};

export default VUMeter;
