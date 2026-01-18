import React, { useEffect, useRef } from 'react';

interface Props {
    isRunning: boolean;
    wsUrl?: string;
}


// Start from 20Hz, logarithmic spacing
const FREQUENCIES = [20, 25, 31, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, '1k', '1.2k', '1.6k', '2k', '2.5k', '3.1k', '4k', '5k', '6.3k', '8k', '10k', '12.5k', '16k', '20k'];
const DEFAULT_BANDS = 31;

const RTA: React.FC<Props> = ({ isRunning }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const dataRef = useRef<number[]>(new Array(DEFAULT_BANDS).fill(-100));

    // Animation looping
    useEffect(() => {
        // RTA data comes from the Control Server (server.js), NOT directly from CamillaDSP (port 5005).
        // In Prod (served by express): use window.location.host
        // In Dev (vite:5173): use localhost:3000
        let url = 'ws://localhost:3000';
        if (typeof window !== 'undefined') {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            // If we are served by the backend (port 3000/9000), use that.
            // If we are in Vite dev (port 5173), hardcode to 3000.
            if (window.location.port !== '5173') {
                url = `${protocol}//${window.location.host}`;
            }
        }

        console.log('RTA connecting to:', url);
        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'rta' && Array.isArray(msg.data)) {
                    // Decay smoothing in animation loop, here we just catch target
                    // Or direct update?
                    // Backend sends computed frame, let's interpolate or just use it.
                    dataRef.current = msg.data;
                }
            } catch (e) { }
        };

        return () => {
            ws.close();
        };
    }, []);

    // Canvas Draw Loop
    useEffect(() => {
        let animationId: number;

        const draw = () => {
            if (!isRunning) {
                animationId = requestAnimationFrame(draw);
                return;
            }
            if (!canvasRef.current) return;
            const ctx = canvasRef.current.getContext('2d');
            if (!ctx) return;

            const w = canvasRef.current.width;
            const h = canvasRef.current.height;
            // More gap, thinner bars
            const totalWidth = w * 0.9; // 90% width used (margins)
            const marginX = w * 0.05;

            const barWidth = (totalWidth / DEFAULT_BANDS) * 0.6; // Thinner bars (60% fill)
            const gap = (totalWidth / DEFAULT_BANDS) * 0.4;

            ctx.clearRect(0, 0, w, h);

            // Draw
            dataRef.current.forEach((db, i) => {
                // Map -100dB to 0dB -> 0 to Height
                const normalized = Math.max(0, (db + 100) / 100);
                // Non-linear scaling for visual punch
                const visualHeight = Math.pow(normalized, 1.2) * h;

                const x = marginX + (i * (barWidth + gap)) + gap / 2;
                const y = h - visualHeight;

                // Gradient Fill - Blue -> Cyan (Cool tones)
                const gradient = ctx.createLinearGradient(0, h, 0, 0);
                gradient.addColorStop(0, '#000088');   // Dark Blue bottom
                gradient.addColorStop(0.5, '#0044ff'); // Medium Blue mid
                gradient.addColorStop(1.0, '#00ffff'); // Cyan top

                ctx.fillStyle = gradient;

                // Draw Bar
                ctx.fillRect(x, y, barWidth, visualHeight);

                // Draw Reflection
                ctx.globalAlpha = 0.2;
                ctx.fillRect(x, h + 2, barWidth, visualHeight * 0.3);
                ctx.globalAlpha = 1.0;
            });

            animationId = requestAnimationFrame(draw);
        };

        animationId = requestAnimationFrame(draw);
        return () => cancelAnimationFrame(animationId);
    }, []);

    return (
        <div className="w-full h-full flex flex-col pt-8">
            <div className="flex-1 min-h-0 relative">
                <canvas
                    ref={canvasRef}
                    width={1000}
                    height={400}
                    className="w-full h-full object-contain"
                />
            </div>

            {/* Frequency Axis - Aligned with Canvas Margins (5% left/right) */}
            <div className="h-8 w-full flex justify-between px-[5%] opacity-50 text-[9px] font-mono mt-2 border-t border-white/10 pt-1">
                {FREQUENCIES.map((freq, i) => (
                    // Show every 3rd label for space on mobile, or check width
                    <div key={i} className="text-center w-4 -ml-2 transform -rotate-45 origin-center hidden md:block">
                        {freq}
                    </div>
                ))}
                {/* Mobile simplified labels */}
                <div className="md:hidden flex w-full justify-between">
                    <span>20</span>
                    <span>100</span>
                    <span>1k</span>
                    <span>10k</span>
                    <span>20k</span>
                </div>
            </div>
        </div>
    );
};

export default RTA;
