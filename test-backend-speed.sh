#!/bin/bash

echo "Testing backend response speed..."
echo "Change a track in Roon now and watch for changes..."
echo ""

last_track=""
count=0

while [ $count -lt 30 ]; do
    timestamp=$(date '+%H:%M:%S.%3N')
    response=$(curl -s "http://localhost:3000/api/media/info?source=roon" 2>/dev/null)
    
    if [ $? -eq 0 ]; then
        current_track=$(echo "$response" | grep -o '"track":"[^"]*"' | cut -d'"' -f4)
        
        if [ -n "$current_track" ]; then
            if [ "$last_track" != "$current_track" ] && [ -n "$last_track" ]; then
                echo "[$timestamp] TRACK CHANGED!"
                echo "  From: $last_track"
                echo "  To:   $current_track"
                echo ""
            elif [ -z "$last_track" ]; then
                echo "[$timestamp] Initial track: $current_track"
                last_track="$current_track"
            fi
            
            if [ "$last_track" = "$current_track" ]; then
                echo -ne "[$timestamp] Monitoring: $current_track\r"
            else
                last_track="$current_track"
            fi
        fi
    else
        echo "[$timestamp] Backend not responding"
    fi
    
    sleep 0.5
    count=$((count + 1))
done

echo ""
echo "Test completed."