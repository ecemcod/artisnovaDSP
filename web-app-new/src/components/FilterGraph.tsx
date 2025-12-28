import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts';
import type { FilterParam } from '../types';
import { generateResponsePoints } from '../utils/audio-math';

interface Props {
    filters: FilterParam[];
    preamp: number;
}

const FilterGraph: React.FC<Props> = ({ filters, preamp }) => {
    const data = useMemo(() => generateResponsePoints(filters, preamp), [filters, preamp]);

    const formatFreq = (val: number) => {
        if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
        return Math.round(val).toString();
    };

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <ResponsiveContainer>
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="peqGradient" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#00d4ff" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#00d4ff" stopOpacity={0.05} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        stroke="rgba(0, 212, 255, 0.08)"
                        vertical={true}
                        horizontal={true}
                        strokeDasharray="0"
                    />
                    <XAxis
                        dataKey="freq"
                        scale="log"
                        domain={[20, 20000]}
                        type="number"
                        tickFormatter={formatFreq}
                        stroke="#606080"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: '#2a2a3e' }}
                        allowDataOverflow
                    />
                    <YAxis
                        domain={[-18, 18]}
                        stroke="#606080"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: '#2a2a3e' }}
                        unit=" dB"
                        width={40}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: '#12121a',
                            border: '1px solid #2a2a3e',
                            borderRadius: '6px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.8)'
                        }}
                        itemStyle={{ color: '#00d4ff', fontSize: '11px', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }}
                        labelStyle={{ fontSize: '10px', color: '#606080', marginBottom: '2px', fontFamily: 'JetBrains Mono' }}
                        labelFormatter={(v) => `${Math.round(v)} Hz`}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} dB`, 'Gain']}
                    />
                    <ReferenceLine y={0} stroke="#2a2a3e" strokeWidth={1} />
                    <Area
                        type="monotone"
                        dataKey="gain"
                        stroke="#00d4ff"
                        strokeWidth={2}
                        fill="url(#peqGradient)"
                        baseValue={0}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{ r: 5, fill: '#00d4ff', stroke: '#fff', strokeWidth: 2 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FilterGraph;
