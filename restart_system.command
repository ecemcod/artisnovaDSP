#!/bin/bash
clear
echo "=============================="
echo "    ARTIS NOVA - RESTART"
echo "=============================="
# Go to the directory of this script
cd "$(dirname "$0")"
./restart_system.sh
echo ""
echo "Press Enter to close this window..."
read
