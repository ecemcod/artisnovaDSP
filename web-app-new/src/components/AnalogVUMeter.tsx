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
        { db: -10, label: '-10' },
        { db: -7, label: '-7' },
        { db: -5, label: '-5' },
        { db: -3, label: '-3' },
        { db: -1, label: '-1' },
        { db: 0, label: '0' },
        { db: 1, label: '+1' },
        { db: 2, label: '+2' },
        { db: 3, label: '+3' },
    ];

    const width = 280;
    const height = 180;
    const centerX = width / 2;
    const centerY = height - 20;
    const radius = 120;

    return (
        <div className="flex flex-col items-center">
            {/* Channel Label */}
            <div className="text-2xl font-bold text-amber-100 mb-2 tracking-wider">
                {channel === 'L' ? 'LEFT' : 'RIGHT'}
            </div>

            {/* Meter Face */}
            <div
                className="relative rounded-lg overflow-hidden"
                style={{
                    width: `${width}px`,
                    height: `${height}px`,
                    background: 'linear-gradient(135deg, #2a1810 0%, #1a0f08 50%, #0d0705 100%)',
                    boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.8), 0 4px 20px rgba(0,0,0,0.5)',
                    border: '3px solid #8B7355',
                    borderRadius: '12px'
                }}
            >
                {/* Brass bezel effect */}
                <div
                    className="absolute inset-1 rounded-lg"
                    style={{
                        background: 'linear-gradient(180deg, rgba(139,115,85,0.3) 0%, transparent 30%)',
                        pointerEvents: 'none'
                    }}
                />

                {/* SVG Gauge */}
                <svg width={width} height={height} className="absolute inset-0">
                    {/* Dial face background */}
                    <defs>
                        <radialGradient id={`dialGradient-${channel}`} cx="50%" cy="100%" r="80%">
                            <stop offset="0%" stopColor="#F5F0E1" />
                            <stop offset="70%" stopColor="#E8E0C8" />
                            <stop offset="100%" stopColor="#D4C8A8" />
                        </radialGradient>
                        <filter id="dialShadow">
                            <feDropShadow dx="0" dy="1" stdDeviation="2" floodOpacity="0.3" />
                        </filter>
                    </defs>

                    {/* Dial arc background */}
                    <path
                        d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
                        fill={`url(#dialGradient-${channel})`}
                        filter="url(#dialShadow)"
                    />

                    {/* Red zone (0 to +3 dB) */}
                    <path
                        d={describeArc(centerX, centerY, radius - 5, dbToAngle(0) - 90, dbToAngle(3) - 90)}
                        fill="none"
                        stroke="#cc3333"
                        strokeWidth="15"
                        opacity="0.8"
                    />

                    {/* Scale marks */}
                    {scaleMarks.map((mark, i) => {
                        const angle = dbToAngle(mark.db);
                        const rad = (angle - 90) * Math.PI / 180;
                        const innerR = radius - 25;
                        const outerR = radius - 10;
                        const textR = radius - 40;

                        const x1 = centerX + Math.cos(rad) * innerR;
                        const y1 = centerY + Math.sin(rad) * innerR;
                        const x2 = centerX + Math.cos(rad) * outerR;
                        const y2 = centerY + Math.sin(rad) * outerR;
                        const textX = centerX + Math.cos(rad) * textR;
                        const textY = centerY + Math.sin(rad) * textR;

                        return (
                            <g key={i}>
                                <line
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={mark.db >= 0 ? '#aa2222' : '#333'}
                                    strokeWidth={mark.db === 0 ? 2 : 1}
                                />
                                <text
                                    x={textX}
                                    y={textY}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize="10"
                                    fill={mark.db >= 0 ? '#aa2222' : '#444'}
                                    fontWeight={mark.db === 0 ? 'bold' : 'normal'}
                                >
                                    {mark.label}
                                </text>
                            </g>
                        );
                    })}

                    {/* VU label */}
                    <text
                        x={centerX}
                        y={centerY - 50}
                        textAnchor="middle"
                        fontSize="18"
                        fontWeight="bold"
                        fill="#333"
                        fontFamily="serif"
                    >
                        VU
                    </text>

                    {/* Needle pivot point */}
                    <circle cx={centerX} cy={centerY} r="8" fill="#222" />
                    <circle cx={centerX} cy={centerY} r="5" fill="#444" />

                    {/* Needle */}
                    <g transform={`rotate(${needleAngle}, ${centerX}, ${centerY})`}>
                        <line
                            x1={centerX}
                            y1={centerY}
                            x2={centerX}
                            y2={centerY - radius + 15}
                            stroke="#111"
                            strokeWidth="3"
                            strokeLinecap="round"
                        />
                        {/* Needle tip */}
                        <polygon
                            points={`${centerX},${centerY - radius + 15} ${centerX - 3},${centerY - radius + 30} ${centerX + 3},${centerY - radius + 30}`}
                            fill="#111"
                        />
                    </g>
                </svg>

                {/* dB readout */}
                <div
                    className="absolute bottom-2 left-1/2 transform -translate-x-1/2 font-mono text-sm px-2 py-0.5 rounded"
                    style={{
                        background: 'rgba(0,0,0,0.7)',
                        color: level > -3 ? '#ff4444' : '#00ff88'
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
