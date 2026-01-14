const axios = require('axios');

class LMSController {
    constructor(options = {}) {
        this.host = options.host || 'raspberrypi.local';
        this.port = options.port || 9000;
        this.playerId = options.playerId || 'dc:a6:32:d9:98:f5';
        this.rpcUrl = `http://${this.host}:${this.port}/jsonrpc.js`;

        this.status = {
            state: 'stopped',
            track: null,
            artist: null,
            album: null,
            artworkUrl: null,
            duration: 0,
            position: 0,
            bitrate: null,
            format: null
        };
    }

    async _request(params) {
        try {
            const response = await axios.post(this.rpcUrl, {
                id: 1,
                method: 'slim.request',
                params: [this.playerId, params]
            }, { timeout: 2000 });
            return response.data;
        } catch (err) {
            console.error('LMS Error:', err.message);
            return null;
        }
    }

    async getPlayers() {
        try {
            const response = await axios.post(this.rpcUrl, {
                id: 1,
                method: 'slim.request',
                params: ["", ["players", 0, 100]]
            }, { timeout: 2000 });

            if (!response.data || !response.data.result || !response.data.result.players_loop) {
                return [];
            }

            return response.data.result.players_loop.map(p => ({
                id: p.playerid,
                name: p.name,
                active: p.playerid === this.playerId,
                state: p.isplaying ? 'playing' : 'stopped',
                source: 'lms'
            }));
        } catch (err) {
            console.error('LMS getPlayers Error:', err.message);
            return [];
        }
    }

    async getStatus() {
        const data = await this._request(['status', '-', 1, 'tags:aBclmnrtuy']);
        if (!data || !data.result) return this.status;

        const res = data.result;
        const playlist = res.playlist_loop ? res.playlist_loop[0] : null;

        this.status = {
            state: res.mode === 'play' ? 'playing' : (res.mode === 'pause' ? 'paused' : 'stopped'),
            track: playlist ? playlist.title : null,
            artist: playlist ? playlist.artist : null,
            album: playlist ? playlist.album : null,
            artworkUrl: playlist ? `http://${this.host}:${this.port}/music/${playlist.artwork_track_id || playlist.id}/cover.jpg` : null,
            duration: res.duration || 0,
            position: res.time || 0,
            bitrate: playlist ? playlist.bitrate : null,
            format: playlist ? playlist.type : null
        };

        return this.status;
    }

    async control(action) {
        let command = [];
        switch (action) {
            case 'play': command = ['play']; break;
            case 'pause': command = ['pause', '1']; break;
            case 'playpause': command = ['pause']; break;
            case 'stop': command = ['stop']; break;
            case 'next': command = ['playlist', 'index', '+1']; break;
            case 'previous': command = ['playlist', 'index', '-1']; break;
        }

        if (command.length > 0) {
            return this._request(command);
        }
    }

    async seek(seconds) {
        return this._request(['time', seconds]);
    }
}

module.exports = LMSController;
