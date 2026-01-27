import React, { useEffect, useRef } from 'react';
import { lightenColor } from '../utils/colorExtractor';

export type RTASkin = 'blue' | 'red' | 'traffic' | 'soft' | 'neon' | 'sunset' | 'forest' | 'ocean' | 'gold' | 'cyber' | 'dynamic';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
    skin?: RTASkin;
    isAsymmetric?: boolean;
    isFrozen?: boolean;
    customColor?: string | null;
}

const PALETTES: Record<RTASkin, string[]> = {
    blue: ['#000088', '#0044ff', '#00ffff'],
    red: ['#440000', '#ff0000', '#ffaa00'],
    traffic: ['#004400', '#ffff00', '#ff0000'],
    soft: ['#332244', '#6644aa', '#9988ff'],
    neon: ['#ff00ff', '#00ff00', '#ffff00'],
    sunset: ['#ff4e50', '#f9d423', '#8e44ad'],
    forest: ['#004d00', '#2ecc71', '#a2d149'],
    ocean: ['#014b7c', '#00a8cc', '#c1e3ed'],
    gold: ['#784c01', '#d4af37', '#fcf6ba'],
    cyber: ['#fff000', '#ed008c', '#00aeef']
};

const FREQUENCIES = [20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, '1k', '1.2k', '1.6k', '2k', '2.5k', '3.1k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k', '20k'];
const DEFAULT_BANDS = 31;

const RTA: React.FC<Props> = ({ isRunning, skin = 'blue', isAsymmetric = false, isFrozen = false, customColor }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const isFrozenRef = useRef(isFrozen);

    // Sync ref with prop for use in event listeners
    React.useEffect(() => {
        isFrozenRef.current = isFrozen;
    }, [isFrozen]);
    // Support both single array and L/R object
    const dataRef = useRef<{ left: number[], right: number[] }>({
        left: new Array(DEFAULT_BANDS).fill(-100),
        right: new Array(DEFAULT_BANDS).fill(-100)
    });

    useEffect(() => {
        let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
        let watchdogTimeout: ReturnType<typeof setTimeout> | null = null;
        let isCleaningUp = false;

        const resetWatchdog = () => {
            if (watchdogTimeout) clearTimeout(watchdogTimeout);
            if (isRunning) {
                watchdogTimeout = setTimeout(() => {
                    console.warn('RTA: No data received for 3s. Reconnecting...');
                    if (wsRef.current) wsRef.current.close();
                }, 3000);
            }
        };

        const connect = () => {
            if (isCleaningUp) return;

            // In development (port 3000), Vite's WS proxy doesn't work reliably
            // Connect directly to the backend on port 3001
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const isDev = window.location.port === '3000';
            const host = isDev ? `${window.location.hostname}:3001` : window.location.host;
            const url = `${protocol}//${host}/ws`;

            console.log(`RTA: Connecting to ${isDev ? 'backend' : 'proxy'}: ${url}`);
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onmessage = (event) => {
                if (isCleaningUp || isFrozenRef.current) return;
                resetWatchdog();
                try {
                    const msg = JSON.parse(event.data);
                    if (msg.type === 'rta') {
                        if (msg.left && msg.right) {
                            dataRef.current = { left: msg.left, right: msg.right };
                        } else if (Array.isArray(msg.data)) {
                            dataRef.current = { left: msg.data, right: msg.data };
                        }
                    }
                } catch (e) { }
            };

            ws.onclose = () => {
                if (isCleaningUp) return;
                console.log('RTA: WebSocket closed. Reconnecting...');
                wsRef.current = null;
                reconnectTimeout = setTimeout(connect, 2000);
            };

            ws.onerror = (err) => {
                console.warn('RTA: WebSocket error, closing...', err);
                ws.close();
            };

            resetWatchdog();
        };

        connect();

        return () => {
            isCleaningUp = true;
            if (wsRef.current) wsRef.current.close();
            if (reconnectTimeout) clearTimeout(reconnectTimeout);
            if (watchdogTimeout) clearTimeout(watchdogTimeout);
        };
    }, [isRunning]);

    useEffect(() => {
        let animationId: number;

        const draw = () => {
            if (!isRunning || !canvasRef.current) {
                animationId = requestAnimationFrame(draw);
                return;
            }
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;

            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            let colors = PALETTES[skin] || PALETTES.blue;

            if (skin === 'dynamic' && customColor) {
                // Generate dynamic gradient: Base (Bottom) -> Lighter (Top)
                colors = [
                    customColor,
                    lightenColor(customColor, 0.3),
                    lightenColor(customColor, 0.6)
                ];
            } else if (skin === 'dynamic') {
                // Fallback if no color provided
                colors = PALETTES.blue;
            }

            ctx.clearRect(0, 0, w, h);

            const drawBands = (data: number[], startX: number, width: number, reverse: boolean) => {
                const barWidth = (width / DEFAULT_BANDS) * 0.6;
                const gap = (width / DEFAULT_BANDS) * 0.4;

                data.forEach((db, i) => {
                    const normalized = Math.max(0, (db + 100) / 100);
                    const visualHeight = Math.pow(normalized, 1.2) * h;

                    const idx = reverse ? (DEFAULT_BANDS - 1 - i) : i;
                    const x = startX + (idx * (barWidth + gap)) + gap / 2;
                    const y = h - visualHeight;

                    const gradient = ctx.createLinearGradient(0, h, 0, 0);
                    gradient.addColorStop(0, colors[0]);
                    gradient.addColorStop(0.5, colors[1]);
                    gradient.addColorStop(1.0, colors[2]);

                    ctx.fillStyle = gradient;
                    ctx.fillRect(x, y, barWidth, visualHeight);

                    ctx.globalAlpha = 0.2;
                    ctx.fillRect(x, h + 2, barWidth, visualHeight * 0.3);
                    ctx.globalAlpha = 1.0;
                });
            };

            if (isAsymmetric) {
                const margin = w * 0.02;
                const channelWidth = (w - margin * 3) / 2;

                // Left channel on the left
                drawBands(dataRef.current.left, margin, channelWidth, false);
                // Right channel on the right
                drawBands(dataRef.current.right, margin * 2 + channelWidth, channelWidth, false);
            } else {
                const totalWidth = w * 0.9;
                const marginX = w * 0.05;
                drawBands(dataRef.current.left, marginX, totalWidth, false);
            }

            animationId = requestAnimationFrame(draw);
        };

        animationId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animationId);
    }, [isRunning, skin, isAsymmetric, customColor]);

    return (
        <div className="w-full h-full flex flex-col pt-4 md:pt-8">
            <div className="flex-1 min-h-0 relative group">
                <canvas
                    ref={canvasRef}
                    width={1000}
                    height={400}
                    className="w-full h-full object-contain"
                />
            </div>

            <div className="h-8 w-full flex justify-between px-[5%] opacity-50 text-[9px] font-mono mt-2 border-t border-white/10 pt-1">
                {isAsymmetric ? (
                    <div className="flex w-full justify-between items-center px-4">
                        <div className="flex gap-10"><span>L</span><span className="opacity-30">20Hz-20kHz</span></div>
                        <div className="flex gap-10"><span className="opacity-30">20Hz-20kHz</span><span>R</span></div>
                    </div>
                ) : (
                    <>
                        {FREQUENCIES.map((freq, i) => (
                            <div key={i} className="text-center w-4 -ml-2 transform -rotate-45 origin-center hidden md:block">
                                {freq}
                            </div>
                        ))}
                        <div className="md:hidden flex w-full justify-between">
                            <span>20</span><span>100</span><span>1k</span><span>10k</span><span>20k</span>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default RTA;
