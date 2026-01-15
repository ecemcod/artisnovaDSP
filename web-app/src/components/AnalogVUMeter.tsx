import { useEffect, useRef } from 'react';

interface Props {
    level: number; // dB value, typically -60 to 0
    channel: 'L' | 'R';
}

const AnalogVUMeter: React.FC<Props> = ({ level, channel }) => {
    const needleRef = useRef<SVGGElement>(null);
    const dbTextRef = useRef<HTMLDivElement>(null);
    const lastLevelRef = useRef(level);
    const currentAngleRef = useRef(-45);
    const velocityRef = useRef(0);

    // Convert dB to angle (-60dB = -45°, 0dB = +45°)
    const dbToAngle = (db: number) => {
        const clampedDb = Math.max(-60, Math.min(3, db));
        return ((clampedDb + 60) / 63) * 95 - 45;
    };

    const width = 280;
    const height = 180;
    const centerX = 140;
    const centerY = 160;
    const radius = 120;

    // Update level ref whenever prop changes
    useEffect(() => {
        lastLevelRef.current = level;
    }, [level]);

    // Persistent Animation Loop
    useEffect(() => {
        let animationFrameId: number;

        const animate = () => {
            const target = dbToAngle(lastLevelRef.current);

            // Physics-based movement (Spring + Damping)
            const diff = target - currentAngleRef.current;
            const springForce = diff * 0.2;
            const damping = 0.7;

            velocityRef.current = (velocityRef.current + springForce) * damping;
            currentAngleRef.current += velocityRef.current;

            // Direct DOM Manipulation for Needle
            if (needleRef.current) {
                // Ensure we use the exact rotation point
                needleRef.current.setAttribute('transform', `rotate(${currentAngleRef.current}, ${centerX}, ${centerY})`);
            }

            // Direct DOM Manipulation for Text
            if (dbTextRef.current) {
                const currentLevel = lastLevelRef.current;
                const displayLevel = currentLevel > -60 ? currentLevel.toFixed(1) : '-∞';
                dbTextRef.current.textContent = `${displayLevel} dB`;
                dbTextRef.current.style.color = currentLevel > -3 ? 'var(--accent-danger)' : 'var(--accent-success)';
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        animationFrameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId);
    }, []); // Run once on mount, loop is persistent

    // Scale markings for labels
    const scaleMarks = [
        { db: -20, label: '-20' },
        { db: -10, label: '-10' },
        { db: -5, label: '-5' },
        { db: 0, label: '0' },
        { db: 3, label: '+3' },
    ];

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
                    </defs>

                    {/* Dial arc background */}
                    <path
                        d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
                        fill={`url(#dialGradient-${channel})`}
                    />

                    {/* Red zone */}
                    <path
                        d={describeArc(centerX, centerY, radius - 5, dbToAngle(0) - 90, dbToAngle(3) - 90)}
                        fill="none"
                        stroke="var(--accent-danger)"
                        strokeWidth="12"
                        opacity="0.6"
                    />

                    {/* All Tick Marks */}
                    {[-20, -15, -10, -7, -5, -4, -3, -2, -1, 0, 1, 2, 3].map((db) => {
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
                                x1={x1} y1={y1} x2={x2} y2={y2}
                                stroke={db >= 0 ? "#cc3333" : "#1a1a2e"}
                                strokeWidth={isMajor ? "2" : "1"}
                            />
                        );
                    })}

                    {/* Scale Labels */}
                    {scaleMarks.map((mark) => {
                        const angle = dbToAngle(mark.db);
                        const rad = (angle - 90) * Math.PI / 180;
                        const textR = radius - 35;
                        const textX = centerX + Math.cos(rad) * textR;
                        const textY = centerY + Math.sin(rad) * textR;
                        return (
                            <text
                                key={mark.db}
                                x={textX}
                                y={textY}
                                textAnchor="middle"
                                dominantBaseline="middle"
                                fontSize="10"
                                fill={mark.db >= 0 ? '#cc3333' : '#1a1a2e'}
                                fontWeight="bold"
                                style={{ fontFamily: 'Inter, sans-serif' }}
                            >
                                {mark.label}
                            </text>
                        );
                    })}

                    {/* VU and Channel Label */}
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
                    <text
                        x={centerX}
                        y={centerY - 35}
                        textAnchor="middle"
                        fill="#4a4a6a"
                        fontSize="9"
                        fontWeight="900"
                        style={{ letterSpacing: '0.1em' }}
                    >
                        CHANNEL {channel}
                    </text>

                    {/* Needle pivot point */}
                    <circle cx={centerX} cy={centerY} r="10" fill="var(--bg-deep)" stroke="var(--border-medium)" strokeWidth="1" />
                    <circle cx={centerX} cy={centerY} r="4" fill="var(--accent-primary)" />

                    {/* Needle - Manipulated directly via Ref */}
                    <g ref={needleRef}>
                        <line
                            x1={centerX}
                            y1={centerY}
                            x2={centerX}
                            y2={centerY - radius + 15}
                            stroke="var(--accent-primary)"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                        />
                        <circle cx={centerX} cy={centerY - radius + 15} r="2.5" fill="var(--accent-primary)" />
                    </g>
                </svg>

                {/* Digital Readout - Manipulated directly via Ref */}
                <div
                    ref={dbTextRef}
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
