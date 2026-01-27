import { useEffect, useRef } from 'react';

interface Props {
    level: number; // dB value, typically -60 to 0
    channel: 'L' | 'R';
    skin?: 'modern' | 'classic' | 'dark' | 'minimal' | 'retro' | 'waves';
    customColor?: string | null;
}

// Basic palette for the skins - will be expanded in the component logic for complex SVGs
// Full skin configuration used by the renderer
const SKINS = {
    modern: {
        bg: 'radial-gradient(circle at center, #f0f0f5 0%, #c0e0ff 100%)',
        dialGradient: ['#f0f0f5', '#c0e0ff', '#a0a0b0'],
        text: '#002060',
        needle: '#cc0000',
        marks: { normal: '#002060', hot: '#cc3333' },
        font: 'Inter, sans-serif'
    },
    classic: {
        bg: 'radial-gradient(circle at center, #fffbf0 0%, #f0e6d2 100%)',
        dialGradient: ['#fffbf0', '#f1e8d4', '#e8ddc0'],
        text: '#4a3628',
        needle: '#aa2222',
        marks: { normal: '#4a3628', hot: '#aa2222' },
        font: 'serif'
    },
    dark: {
        bg: 'radial-gradient(circle at center, #1a1a2e 0%, #050510 100%)',
        dialGradient: ['#1a1a2e', '#0a0a1a', '#000000'],
        text: '#00ffff',
        needle: '#ff0055',
        marks: { normal: '#00ffff', hot: '#ff0055' },
        font: 'Inter, sans-serif'
    },
    minimal: {
        bg: 'linear-gradient(180deg, #ffffff 0%, #f0f0f0 100%)',
        dialGradient: ['#ffffff', '#f5f5f5', '#eeeeee'],
        text: '#000000',
        needle: '#cc0000',
        marks: { normal: '#000000', hot: '#cc0000' },
        font: 'sans-serif'
    },
    retro: {
        bg: 'radial-gradient(circle at center, #fff5e6 0%, #ffcc99 100%)',
        dialGradient: ['#fff5e6', '#ffe0b3', '#ffcc99'],
        text: '#5c4033',
        needle: '#cc3300',
        marks: { normal: '#5c4033', hot: '#a52a2a' },
        font: 'monospace'
    },
    waves: {
        bg: 'radial-gradient(circle at center, #f5f1da 0%, #e2d6a7 100%)', // Warm beige paper
        dialGradient: ['#f5f1da', '#ebe3c0', '#e2d6a7'],
        text: '#222222', // Almost black
        needle: '#111111', // Black needle
        marks: { normal: '#222222', hot: '#d63031' }, // Black marks, red hot zone
        font: 'sans-serif'
    }
};

