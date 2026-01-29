#!/bin/bash

# ==========================================
# ARTIS NOVA - QUAD WINDOW LAUNCHER
# ==========================================

# 1. Configuración de URLs
BASE_URL="http://localhost:3000"
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

echo "Launching ArtisNova Quad-View..."

# 2. Abrir las 4 ventanas en modo "App" (sin barra de direcciones ni pestañas)
# Nota: Usamos --new-window para forzar ventanas independientes

# Ventana 1: Playback Central (Modo principal)
"$CHROME_PATH" --app="$BASE_URL/?mode=playback" --new-window &
sleep 1

# Ventana 2: VU Meters
"$CHROME_PATH" --app="$BASE_URL/?mode=visualization&vizMode=vu" --new-window &
sleep 1

# Ventana 3: RTA (Real Time Analyzer)
"$CHROME_PATH" --app="$BASE_URL/?mode=visualization&vizMode=rta" --new-window &
sleep 1

# Ventana 4: Lyrics (Letras)
"$CHROME_PATH" --app="$BASE_URL/?mode=lyrics" --new-window &
sleep 1

echo "All 4 windows launched. Organizing..."
# Optional: could add Applescript here to arrange them, but for now we just launch.
echo "Done."
