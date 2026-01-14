/**
 * Level Analyzer Utility
 * Processes raw PCM data from stdin and outputs JSON peak levels
 * Format: 32-bit Float LE, 2 channels
 */

const SAMPLE_RATE = 44100; // Expected rate, though peaks are rate-agnostic
const CHANNELS = 2;
const BYTES_PER_SAMPLE = 4;
const CHUNK_SIZE = 1024;
const MAX_S32 = Math.pow(2, 31);

const FORMAT = process.argv[2] || 'S32_LE';
console.error(`Analyzer: Starting in ${FORMAT} mode`);

let buffer = Buffer.alloc(0);

process.stdin.on('data', (data) => {
    buffer = Buffer.concat([buffer, data]);

    const bytesNeeded = CHUNK_SIZE * CHANNELS * BYTES_PER_SAMPLE;

    while (buffer.length >= bytesNeeded) {
        const chunk = buffer.slice(0, bytesNeeded);
        buffer = buffer.slice(bytesNeeded);

        let peakL = 0;
        let peakR = 0;

        for (let i = 0; i < chunk.length; i += BYTES_PER_SAMPLE * CHANNELS) {
            let valL, valR;
            if (FORMAT === 'FLOAT32LE') {
                valL = Math.abs(chunk.readFloatLE(i));
                valR = Math.abs(chunk.readFloatLE(i + BYTES_PER_SAMPLE));
            } else {
                // S32_LE
                valL = Math.abs(chunk.readInt32LE(i)) / MAX_S32;
                valR = Math.abs(chunk.readInt32LE(i + BYTES_PER_SAMPLE)) / MAX_S32;
            }

            if (valL > peakL) peakL = valL;
            if (valR > peakR) peakR = valR;
        }

        // Convert to dB
        const dbL = peakL > 0 ? 20 * Math.log10(peakL) : -100;
        const dbR = peakR > 0 ? 20 * Math.log10(peakR) : -100;

        // Debug: Log if we see any non-silent signal (once every few seconds)
        if (peakL > 0.001 || peakR > 0.001) {
            const now = Date.now();
            if (!this.lastSignalLog || now - this.lastSignalLog > 5000) {
                console.error(`Analyzer: Signal detected! L: ${dbL.toFixed(1)}dB, R: ${dbR.toFixed(1)}dB`);
                this.lastSignalLog = now;
            }
        }

        // Output as JSON for parent process
        process.stdout.write(JSON.stringify([dbL, dbR]) + '\n');
    }
});

process.stdin.on('error', (err) => {
    console.error('LevelAnalyzer Error:', err.message);
});
