# Product Overview

**ArtisNova DSP** is a comprehensive digital signal processing (DSP) audio system that provides real-time audio filtering and control through CamillaDSP. The system consists of:

- **Audio Processing Engine**: CamillaDSP-based real-time audio filtering with parametric EQ, gain control, and various filter types
- **Web Control Interface**: React-based web application for managing DSP settings, presets, and audio visualization
- **Music Integration**: Roon and LMS (Logitech Media Server) integration for seamless music playback control
- **Remote Deployment**: Automated deployment system for Raspberry Pi-based audio endpoints

## Key Features

- Real-time parametric EQ with visual frequency response graphs
- Audio preset management and switching
- VU meters and real-time audio analysis (RTA)
- Music metadata display with lyrics and artist information
- Play queue management and playback history
- Signal path monitoring and device health checks
- Cross-platform support (macOS development, Linux/Pi deployment)

## Target Environment

- **Development**: macOS with CoreAudio (BlackHole virtual audio device)
- **Production**: Raspberry Pi with ALSA audio system
- **Control**: Web-based interface accessible from any device on the local network