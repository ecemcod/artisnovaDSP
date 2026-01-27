#!/usr/bin/env node

const axios = require('axios');

const API_URL = 'http://localhost:3000/api';

async function testTrackChangeSpeed() {
    console.log('Testing track change detection speed...\n');
    
    let lastTrack = null;
    let changeDetected = false;
    let startTime = null;
    
    console.log('Monitoring for track changes. Change a track in Roon now...\n');
    
    const interval = setInterval(async () => {
        try {
            const res = await axios.get(`${API_URL}/media/info?source=roon`);
            const currentTrack = res.data.track;
            const timestamp = new Date().toISOString();
            
            if (lastTrack === null) {
                lastTrack = currentTrack;
                console.log(`[${timestamp}] Initial track: "${currentTrack}"`);
                return;
            }
            
            if (currentTrack !== lastTrack && !changeDetected) {
                if (startTime === null) {
                    startTime = Date.now();
                    console.log(`[${timestamp}] Track change detected!`);
                    console.log(`  From: "${lastTrack}"`);
                    console.log(`  To:   "${currentTrack}"`);
                    changeDetected = true;
                    
                    // Continue monitoring for a few more seconds to see stability
                    setTimeout(() => {
                        clearInterval(interval);
                        console.log('\nMonitoring complete.');
                        process.exit(0);
                    }, 3000);
                }
            } else if (currentTrack === lastTrack && changeDetected) {
                // Track info is stable
                console.log(`[${timestamp}] Track info stable: "${currentTrack}"`);
            }
            
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error:`, error.message);
        }
    }, 200); // Check every 200ms for very fast detection
    
    // Timeout after 60 seconds
    setTimeout(() => {
        clearInterval(interval);
        console.log('\nTimeout reached. No track change detected.');
        process.exit(1);
    }, 60000);
}

testTrackChangeSpeed().catch(console.error);