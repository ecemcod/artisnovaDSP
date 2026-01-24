# Project Structure

## Root Directory
- **Configuration Files**: `config.yml`, `config.json` - DSP and Roon configuration
- **Presets**: `presets/` - JSON preset files for different audio profiles
- **Deployment Scripts**: `master_deploy.js`, `*_deploy.js` - Pi deployment automation
- **Utility Scripts**: Various `.js` files for debugging, monitoring, and maintenance

## Frontend Application (`web-app/`)
```
web-app/
├── src/
│   ├── components/          # React components
│   │   ├── FilterGraph.tsx  # Frequency response visualization
│   │   ├── PEQEditor.tsx    # Parametric EQ controls
│   │   ├── VUMeter.tsx      # Audio level meters
│   │   └── ...              # Other UI components
│   ├── utils/               # Utility functions
│   │   ├── audio-math.ts    # Audio calculations
│   │   ├── rewParser.ts     # REW file parsing
│   │   └── storage.ts       # Local storage management
│   ├── App.tsx              # Main application component
│   ├── types.ts             # TypeScript type definitions
│   └── main.tsx             # Application entry point
├── public/                  # Static assets
├── dist/                    # Build output (→ ../web-control/public)
└── package.json             # Frontend dependencies
```

## Backend Server (`web-control/`)
```
web-control/
├── server.js                # Main Express server
├── dsp-manager.js           # CamillaDSP process management
├── remote-dsp-manager.js    # Remote Pi DSP control
├── roon-controller.js       # Roon API integration
├── lms-controller.js        # LMS integration
├── parser.js                # Configuration parsing
├── database.js              # SQLite history database
├── public/                  # Built frontend assets (from web-app)
├── node_modules/            # Backend dependencies
└── package.json             # Backend dependencies
```

## Deployment Structure (`deploy/`)
- Contains packaged versions for Pi deployment
- Mirrors the main structure but optimized for production

## Configuration Patterns
- **YAML Files**: DSP configuration (`config.yml`, `*_config.yml`)
- **JSON Files**: Application state, presets, and API tokens
- **Environment-Specific**: Separate configs for macOS dev vs Pi production

## Key Architectural Patterns
- **Monorepo Structure**: Frontend and backend in same repository
- **Build Integration**: Frontend builds directly into backend's static folder
- **Process Management**: Backend manages CamillaDSP as child process
- **Real-time Communication**: WebSocket for live audio data and control
- **Configuration-Driven**: YAML-based DSP settings with hot-reload support