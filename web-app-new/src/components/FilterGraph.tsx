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
                            <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid
                        stroke="var(--border-subtle)"
                        vertical={true}
                        horizontal={true}
                        strokeDasharray="3 3"
                        opacity={0.3}
                    />
                    <XAxis
                        dataKey="freq"
                        scale="log"
                        domain={[20, 20000]}
                        type="number"
                        tickFormatter={formatFreq}
                        stroke="var(--text-muted)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border-medium)' }}
                        allowDataOverflow
                    />
                    <YAxis
                        domain={[-15, 15]}
                        stroke="var(--text-muted)"
                        fontSize={10}
                        tickLine={false}
                        axisLine={{ stroke: 'var(--border-medium)' }}
                        unit=" dB"
                        width={40}
                    />
                    <Tooltip
                        contentStyle={{
                            backgroundColor: 'var(--bg-panel)',
                            border: '1px solid var(--border-medium)',
                            borderRadius: 'var(--radius-standard)',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                            backdropFilter: 'blur(8px)'
                        }}
                        itemStyle={{ color: 'var(--accent-primary)', fontSize: '11px', fontWeight: 'bold', fontFamily: 'JetBrains Mono' }}
                        labelStyle={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '2px', fontFamily: 'JetBrains Mono' }}
                        labelFormatter={(v) => `${Math.round(v)} Hz`}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} dB`, 'Gain']}
                    />
                    <ReferenceLine y={0} stroke="var(--border-medium)" strokeWidth={1} />
                    <Area
                        type="monotone"
                        dataKey="gain"
                        stroke="var(--accent-primary)"
                        strokeWidth={2}
                        fill="url(#peqGradient)"
                        baseValue={0}
                        dot={false}
                        isAnimationActive={false}
                        activeDot={{ r: 4, fill: 'var(--accent-primary)', stroke: '#fff', strokeWidth: 2 }}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

export default FilterGraph;
