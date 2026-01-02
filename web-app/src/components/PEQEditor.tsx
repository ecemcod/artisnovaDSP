import React from 'react';
import type { FilterParam } from '../types';
import { Plus, Trash2, Power } from 'lucide-react';

interface Props {
    filters: FilterParam[];
    onChange: (filters: FilterParam[]) => void;
}

const BAND_COLORS = ['var(--accent-primary)', 'var(--accent-primary)', 'var(--accent-primary)', 'var(--accent-primary)', 'var(--accent-primary)', 'var(--accent-primary)'];
const BAND_OPACITIES = ['1', '0.9', '0.8', '0.7', '0.6', '0.5'];

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
            <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-[10px] text-themed-muted uppercase font-black tracking-widest">
                    {filters.length} Band{filters.length !== 1 ? 's' : ''} Active
                </span>
                <button
                    onClick={addFilter}
                    className="flex items-center gap-1.5 text-[10px] bg-themed-deep hover:bg-accent-primary/10 text-accent-primary px-3 py-1.5 rounded-lg transition-all font-black border border-themed-medium hover:border-accent-primary uppercase tracking-widest active:scale-95"
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
                    const opacity = BAND_OPACITIES[i % BAND_OPACITIES.length];
                    return (
                        <div
                            key={f.id || i}
                            className={`flex-shrink-0 w-40 bg-themed-deep border rounded-xl p-3 transition-all ${f.enabled ? 'border-themed-medium shadow-lg' : 'border-themed-subtle opacity-40'
                                }`}
                            style={{ borderTopColor: f.enabled ? color : undefined, borderTopWidth: f.enabled ? '3px' : '1px', borderTopStyle: 'solid', opacity: f.enabled ? opacity : undefined }}
                        >
                            {/* Band header */}
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-black tracking-widest" style={{ color }}>BAND {i + 1}</span>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => updateFilter(i, { enabled: !f.enabled })}
                                        className={`p-1.5 rounded-lg transition-colors bg-white/5 hover:bg-white/10 ${f.enabled ? 'text-accent-primary' : 'text-themed-muted'}`}
                                    >
                                        <Power size={11} strokeWidth={3} />
                                    </button>
                                    <button
                                        onClick={() => removeFilter(i)}
                                        className="p-1.5 text-themed-muted hover:text-accent-danger rounded-lg transition-colors bg-white/5 hover:bg-white/10"
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                </div>
                            </div>

                            {/* Type */}
                            <select
                                value={f.type}
                                onChange={e => updateFilter(i, { type: e.target.value as any })}
                                className="w-full mb-3 text-[10px] uppercase font-black tracking-widest"
                            >
                                <option value="Peaking">Peak</option>
                                <option value="Lowshelf">L-Shelf</option>
                                <option value="Highshelf">H-Shelf</option>
                            </select>

                            {/* Freq */}
                            <div className="mb-3">
                                <div className="flex justify-between text-[9px] text-themed-muted mb-1 font-black uppercase tracking-widest">
                                    <span>Freq</span>
                                    <span className="text-accent-primary font-mono">{Math.round(f.freq || 0)}Hz</span>
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
                            <div className="mb-3">
                                <div className="flex justify-between text-[9px] text-themed-muted mb-1 font-black uppercase tracking-widest">
                                    <span>Gain</span>
                                    <span className="text-accent-warning font-mono">{(f.gain || 0).toFixed(1)}dB</span>
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
                                <div className="flex justify-between text-[9px] text-themed-muted mb-1 font-black uppercase tracking-widest">
                                    <span>Q</span>
                                    <span className="font-mono text-themed-primary font-black">{(f.q || 1).toFixed(1)}</span>
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
