const fs = require('fs');
const path = require('path');

class FilterParser {
    static parse(content) {
        const filters = [];
        let preamp = 0;
        const lines = content.split('\n');

        lines.forEach(line => {
            if (line.includes('Preamp:')) {
                const match = line.match(/Preamp:\s*(-?\d+\.?\d*)\s*dB/);
                if (match) preamp = parseFloat(match[1]);
            } else if (line.includes('Filter') && line.includes('ON')) {
                // Example: Filter 1: ON PK Fc 46 Hz Gain -4.1 dB Q 1.15
                // Variants needed? Assuming this format strictly for now based on prev server
                const match = line.match(/Filter\s+\d+:\s+ON\s+(\w+)\s+Fc\s+(\d+(?:\.\d+)?)\s+Hz\s+Gain\s+(-?\d+(?:\.\d+)?)\s+dB\s+Q\s+(\d+(?:\.\d+)?)/);
                if (match) {
                    const [, type, freq, gain, q] = match;
                    let mappedType = 'Peaking'; // Default
                    if (type === 'PK') mappedType = 'Peaking';
                    else if (type === 'HSC') mappedType = 'Highshelf';
                    else if (type === 'LSC') mappedType = 'Lowshelf';
                    
                    filters.push({
                        id: Math.random().toString(36).substr(2, 9),
                        type: mappedType,
                        freq: parseFloat(freq),
                        gain: parseFloat(gain),
                        q: parseFloat(q),
                        enabled: true
                    });
                }
            }
        });

        return { preamp, filters };
    }

    static toText(data) {
        let text = `Preamp: ${data.preamp.toFixed(1)} dB\n`;
        data.filters.forEach((f, index) => {
            let typeCode = 'PK';
            if (f.type === 'Highshelf') typeCode = 'HSC';
            if (f.type === 'Lowshelf') typeCode = 'LSC';
            
            // Filter 1: ON PK Fc 46 Hz Gain -4.1 dB Q 1.15
            text += `Filter ${index + 1}: ON ${typeCode} Fc ${f.freq} Hz Gain ${f.gain} dB Q ${f.q}\n`;
        });
        return text;
    }
}

module.exports = FilterParser;
