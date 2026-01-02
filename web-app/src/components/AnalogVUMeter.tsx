import { useEffect, useRef, useState } from 'react';

interface Props {
    level: number; // dB value, typically -60 to 0
    channel: 'L' | 'R';
}

const AnalogVUMeter: React.FC<Props> = ({ level, channel }) => {
    const [needleAngle, setNeedleAngle] = useState(-45); // Start at -45° (left side)
    const velocityRef = useRef(0);
    const targetAngleRef = useRef(-45);
    const animationRef = useRef<number>(0);

    // Convert dB to angle (-60dB = -45°, 0dB = +45°)
    const dbToAngle = (db: number) => {
        const clampedDb = Math.max(-60, Math.min(3, db));
        // Map -60 to 3 dB → -45° to +50°
        return ((clampedDb + 60) / 63) * 95 - 45;
    };

    // Physics-based needle animation
    useEffect(() => {
        targetAngleRef.current = dbToAngle(level);

        const animate = () => {
            const target = targetAngleRef.current;
            const current = needleAngle;
            const diff = target - current;

            // Spring physics
            const springForce = diff * 0.15; // Spring constant
            const damping = 0.75; // Damping factor

            velocityRef.current = (velocityRef.current + springForce) * damping;

            const newAngle = current + velocityRef.current;

            if (Math.abs(diff) > 0.01 || Math.abs(velocityRef.current) > 0.01) {
                setNeedleAngle(newAngle);
                animationRef.current = requestAnimationFrame(animate);
            }
        };

        animationRef.current = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(animationRef.current);
    }, [level, needleAngle]);

    // Scale markings for VU meter
    const scaleMarks = [
        { db: -20, label: '-20' },
        { db: -15, label: '' },
        { db: -10, label: '-10' },
        { db: -7, label: '' },
        { db: -5, label: '' },
        { db: -3, label: '' },
        { db: -1, label: '' },
        { db: 0, label: '0' },
        { db: 1, label: '' },
        { db: 2, label: '' },
        { db: 3, label: '' },
    ];

    const width = 280;
    const height = 180;
    const centerX = width / 2;
    const centerY = height - 20;
    const radius = 120;

    return (
        <div className="flex flex-col items-center w-full">
            {/* Channel Label */}
            <div className="text-[10px] font-black text-themed-muted mb-2 tracking-[0.4em] uppercase">
                Channel {channel}
            </div>

            {/* Meter Face Container */}
            <div
                className="relative w-full aspect-[280/180] rounded-lg overflow-hidden border border-themed-subtle shadow-2xl"
                style={{
                    background: 'var(--bg-deep)',
                }}
            >
                {/* Modern subtle overlay */}
                <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                        background: 'linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 60%)',
                    }}
                />

                {/* SVG Gauge */}
                <svg
                    viewBox={`0 0 ${width} ${height}`}
                    className="absolute inset-0 w-full h-full"
                >
                    {/* Dial face background */}
                    <defs>
                        <radialGradient id={`dialGradient-${channel}`} cx="50%" cy="100%" r="95%">
                            <stop offset="0%" stopColor="#e0e0ea" />
                            <stop offset="60%" stopColor="#c0c0d0" />
                            <stop offset="100%" stopColor="#a0a0b0" />
                        </radialGradient>
                        <filter id="dialShadow">
                            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3" />
                        </filter>
                    </defs>

                    {/* Dial arc background */}
                    <path
                        d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
                        fill={`url(#dialGradient-${channel})`}
                        filter="url(#dialShadow)"
                    />

                    {/* Red zone (0 to +3 dB) - using var(--accent-danger) */}
                    <path
                        d={describeArc(centerX, centerY, radius - 5, dbToAngle(0) - 90, dbToAngle(3) - 90)}
                        fill="none"
                        stroke="var(--accent-danger)"
                        strokeWidth="12"
                        opacity="0.6"
                    />

                    {/* Scale marks */}
                    {/* Main Scale Marks */}
                    {[-20, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3].map((db) => {
                        const angle = dbToAngle(db);
                        const isMajor = db % 5 === 0 || db === 0 || db === 3;
                        const len = isMajor ? 12 : 6;
                        const rad = radius - 8;
                        const x1 = centerX + rad * Math.sin((angle * Math.PI) / 180);
                        const y1 = centerY - rad * Math.cos((angle * Math.PI) / 180);
                        const x2 = centerX + (rad - len) * Math.sin((angle * Math.PI) / 180);
                        const y2 = centerY - (rad - len) * Math.cos((angle * Math.PI) / 180);
                        return (
                            <line
                                key={db}
                                x1={x1}
                                y1={y1}
                                x2={x2}
                                y2={y2}
                                stroke={db >= 0 ? "#cc3333" : "#1a1a2e"}
                                strokeWidth={isMajor ? "2" : "1"}
                            />
                        );
                    })}
                    {scaleMarks.map((mark, i) => {
                        const angle = dbToAngle(mark.db);
                        const rad = (angle - 90) * Math.PI / 180;
                        const textR = radius - 40;

                        const textX = centerX + Math.cos(rad) * textR;
                        const textY = centerY + Math.sin(rad) * textR;

                        return (
                            <g key={i}>
                                <text
                                    x={textX}
                                    y={textY}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="9"
                                    fill={mark.db >= 0 ? '#cc3333' : '#1a1a2e'}
                                    fontWeight={mark.db === 0 ? '900' : '500'}
                                    style={{ fontFamily: 'Inter, sans-serif' }}
                                >
                                    {mark.label}
                                </text>
                            </g>
                        );
                    })}

                    {/* VU label */}
                    <text
                        x={centerX}
                        y={centerY - radius / 2}
                        textAnchor="middle"
                        fill="#1a1a2e"
                        fontSize="14"
                        fontWeight="900"
                        className="header-text"
                        style={{ letterSpacing: '0.2em' }}
                    >
                        VU
                    </text>

                    {/* Channel Label */}
                    <text
                        x={centerX}
                        y={centerY - 30}
                        textAnchor="middle"
                        fill="#4a4a6a"
                        fontSize="10"
                        fontWeight="900"
                        style={{ letterSpacing: '0.1em' }}
                    >
                        CHANNEL {channel}
                    </text>

                    {/* Needle pivot point */}
                    <circle cx={centerX} cy={centerY} r="10" fill="var(--bg-deep)" stroke="var(--border-medium)" strokeWidth="1" />
                    <circle cx={centerX} cy={centerY} r="4" fill="var(--accent-primary)" />

                    {/* Needle */}
                    <g transform={`rotate(${needleAngle}, ${centerX}, ${centerY})`}>
                        <line
                            x1={centerX}
                            y1={centerY}
                            x2={centerX}
                            y2={centerY - radius + 15}
                            stroke="var(--accent-primary)"
                            strokeWidth="2"
                            strokeLinecap="round"
                            opacity="0.9"
                        />
                        {/* Needle tip */}
                        <circle
                            cx={centerX}
                            cy={centerY - radius + 15}
                            r="2"
                            fill="var(--accent-primary)"
                        />
                    </g>
                </svg>

                <div
                    className="absolute bottom-3 left-1/2 transform -translate-x-1/2 font-mono text-[10px] px-2 py-0.5 rounded-lg border border-white/5 font-black uppercase tracking-widest"
                    style={{
                        background: 'rgba(0,0,0,0.5)',
                        color: level > -3 ? 'var(--accent-danger)' : 'var(--accent-success)'
                    }}
                >
                    {level > -60 ? level.toFixed(1) : '-∞'} dB
                </div>
            </div>
        </div>
    );
};

// Helper function to describe an SVG arc
function describeArc(cx: number, cy: number, radius: number, startAngle: number, endAngle: number): string {
    const start = polarToCartesian(cx, cy, radius, endAngle);
    const end = polarToCartesian(cx, cy, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';

    return [
        'M', start.x, start.y,
        'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y
    ].join(' ');
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
    const angleInRadians = angleInDegrees * Math.PI / 180;
    return {
        x: cx + radius * Math.cos(angleInRadians),
        y: cy + radius * Math.sin(angleInRadians)
    };
}

export default AnalogVUMeter;
