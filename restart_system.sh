#!/bin/bash

# ==========================================
# ARTIS NOVA - UNIVERSAL RESTART SCRIPT
# ==========================================

# Directory where this script is located
BASE_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$BASE_DIR"

echo "=========================================="
echo "   RESTARTING ARTIS NOVA SYSTEM"
echo "=========================================="

# 1. STOPPING EVERYTHING
echo "[1/3] Stopping existing processes..."

# Kill CamillaDSP
echo "Stopping CamillaDSP..."
pkill -9 camilladsp 2>/dev/null

# Kill Node.js Backend
echo "Stopping Node.js Backend..."
pkill -f "node server.js" 2>/dev/null

# Kill Vite Frontend
echo "Stopping Vite Frontend..."
pkill -f "vite" 2>/dev/null

# Clean up ports
echo "Cleaning up ports 3001, 5005, 3000..."
lsof -ti:3001,5005,3000 | xargs kill -9 2>/dev/null

sleep 2

# 2. STARTING EVERYTHING
echo "[2/3] Starting components..."

# Start Backend
echo "Starting Backend (port 3001)..."
cd "$BASE_DIR/web-control"
nohup /usr/local/bin/node server.js >> "$BASE_DIR/ArtisNova.log" 2>&1 &
BACKEND_PID=$!
echo "Backend started with PID $BACKEND_PID"

# Start Frontend
echo "Starting Frontend (port 3000)..."
cd "$BASE_DIR/web-app"
nohup npm run dev >> "/tmp/artisnova_frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend started with PID $FRONTEND_PID"

# 3. VERIFICATION
echo "[3/3] Verifying system status..."
sleep 5

# Check Backend
if ps -p $BACKEND_PID > /dev/null; then
    echo "✓ Backend is running (PID: $BACKEND_PID)"
else
    echo "✗ ERROR: Backend failed to start. Check ArtisNova.log"
fi

# Check Frontend
if ps -p $FRONTEND_PID > /dev/null; then
    echo "✓ Frontend is running (PID: $FRONTEND_PID)"
else
    echo "✗ ERROR: Frontend failed to start. Check /tmp/artisnova_frontend.log"
fi

# Check CamillaDSP (Backend should have started it)
sleep 2
if pgrep -x camilladsp > /dev/null; then
    echo "✓ CamillaDSP is running"
else
    echo "⚠ WARNING: CamillaDSP is not running yet. Backend might still be initializing it."
fi

echo "=========================================="
echo "   RESTART COMPLETE"
echo "=========================================="
echo "Web App URL: http://localhost:3000"
echo "Backend URL: http://localhost:3001"
echo "Logs: tail -f \"$BASE_DIR/ArtisNova.log\""
echo "=========================================="
