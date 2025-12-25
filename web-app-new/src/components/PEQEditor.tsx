import React from 'react';
import type { FilterParam } from '../types';
import { Plus, Trash2, Power } from 'lucide-react';

interface Props {
    filters: FilterParam[];
    onChange: (filters: FilterParam[]) => void;
}

const BAND_COLORS = ['#00d4ff', '#7b68ee', '#ff6b9d', '#00ff88', '#ffaa00', '#ff5555'];

const PEQEditor: React.FC<Props> = ({ filters, onChange }) => {

    const updateFilter = (index: number, changes: Partial<FilterParam>) => {
        const newFilters = [...filters];
        newFilters[index] = { ...newFilters[index], ...changes };
        onChange(newFilters);
    };

    const addFilter = () => {
        onChange([...filters, {
            id: Math.random().toString(36).substring(2, 9),
            type: 'Peaking',
            freq: 1000,
            gain: 0,
            q: 1,
            enabled: true
        }]);
    };

    const removeFilter = (index: number) => {
        onChange(filters.filter((_, i) => i !== index));
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] text-[#606080] uppercase font-semibold tracking-wider">
                    {filters.length} Band{filters.length !== 1 ? 's' : ''} Active
                </span>
                <button
                    onClick={addFilter}
                    className="flex items-center gap-1.5 text-[11px] bg-[#1a1a28] hover:bg-[#00d4ff] hover:text-black text-[#00d4ff] px-3 py-1.5 rounded-md transition-all font-medium border border-[#2a2a3e] hover:border-transparent"
                >
                    <Plus size={12} /> Add Band
                </button>
            </div>

            {/* Horizontal scrollable bands */}
            <div className="flex-1 flex gap-2 overflow-x-auto pb-2">
                {filters.length === 0 && (
                    <div className="flex-1 flex items-center justify-center text-[#404060] text-xs">
                        Click "Add Band" to create EQ filters
                    </div>
                )}

                {filters.map((f, i) => {
                    const color = BAND_COLORS[i % BAND_COLORS.length];
                    return (
                        <div
                            key={f.id || i}
                            className={`flex-shrink-0 w-36 bg-[#0f0f18] border rounded-lg p-3 transition-all ${f.enabled ? 'border-[#2a2a3e]' : 'border-[#1a1a28] opacity-50'
                                }`}
                            style={{ borderTopColor: f.enabled ? color : undefined, borderTopWidth: f.enabled ? '2px' : '1px' }}
                        >
                            {/* Band header */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold" style={{ color }}>BAND {i + 1}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => updateFilter(i, { enabled: !f.enabled })}
                                        className={`p-1 rounded transition-colors ${f.enabled ? 'text-[#00ff88]' : 'text-[#404060]'}`}
                                    >
                                        <Power size={12} strokeWidth={2.5} />
                                    </button>
                                    <button
                                        onClick={() => removeFilter(i)}
                                        className="p-1 text-[#404060] hover:text-[#ff6b9d] rounded transition-colors"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </div>
                            </div>

                            {/* Type */}
                            <select
                                value={f.type}
                                onChange={e => updateFilter(i, { type: e.target.value as any })}
                                className="w-full mb-2 text-[10px] py-1 px-2"
                            >
                                <option value="Peaking">Peak</option>
                                <option value="Lowshelf">Low Shelf</option>
                                <option value="Highshelf">High Shelf</option>
                            </select>

                            {/* Freq */}
                            <div className="mb-2">
                                <div className="flex justify-between text-[9px] text-[#606080] mb-1">
                                    <span>Freq</span>
                                    <span className="text-[#00d4ff] font-mono">{Math.round(f.freq || 0)}Hz</span>
                                </div>
                                <input
                                    type="range"
                                    min="20"
                                    max="20000"
                                    value={f.freq || 1000}
                                    onChange={e => updateFilter(i, { freq: Number(e.target.value) })}
                                    className="w-full h-1"
                                />
                            </div>

                            {/* Gain */}
                            <div className="mb-2">
                                <div className="flex justify-between text-[9px] text-[#606080] mb-1">
                                    <span>Gain</span>
                                    <span className="text-[#ffaa00] font-mono">{(f.gain || 0).toFixed(1)}dB</span>
                                </div>
                                <input
                                    type="range"
                                    min="-12"
                                    max="12"
                                    step="0.1"
                                    value={f.gain || 0}
                                    onChange={e => updateFilter(i, { gain: Number(e.target.value) })}
                                    className="w-full h-1"
                                />
                            </div>

                            {/* Q */}
                            <div>
                                <div className="flex justify-between text-[9px] text-[#606080] mb-1">
                                    <span>Q</span>
                                    <span className="font-mono">{(f.q || 1).toFixed(1)}</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1"
                                    max="10"
                                    step="0.1"
                                    value={f.q || 1}
                                    onChange={e => updateFilter(i, { q: Number(e.target.value) })}
                                    className="w-full h-1"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default PEQEditor;
