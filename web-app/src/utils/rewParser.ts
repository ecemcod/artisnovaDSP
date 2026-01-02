import type { FilterParam } from '../types';

export const parseRewFile = (content: string): FilterParam[] => {
    const lines = content.split('\n');
    const filters: FilterParam[] = [];

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Example: 1 True Auto PK 40.75 -7.7 2.679
        const parts = trimmed.split(/\s+/);
        // Header usually starts with "Filter", "Generic", "Notes" or "1" (if no header)
        // We look for a number at the start.
        const index = parseInt(parts[0]);

        if (isNaN(index)) continue;

        if (parts.length < 5) continue;

        const enabledStr = parts[1];
        const typeStr = parts[3];
        const freq = parseFloat(parts[4]);
        const gain = parseFloat(parts[5]);

        let q = parts[6] ? parseFloat(parts[6]) : 0.71;

        if (typeStr === 'None') continue;

        // Map to valid FilterParam['type']
        let type: FilterParam['type'] = 'Peaking';

        // Strict mapping
        if (typeStr === 'PK') type = 'Peaking';
        else if (typeStr === 'LS') type = 'Lowshelf';
        else if (typeStr === 'HS') type = 'Highshelf';
        else if (typeStr === 'LP') type = 'Lowpass';
        else if (typeStr === 'HP') type = 'Highpass';
        else type = 'Peaking'; // Default/Fallback

        filters.push({
            id: `rew_band_${filters.length + 1}`,
            type, // Now strictly typed
            freq: isNaN(freq) ? 100 : freq,
            gain: isNaN(gain) ? 0 : gain,
            q: isNaN(q) ? 0.71 : q,
            enabled: enabledStr === 'True'
        });
    }

    return filters;
};
