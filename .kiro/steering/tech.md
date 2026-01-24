# Technology Stack

## Frontend (web-app/)
- **Framework**: React 19.2 with TypeScript
- **Build Tool**: Vite 7.2
- **Styling**: Tailwind CSS 4.1
- **UI Components**: Lucide React icons, Recharts for graphs
- **State Management**: React hooks (useState, useEffect)
- **HTTP Client**: Axios
- **Routing**: React Router DOM

## Backend (web-control/)
- **Runtime**: Node.js
- **Framework**: Express.js
- **WebSocket**: ws library for real-time communication
- **Audio Processing**: CamillaDSP (external binary)
- **Configuration**: YAML files for DSP settings
- **Database**: SQLite3 for playback history
- **Music APIs**: Roon API, LMS integration

## Audio System
- **DSP Engine**: CamillaDSP
- **Audio I/O**: CoreAudio (macOS), ALSA (Linux/Pi)
- **Virtual Audio**: BlackHole 2ch (development)
- **Configuration**: YAML-based filter and device configuration

## Development Tools
- **Linting**: ESLint with TypeScript support
- **Type Checking**: TypeScript 5.9
- **Process Management**: PM2 (production)

## Common Commands

### Frontend Development
```bash
cd web-app
npm run dev          # Start development server
npm run build        # Build for production (outputs to ../web-control/public)
npm run lint         # Run ESLint
```

### Backend Development
```bash
cd web-control
npm start            # Start Express server
node server.js       # Direct server start
```

### Deployment
```bash
node master_deploy.js    # Deploy to Raspberry Pi
```

### Audio System
```bash
./camilladsp config.yml  # Start DSP with configuration
```

## Build Process
- Frontend builds to `web-control/public/` directory
- Backend serves static files from `public/` folder
- Single deployment bundle includes both frontend and backend
- Automated Pi deployment via SSH/SCP scripts