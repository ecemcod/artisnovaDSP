#!/bin/bash
clear
echo "=============================="
echo "    ARTIS NOVA SERVER"
echo "=============================="
# Ir a la carpeta del servidor usando la ruta de este script
cd "$(dirname "$0")"
cd web-control
/usr/local/bin/node server.js 2>&1 | tee -a "../ArtisNova.log"
if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: El servidor se ha detenido inesperadamente."
    read -p "Presiona Enter para cerrar esta ventana..."
fi
