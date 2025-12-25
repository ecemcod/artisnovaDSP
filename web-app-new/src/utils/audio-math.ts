import type { FilterParam } from '../types';

const SAMPLE_RATE = 44100;

interface Coefficients {
    a0: number; a1: number; a2: number;
    b0: number; b1: number; b2: number;
}

// Robert Bristow-Johnson's Audio EQ Cookbook coefficients
function getCoeffs(type: string, f0: number, dbGain: number, Q: number): Coefficients {
    const A = Math.pow(10, (dbGain || 0) / 40);
    const w0 = 2 * Math.PI * (f0 || 1000) / SAMPLE_RATE;
    const alpha = Math.sin(w0) / (2 * (Q || 0.707));
    const cosw0 = Math.cos(w0);

    let b0 = 0, b1 = 0, b2 = 0, a0 = 0, a1 = 0, a2 = 0;

    switch (type) {
        case 'Peaking':
            b0 = 1 + alpha * A;
            b1 = -2 * cosw0;
            b2 = 1 - alpha * A;
            a0 = 1 + alpha / A;
            a1 = -2 * cosw0;
            a2 = 1 - alpha / A;
            break;
        case 'Lowshelf':
            b0 = A * ((A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
            b1 = 2 * A * ((A - 1) - (A + 1) * cosw0);
            b2 = A * ((A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
            a0 = (A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
            a1 = -2 * ((A - 1) + (A + 1) * cosw0);
            a2 = (A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
            break;
        case 'Highshelf':
            b0 = A * ((A + 1) + (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha);
            b1 = -2 * A * ((A - 1) + (A + 1) * cosw0);
            b2 = A * ((A + 1) + (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha);
            a0 = (A + 1) - (A - 1) * cosw0 + 2 * Math.sqrt(A) * alpha;
            a1 = 2 * ((A - 1) - (A + 1) * cosw0);
            a2 = (A + 1) - (A - 1) * cosw0 - 2 * Math.sqrt(A) * alpha;
            break;
        default:
            // Pass through
            b0 = 1; a0 = 1;
            break;
    }

    return { a0, a1, a2, b0, b1, b2 };
}

function getMagnitude(coeffs: Coefficients, freq: number): number {
    const w = 2 * Math.PI * freq / SAMPLE_RATE;
    const cosw = Math.cos(w);
    const cos2w = Math.cos(2 * w);

    const num = coeffs.b0 * coeffs.b0 + coeffs.b1 * coeffs.b1 + coeffs.b2 * coeffs.b2 +
        2 * (coeffs.b0 * coeffs.b1 + coeffs.b1 * coeffs.b2) * cosw +
        2 * (coeffs.b0 * coeffs.b2) * cos2w;

    const den = coeffs.a0 * coeffs.a0 + coeffs.a1 * coeffs.a1 + coeffs.a2 * coeffs.a2 +
        2 * (coeffs.a0 * coeffs.a1 + coeffs.a1 * coeffs.a2) * cosw +
        2 * (coeffs.a0 * coeffs.a2) * cos2w;

    return 10 * Math.log10(num / den);
}

export function generateResponsePoints(filters: FilterParam[], preamp: number) {
    const points = [];
    // Logarithmic scale 20Hz - 20kHz
    // 100 points
    const minFreq = 20;
    const maxFreq = 20000;
    const steps = 150;

    for (let i = 0; i < steps; i++) {
        // Log distribution
        const f = minFreq * Math.pow(maxFreq / minFreq, i / (steps - 1));

        let dbTotal = preamp;

        filters.forEach(filter => {
            if (!filter.enabled) return;
            const coeffs = getCoeffs(filter.type, filter.freq, filter.gain, filter.q);
            dbTotal += getMagnitude(coeffs, f);
        });

        points.push({ freq: f, gain: dbTotal });
    }
    return points;
}
