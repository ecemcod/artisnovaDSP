#!/bin/bash

# Configuration
PI_USER="manuelcouceiro"
PI_HOST="raspberrypi.local"
PI_DIR="/home/manuelcouceiro/artisnova"

echo "🚀 Starting synchronization to Raspberry Pi ($PI_HOST)..."

# 1. Build Frontend
echo "📦 Building frontend..."
cd "web-app" || exit
npm run build
cd ..

# 2. Sync web-control to Pi
# We exclude node_modules to keep it fast, and database files
echo "📡 Syncing web-control..."
rsync -avz --delete \
    --exclude 'node_modules' \
    --exclude 'history.db' \
    --exclude 'ArtisNova.log' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    web-control/ \
    "$PI_USER@$PI_HOST:$PI_DIR/web-control/"

# 3. Sync other necessary files
echo "📡 Syncing root files..."
rsync -avz \
    --exclude 'node_modules' \
    --exclude '.git' \
    --exclude '.DS_Store' \
    --exclude 'web-app' \
    --exclude 'web-control' \
    ./ \
    "$PI_USER@$PI_HOST:$PI_DIR/"

# 4. Restart services on Pi
echo "🔄 Restarting services on Pi..."
ssh "$PI_USER@$PI_HOST" "sudo systemctl restart artisnova.service"

echo "✅ Done! Artis Nova should be running at http://$PI_HOST:3000"
