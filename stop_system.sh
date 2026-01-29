#!/bin/bash

# ==========================================
# ARTIS NOVA - SYSTEM STOP SCRIPT
# ==========================================

echo "=========================================="
echo "   STOPPING ARTIS NOVA SYSTEM"
echo "=========================================="

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

echo "=========================================="
echo "   ALL PROCESSES STOPPED"
echo "=========================================="
