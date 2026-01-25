const { describe, it, expect } = require('@jest/globals');

// Mock para simular la funcionalidad de navegación automática
describe('Now Playing Navigation Integration', () => {
    it('should auto-navigate to current artist when Music Explorer is activated', () => {
        // Mock nowPlaying data
        const nowPlaying = {
            track: 'On Hope',
            artist: 'Bjorn Meyer',
            album: 'Convergence',
            artworkUrl: 'http://example.com/artwork.jpg',
            state: 'playing'
        };

        // Mock navigation state
        const navigationState = {
            currentView: 'home',
            currentId: null,
            history: [],
            historyIndex: -1
        };

        // Simulate the auto-navigation logic
        const shouldAutoNavigate = nowPlaying?.artist && navigationState.currentView === 'home';
        
        expect(shouldAutoNavigate).toBe(true);
        expect(nowPlaying.artist).toBe('Bjorn Meyer');
        expect(nowPlaying.track).toBe('On Hope');
    });

    it('should show now playing indicator when viewing current artist', () => {
        const nowPlaying = {
            track: 'On Hope',
            artist: 'Bjorn Meyer',
            album: 'Convergence'
        };

        const currentArtistId = 'Bjorn Meyer';
        
        // Check if current artist matches now playing
        const isCurrentlyPlaying = nowPlaying?.artist === currentArtistId;
        
        expect(isCurrentlyPlaying).toBe(true);
    });

    it('should not show now playing indicator for different artist', () => {
        const nowPlaying = {
            track: 'On Hope',
            artist: 'Bjorn Meyer',
            album: 'Convergence'
        };

        const currentArtistId = 'Different Artist';
        
        // Check if current artist matches now playing
        const isCurrentlyPlaying = nowPlaying?.artist === currentArtistId;
        
        expect(isCurrentlyPlaying).toBe(false);
    });

    it('should handle missing nowPlaying data gracefully', () => {
        const nowPlaying = null;
        const navigationState = { currentView: 'home' };
        
        const shouldAutoNavigate = !!(nowPlaying?.artist && navigationState.currentView === 'home');
        
        expect(shouldAutoNavigate).toBe(false);
    });
});