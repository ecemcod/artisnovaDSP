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
        <div className="flex-1 w-full h-full bg-themed-panel border border-themed-medium rounded-xl p-6 md:p-10 flex flex-col shadow-2xl relative overflow-hidden group">
            {/* Header / Brand Plate */}
            <div className="flex justify-between items-center mb-6 md:mb-10 z-10">
                <div className="flex flex-col">
                    <div className="text-[10px] text-themed-muted uppercase font-black tracking-[0.3em] header-text">
                        Analog Monitoring
                    </div>
                </div>
                <div className={`px-2 py-0.5 rounded-lg text-[10px] font-black tracking-widest ${status === 'connected' ? 'bg-accent-success/10 text-accent-success border border-accent-success/20' : status === 'connecting' ? 'bg-accent-warning/10 text-accent-warning border border-accent-warning/20' : 'bg-accent-danger/10 text-accent-danger border border-accent-danger/20'}`}>
                    {status === 'connected' ? 'LIVE' : status === 'connecting' ? 'CONNECTING' : 'OFFLINE'}
                </div>
            </div>

            {/* Meters Container */}
            <div className="flex-1 flex flex-wrap items-center justify-center gap-6 md:gap-12 overflow-y-auto custom-scrollbar">
                <div className="flex-1 min-w-[180px] max-w-[320px]">
                    <AnalogVUMeter level={levels.left} channel="L" />
                </div>
                <div className="flex-1 min-w-[180px] max-w-[320px]">
                    <AnalogVUMeter level={levels.right} channel="R" />
                </div>
            </div>
        </div>
    );
};

export default VUMeter;