const AnalogVUMeter: React.FC<Props> = ({ level, channel, skin = 'modern', customColor }) => {
    const needleRef = useRef<SVGLineElement>(null); // Changed to SVGLineElement for direct rotation
    const dbTextRef = useRef<HTMLDivElement>(null);
    const lastLevelRef = useRef(level);
    const currentAngleRef = useRef(-45);
    const velocityRef = useRef(0);

    // Convert dB to angle (-60dB = -45°, 0dB = +45°)
    // Convert dB to angle
    // Standard scale: -60dB = -45°, 0dB = +45°
    // Waves Scale (approx): -20 starts far left, spacing is non-linear
    // We will stick to a linear approximation for now but clamp visuals
    const dbToAngle = (db: number) => {
        if (skin === 'waves') {
            // Waves scale is roughly:
            // -20 at -35 deg
            // -10 at -20 deg
            // -5 at -5 deg
            // 0 at +15 deg
            // +3 at +35 deg
            // This is a custom mapping
            if (db <= -20) return -35;
            if (db >= 3) return 35;
            // Interpolate
            // Simple approach: Map -20..+3 range to -35..+35 degrees
            // This isn't acoustically perfect log scale but matches visually better for this specific meter face
            return ((db + 20) / 23) * 70 - 35;
        }

        const clampedDb = Math.max(-60, Math.min(3, db));
        return ((clampedDb + 60) / 63) * 95 - 45;
    };

    const width = 280;
    const height = 180;
    const centerX = 140;
    const centerY = 160;
    const radius = skin === 'waves' ? 130 : 120; // Increased radius as requested

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
            // We rotate the LINE element itself now, or the group
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
    const scaleMarks = skin === 'waves' ? [
        { db: -20, label: '20' },
        { db: -10, label: '10' },
        { db: -7, label: '7' },
        { db: -5, label: '5' },
        { db: -3, label: '3' },
        { db: -2, label: '2' },
        { db: -1, label: '1' },
        { db: 0, label: '0' },
        { db: 1, label: '1' },
        { db: 2, label: '2' },
        { db: 3, label: '3' },
    ] : [
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

            <div
                className="relative w-full aspect-[280/180] rounded-sm overflow-visible transition-all duration-500"
                style={{
                    background: skin === 'waves' ? '#0a0a0a' : 'transparent', // Outer dark frame for waves
                    // Use customColor for glow if available, else standard shadow
                    boxShadow: skin === 'waves'
                        ? (customColor
                            ? `inset 0 0 20px ${customColor}40, 0 5px 15px ${customColor}20`
                            : 'inset 0 0 20px #000, 0 5px 15px rgba(0,0,0,0.5)')
                        : 'none',
                    padding: skin === 'waves' ? '12px' : '0' // Recessed look
                }}
            >
                {/* Inner Bezel for Waves */}
                <div className={`w-full h-full relative overflow-hidden ${skin === 'waves' ? 'rounded-none shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]' : 'rounded-lg'}`}
                    style={{
                        background: skin === 'waves' ? '#f5f1da' : 'transparent',
                    }}
                >
                    {/* SVG Gauge */}
                    <svg
                        viewBox={`0 0 ${width} ${height}`}
                        className="absolute inset-0 w-full h-full overflow-visible"
                        // Removed sepia/contrast filter for performance on iPad
                        // style={{ filter: skin === 'retro' || skin === 'waves' ? 'sepia(0.2) contrast(1.1)' : 'none' }}
                        style={{ filter: 'none' }}
                    >
                        <path
                            d={`M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 0 1 ${centerX + radius} ${centerY}`}
                            fill={`url(#dialGradient-${skin})`}
                            fillOpacity="0.9"
                            stroke="none"
                        />
                        <defs>
                            <radialGradient id={`dialGradient-${skin}`} cx="50%" cy="100%" r="90%" fx="50%" fy="100%">
                                <stop offset="0%" stopColor={SKINS[skin].dialGradient[0]} />
                                <stop offset="60%" stopColor={SKINS[skin].dialGradient[1]} />
                                <stop offset="100%" stopColor={SKINS[skin].dialGradient[2]} />
                            </radialGradient>

                            {/* Glow for Dark Mode */}
                            <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                                <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
                                <feMerge>
                                    <feMergeNode in="coloredBlur" />
                                    <feMergeNode in="SourceGraphic" />
                                </feMerge>
                            </filter>
                        </defs>

                        {/* Hide standard Red Zone for Waves (we draw custom one below) */}
                        {skin !== 'waves' && (
                            <path
                                d={describeArc(centerX, centerY, radius + (skin === 'retro' ? 5 : -5), dbToAngle(0) - 90, dbToAngle(3) - 90)}
                                fill="none"
                                stroke={skin === 'dark' ? '#ff0055' : skin === 'retro' ? '#d63031' : '#cc3333'}
                                strokeWidth={skin === 'dark' ? 4 : 12}
                                strokeLinecap={skin === 'minimal' ? 'butt' : 'round'}
                                opacity={skin === 'dark' ? 1 : 0.6}
                                filter={skin === 'dark' ? 'url(#glow)' : 'none'}
                            />
                        )}

                        {/* Waves Scale Arc (Outer Rim) - Doubled line style */}
                        {skin === 'waves' && (
                            <g>
                                {/* Track Lines - Moved INWARDS to joined marks below numbers */}
                                {/* Logic: Marks start at 'radStart' (~102). These arcs should be around there. */}

                                {/* Outer track line (previously radius - 5) -> now radius - 28 (matches tick start) */}
                                <path
                                    d={describeArc(centerX, centerY, radius - 28, dbToAngle(-20) - 90, dbToAngle(3) - 90)}
                                    fill="none"
                                    stroke="#111"
                                    strokeWidth="2"
                                    strokeLinecap="butt"
                                    opacity="1"
                                />
                                {/* Inner track line (previously radius - 10) -> now radius - 33 (just inside ticks start) */}
                                <path
                                    d={describeArc(centerX, centerY, radius - 33, dbToAngle(-20) - 90, dbToAngle(3) - 90)}
                                    fill="none"
                                    stroke="#111"
                                    strokeWidth="1"
                                    strokeLinecap="butt"
                                    opacity="0.8"
                                />
                                {/* Red Zone Highlight - between track lines */}
                                <path
                                    d={describeArc(centerX, centerY, radius - 30.5, dbToAngle(0) - 90, dbToAngle(3) - 90)}
                                    fill="none"
                                    stroke="#d63031"
                                    strokeWidth="4"
                                    strokeLinecap="butt"
                                    opacity="0.8"
                                />
                            </g>
                        )}

                        {/* Marks and Labels */}
                        {(skin === 'waves'
                            ? [-20, -15, -10, -7, -5, -3, -2, -1, 0, 1, 2, 3]
                            : [-20, -15, -10, -7, -5, -3, -1, 0, 1, 2, 3]
                        ).map((db) => {
                            const angle = dbToAngle(db);
                            const isMajor = db % 5 === 0 || db === 0 || db === 3;

                            // Waves: longer ticks, pointing INWARDS
                            let len = isMajor ? 12 : 6;
                            if (skin === 'waves') {
                                len = isMajor ? 14 : 8; // Longer ticks
                            } else if (skin === 'minimal') {
                                len = isMajor ? 15 : 8;
                            }

                            let markColor = db >= 0
                                ? (skin === 'dark' ? '#ff0055' : '#cc3333')
                                : (skin === 'dark' ? '#00ffff' : skin === 'modern' ? '#1a1a2e' : SKINS[skin].text);

                            if (skin === 'minimal') {
                                markColor = db >= 0 ? '#ff3b30' : '#000';
                            }

                            // Calculate tick position
                            // For Waves: ticks start BELOW numbers and go INWARDS
                            // Layout: Arc(@125) -> Numbers(@112) -> TicksStart(@102) -> TicksEnd(@88)
                            const radStart = skin === 'waves' ? radius - 28 : radius - 8;

                            // Direction: Inwards for both
                            const radEnd = radStart - len;

                            const x1 = centerX + radStart * Math.sin((angle * Math.PI) / 180);
                            const y1 = centerY - radStart * Math.cos((angle * Math.PI) / 180);
                            const x2 = centerX + radEnd * Math.sin((angle * Math.PI) / 180);
                            const y2 = centerY - radEnd * Math.cos((angle * Math.PI) / 180);

                            return (
                                <line
                                    key={db}
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={markColor}
                                    strokeWidth={isMajor ? (skin === 'minimal' ? 1 : 2) : 1}
                                    opacity={skin === 'dark' ? 0.8 : 1}
                                />
                            );
                        })}

                        {/* Labels */}
                        {scaleMarks.map((mark) => {
                            const angle = dbToAngle(mark.db);
                            const rad = (angle - 90) * Math.PI / 180;

                            // Layout: Arc(@125) -> Numbers(@116) -> Ticks
                            // Text radius needs to be just inside the arc/rim
                            const textR = skin === 'waves' ? radius - 14 : radius - 35;
                            const textX = centerX + Math.cos(rad) * textR;
                            const textY = centerY + Math.sin(rad) * textR;

                            let textColor = mark.db >= 0
                                ? (skin === 'dark' ? '#ff0055' : '#cc3333')
                                : SKINS[skin].text;

                            return (
                                <text
                                    key={mark.db}
                                    x={textX}
                                    y={textY}
                                    textAnchor="middle"
                                    dominantBaseline="middle"
                                    fontSize={skin === 'minimal' ? "9" : (skin === 'waves' ? "11" : "10")}
                                    fill={textColor}
                                    fontWeight={skin === 'minimal' ? '400' : 'bold'}
                                    style={{ fontFamily: SKINS[skin].font }}
                                    filter={skin === 'dark' ? 'url(#glow)' : 'none'}
                                >
                                    {mark.label}
                                </text>
                            );
                        })}

                        {/* Branding */}
                        {skin !== 'waves' && (
                            <text
                                x={centerX}
                                y={centerY - 55}
                                textAnchor="middle"
                                fill={SKINS[skin].text}
                                fontSize="12"
                                fontWeight="900"
                                style={{ letterSpacing: '0.2em', fontFamily: SKINS[skin].font }}
                                opacity={skin === 'dark' ? 0.8 : 1}
                            >
                                VU
                            </text>
                        )}



                        {/* Custom ArtisNova Logo */}
                        {skin === 'waves' && (
                            <image
                                href="/logo.png"
                                x={centerX - 15}
                                y={centerY - 45}
                                width="30"
                                height="30"
                                opacity="0.8"
                                style={{ filter: 'sepia(1) opacity(0.7) contrast(1.2)' }}
                            />
                        )}

                        {/* Toggle Ref Points for Needle */}
                        {/* Pivot - Hidden for Waves */}
                        {skin !== 'waves' && (
                            <circle
                                cx={centerX} cy={centerY}
                                r={skin === 'minimal' ? 4 : 12}
                                fill={skin === 'classic' ? '#2a1810' : skin === 'dark' ? '#111' : '#ddd'}
                                stroke={skin === 'classic' ? '#c9a227' : 'none'}
                                strokeWidth="2"
                            />
                        )}

                        {/* Needle Group - SIMPLIFIED & FORCED VISIBILITY */}
                        {/* Z-index: Last element = Topmost */}
                        <g style={{ transition: 'none' }}>
                            {/* Needle Stick - No filters, pure color */}
                            <line
                                ref={needleRef} // Ref attached here for rotation
                                x1={centerX} y1={centerY + 15} // Extend slightly below pivot
                                x2={centerX} y2={centerY - radius + 10} // extend to top
                                stroke={SKINS[skin].needle || "#ff0000"} // Use skin color or fallback
                                strokeWidth={skin === 'waves' ? "2" : "3"} // Thinner needle for waves
                                strokeLinecap="round"
                                style={{ vectorEffect: 'non-scaling-stroke' }} // Ensure visibility even if scaled
                            />
                        </g>

                        {/* Pivot Cap - Hidden for Waves */}
                        {skin !== 'waves' && (
                            <circle
                                cx={centerX} cy={centerY}
                                r={skin === 'minimal' ? 2 : 4}
                                fill={skin === 'classic' ? '#d4af37' : '#555'}
                            />
                        )}
                    </svg>

                    {/* Digital Readout */}
                    <div
                        ref={dbTextRef}
                        className="absolute bottom-3 left-1/2 transform -translate-x-1/2 font-mono text-[10px] px-2 py-0.5 rounded opacity-80"
                        style={{
                            background: skin === 'minimal' ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.5)',
                            color: skin === 'minimal' ? '#000' : '#fff',
                            fontFamily: SKINS[skin].font
                        }}
                    >
                        -∞ dB
                    </div>
                </div>
            </div>
        </div >
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
