import { useEffect, useState, useRef } from 'react';

const VUMeterPage: React.FC = () => {
    const [levels, setLevels] = useState({ left: -60, right: -60 });
    const [leftNeedleAngle, setLeftNeedleAngle] = useState(-45);
    const [rightNeedleAngle, setRightNeedleAngle] = useState(-45);
    const wsRef = useRef<WebSocket | null>(null);
    const leftVelocityRef = useRef(0);
    const rightVelocityRef = useRef(0);

    // WebSocket connection
    useEffect(() => {
        const connect = () => {
            const ws = new WebSocket('ws://localhost:5005');
            wsRef.current = ws;

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const response = data.GetCaptureSignalPeak ? data.GetCaptureSignalPeak : data;
                    if (response.result === 'Ok' && Array.isArray(response.value)) {
                        setLevels({
                            left: Math.max(-60, response.value[0]),
                            right: Math.max(-60, response.value[1])
                        });
                    }
                } catch { }
            };

            ws.onclose = () => {
                wsRef.current = null;
                setTimeout(connect, 1000);
            };
        };

        connect();

        const pollInterval = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send('"GetCaptureSignalPeak"');
            }
        }, 50);

        return () => {
            clearInterval(pollInterval);
            wsRef.current?.close();
        };
    }, []);

    // Physics-based needle animation
    useEffect(() => {
        let animationId: number;

        const animate = () => {
            const dbToAngle = (db: number) => {
                const clampedDb = Math.max(-60, Math.min(3, db));
                return ((clampedDb + 60) / 63) * 90 - 45;
            };

            const leftTarget = dbToAngle(levels.left);
            const rightTarget = dbToAngle(levels.right);

            leftVelocityRef.current = (leftVelocityRef.current + (leftTarget - leftNeedleAngle) * 0.15) * 0.75;
            rightVelocityRef.current = (rightVelocityRef.current + (rightTarget - rightNeedleAngle) * 0.15) * 0.75;

            setLeftNeedleAngle(prev => prev + leftVelocityRef.current);
            setRightNeedleAngle(prev => prev + rightVelocityRef.current);

            animationId = requestAnimationFrame(animate);
        };

        animationId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationId);
    }, [levels, leftNeedleAngle, rightNeedleAngle]);

    const scaleMarks = [
        { db: -20, label: '-20' },
        { db: -10, label: '-10' },
        { db: -7, label: '-7' },
        { db: -5, label: '-5' },
        { db: -3, label: '-3' },
        { db: 0, label: '0' },
        { db: 3, label: '+3' },
    ];

    const Meter = ({ angle, label, level }: { angle: number; label: string; level: number }) => (
        <div className="relative" style={{ width: '320px', height: '220px' }}>
            {/* Wood frame */}
            <div
                className="absolute inset-0 rounded-xl"
                style={{
                    background: 'linear-gradient(145deg, #4a3628 0%, #2a1810 50%, #1a0d08 100%)',
                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5), 0 4px 20px rgba(0,0,0,0.8)',
                    border: '4px solid #8B7355'
                }}
            />

            {/* Brass bezel */}
            <div
                className="absolute rounded-lg"
                style={{
                    top: '12px', left: '12px', right: '12px', bottom: '12px',
                    background: 'linear-gradient(180deg, #C9A227 0%, #8B7355 30%, #6B5344 100%)',
                    boxShadow: 'inset 0 0 10px rgba(0,0,0,0.5)'
                }}
            />

            {/* Dial face */}
            <div
                className="absolute rounded"
                style={{
                    top: '20px', left: '20px', right: '20px', bottom: '35px',
                    background: 'linear-gradient(180deg, #F5F0E1 0%, #E8E0C8 70%, #D4C8A8 100%)',
                    boxShadow: 'inset 0 0 15px rgba(0,0,0,0.2)'
                }}
            />

            {/* SVG for scale and needle */}
            <svg
                viewBox="0 0 280 160"
                className="absolute"
                style={{ top: '20px', left: '20px', right: '20px', width: 'calc(100% - 40px)', height: '150px' }}
            >
                {/* Scale arc background */}
                <path
                    d="M 40 140 A 100 100 0 0 1 240 140"
                    fill="none"
                    stroke="#ddd"
                    strokeWidth="25"
                />

                {/* Red zone */}
                <path
                    d={describeArc(140, 140, 100, -10, 50)}
                    fill="none"
                    stroke="#cc3333"
                    strokeWidth="25"
                    opacity="0.7"
                />

                {/* Scale marks */}
                {scaleMarks.map((mark, i) => {
                    const a = ((mark.db + 60) / 63) * 90 - 45;
                    const rad = (a - 90) * Math.PI / 180;
                    const r1 = 85, r2 = 110, r3 = 70;
                    return (
                        <g key={i}>
                            <line
                                x1={140 + Math.cos(rad) * r1}
                                y1={140 + Math.sin(rad) * r1}
                                x2={140 + Math.cos(rad) * r2}
                                y2={140 + Math.sin(rad) * r2}
                                stroke={mark.db >= 0 ? '#aa2222' : '#333'}
                                strokeWidth={mark.db === 0 ? 2 : 1}
                            />
                            <text
                                x={140 + Math.cos(rad) * r3}
                                y={140 + Math.sin(rad) * r3}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize="11"
                                fontWeight={mark.db === 0 ? 'bold' : 'normal'}
                                fill={mark.db >= 0 ? '#aa2222' : '#444'}
                            >
                                {mark.label}
                            </text>
                        </g>
                    );
                })}

                {/* VU label */}
                <text x="140" y="90" textAnchor="middle" fontSize="22" fontWeight="bold" fill="#333" fontFamily="serif">
                    VU
                </text>

                {/* Needle */}
                <g transform={`rotate(${angle}, 140, 140)`}>
                    <line x1="140" y1="140" x2="140" y2="45" stroke="#1a1a1a" strokeWidth="3" strokeLinecap="round" />
                    <polygon points="140,45 137,60 143,60" fill="#1a1a1a" />
                </g>

                {/* Pivot */}
                <circle cx="140" cy="140" r="10" fill="#222" />
                <circle cx="140" cy="140" r="6" fill="#444" />
            </svg>

            {/* Channel label */}
            <div
                className="absolute bottom-2 left-1/2 transform -translate-x-1/2 text-xl font-bold"
                style={{ color: '#D4C8A8', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
            >
                {label}
            </div>

            {/* dB readout */}
            <div
                className="absolute top-2 left-1/2 transform -translate-x-1/2 font-mono text-sm px-2 py-0.5 rounded"
                style={{
                    background: 'rgba(0,0,0,0.6)',
                    color: level > -3 ? '#ff4444' : '#00ff88'
                }}
            >
                {level > -60 ? level.toFixed(1) : '-∞'} dB
            </div>
        </div>
    );

    return (
        <div
            className="w-screen h-screen flex flex-col items-center justify-center gap-8"
            style={{
                background: 'linear-gradient(180deg, #1a1008 0%, #0a0604 100%)',
                fontFamily: 'serif'
            }}
        >
            {/* Title */}
            <div className="text-center">
                <h1 className="text-4xl font-bold tracking-widest" style={{ color: '#D4C8A8' }}>
                    STEREO VU METER
                </h1>
                <p className="text-sm tracking-wider mt-1" style={{ color: '#8B7355' }}>
                    ARTIS NOVA DSP • PROFESSIONAL AUDIO
                </p>
            </div>

            {/* Meters */}
            <div className="flex gap-8">
                <Meter angle={leftNeedleAngle} label="LEFT" level={levels.left} />
                <Meter angle={rightNeedleAngle} label="RIGHT" level={levels.right} />
            </div>

            {/* Brand plate */}
            <div
                className="px-6 py-2 rounded"
                style={{
                    background: 'linear-gradient(180deg, #C9A227 0%, #8B7355 50%, #6B5344 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.3), 0 2px 4px rgba(0,0,0,0.5)'
                }}
            >
                <span className="text-sm font-bold tracking-[0.3em]" style={{ color: '#1a0d08' }}>
                    HANDCRAFTED PRECISION
                </span>
            </div>
        </div>
    );
};

function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArc = endAngle - startAngle <= 180 ? '0' : '1';
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}

function polarToCartesian(cx: number, cy: number, radius: number, angle: number) {
    const rad = (angle - 90) * Math.PI / 180;
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) };
}

export default VUMeterPage;
