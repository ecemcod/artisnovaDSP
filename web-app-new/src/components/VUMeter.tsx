import { useEffect, useState, useRef } from 'react';
import AnalogVUMeter from './AnalogVUMeter';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    onClick?: () => void;
    onLevelsChange?: (left: number, right: number) => void;
}

const VUMeter: React.FC<Props> = ({ isRunning, wsUrl = 'ws://localhost:1234', onLevelsChange }) => {
    const [levels, setLevels] = useState({ left: -60, right: -60 });
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
        };

        if (!isRunning) {
            setLevels({ left: -60, right: -60 });
            cleanup();
            return;
        }

        const connect = () => {
            if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
                return;
            }

            try {
                const ws = new WebSocket(wsUrl);
                wsRef.current = ws;

                ws.onopen = () => {
                    console.log('VUMeter: Connected to CamillaDSP websocket');
                    if (reconnectTimeoutRef.current) {
                        clearTimeout(reconnectTimeoutRef.current);
                        reconnectTimeoutRef.current = null;
                    }
                };

                ws.onmessage = (event) => {
                    if (ws.readyState !== WebSocket.OPEN) return;
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
                    } catch { }
                };

                ws.onclose = () => {
                    wsRef.current = null;
                    if (isRunning) {
                        reconnectTimeoutRef.current = setTimeout(connect, 1000);
                    }
                };
            } catch (e) {
                if (isRunning) {
                    reconnectTimeoutRef.current = setTimeout(connect, 1000);
                }
            }
        };

        const pollInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send('"GetCaptureSignalPeak"');
            }
        }, 50);

        connect();

        return () => {
            clearInterval(pollInterval);
            cleanup();
        };
    }, [isRunning, wsUrl, onLevelsChange]);

    return (
        <div className="flex-1 w-full h-full bg-[#1a1714] border border-[#2d2820] rounded-2xl p-6 flex flex-col shadow-2xl relative overflow-hidden group">
            {/* Header / Brand Plate */}
            <div className="flex justify-between items-center mb-6 z-10">
                <div className="flex flex-col">
                    <div className="text-[10px] text-[#8B7355] uppercase font-black tracking-[0.3em]">
                        Handcrafted Precision
                    </div>
                </div>
                <div className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${wsRef.current?.readyState === WebSocket.OPEN ? 'bg-[#003322] text-[#00ff88]' : 'bg-[#331111] text-[#ff4444]'}`}>
                    {wsRef.current?.readyState === WebSocket.OPEN ? 'LIVE DATA' : 'DISCONNECTED'}
                </div>
            </div>

            {/* Meters Container */}
            <div className="flex-1 flex items-center justify-around gap-8">
                <div className="transform scale-110">
                    <AnalogVUMeter level={levels.left} channel="L" />
                </div>
                <div className="transform scale-110">
                    <AnalogVUMeter level={levels.right} channel="R" />
                </div>
            </div>

            {/* Ambient Wood Texture Background (Subtle) */}
            <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/dark-wood.png')]" />
        </div>
    );
};

export default VUMeter;
