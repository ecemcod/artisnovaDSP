#!/usr/bin/env python3
"""
macOS Media Key Simulator using Quartz CGEvent
Usage: python3 media_keys.py [play|next|prev]
"""
import sys

try:
    import Quartz
except ImportError:
    print("Error: pyobjc-framework-Quartz not installed")
    print("Run: pip3 install pyobjc-framework-Quartz")
    sys.exit(1)

import time

# NX_KEYTYPE values for media keys
KEY_PLAY_PAUSE = 16
KEY_NEXT = 17
KEY_PREVIOUS = 18

def simulate_media_key(key_code):
    """Simulate a media key press and release"""
    def do_key(down):
        ev = Quartz.NSEvent.otherEventWithType_location_modifierFlags_timestamp_windowNumber_context_subtype_data1_data2_(
            Quartz.NSSystemDefined,  # type
            (0, 0),  # location
            0xa00 if down else 0xb00,  # flags (key down/up)
            0,  # timestamp
            0,  # window
            0,  # context
            8,  # subtype (media key)
            (key_code << 16) | ((0xa if down else 0xb) << 8),  # data1
            -1  # data2
        )
        Quartz.CGEventPost(0, ev.CGEvent())
    
    do_key(True)
    time.sleep(0.05)
    do_key(False)

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 media_keys.py [play|next|prev|info]")
        sys.exit(1)
    
    action = sys.argv[1].lower()
    
    if action in ['play', 'playpause']:
        simulate_media_key(KEY_PLAY_PAUSE)
        print("Play/Pause simulated")
    elif action == 'next':
        simulate_media_key(KEY_NEXT)
        print("Next track simulated")
    elif action in ['prev', 'previous']:
        simulate_media_key(KEY_PREVIOUS)
        print("Previous track simulated")
    elif action == 'stop':
        # Stop Music app
        import subprocess
        subprocess.run(['osascript', '-e', 'tell application "Music" to stop'])
        print("Stop simulated")
    elif action == 'info':
        # Get now playing info using AppleScript
        import subprocess
        import json
        
        # Try to get info from Music app
        script = '''
        try
            tell application "Music"
                if player state is playing or player state is paused then
                    set trackName to name of current track
                    set artistName to artist of current track
                    set albumName to album of current track
                    
                    -- Get state
                    if player state is playing then
                        set playState to "playing"
                    else
                        set playState to "paused"
                    end if
                    
                    -- Try to get artwork
                    set artworkPath to ""
                    try
                        set artworkData to data of artwork 1 of current track
                        set artworkPath to "/tmp/artisnova_artwork.jpg"
                        set fileRef to open for access (POSIX file artworkPath) with write permission
                        set eof of fileRef to 0
                        write artworkData to fileRef
                        close access fileRef
                    on error
                        set artworkPath to ""
                    end try
                    
                    return playState & "|" & trackName & "|" & artistName & "|" & albumName & "|" & artworkPath
                else
                    return "stopped||||"
                end if
            end tell
        on error errMsg
            return "unknown||||"
        end try
        '''
        
        try:
            result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=5)
            output = result.stdout.strip()
            
            if '|' in output:
                parts = output.split('|')
                state = parts[0] if len(parts) > 0 else 'unknown'
                track = parts[1] if len(parts) > 1 else ''
                artist = parts[2] if len(parts) > 2 else ''
                album = parts[3] if len(parts) > 3 else ''
                artwork = parts[4] if len(parts) > 4 else ''
                info = {"state": state, "track": track, "artist": artist, "album": album, "artwork": artwork}
            else:
                info = {"state": "unknown", "track": "", "artist": "", "album": "", "artwork": "", "note": output}
            
            print(json.dumps(info))
        except Exception as e:
            print(json.dumps({"state": "error", "track": "", "artist": "", "album": "", "artwork": "", "error": str(e)}))
    elif action == 'queue':
        # Get upcoming tracks from the current playlist using AppleScript
        import subprocess
        import json
        
        script = '''
        tell application "Music"
            try
                if not (exists current track) then return "STOPPED"
                
                set sourceObj to missing value
                try
                    set sourceObj to current playlist
                on error
                    try
                        set sourceObj to current secondary container
                    on error
                        try
                            set sourceObj to container of current track
                        end try
                    end try
                end try
                
                if sourceObj is missing value then return "EMPTY"
                
                try
                    set curIdx to index of current track
                    set totalCount to count tracks of sourceObj
                    
                    if curIdx >= totalCount then return "EMPTY"
                    
                    set stopIdx to curIdx + 15
                    if stopIdx > totalCount then set stopIdx to totalCount
                    
                    set results to {}
                    repeat with i from (curIdx + 1) to stopIdx
                        try
                            set t to track i of sourceObj
                            set end of results to (name of t & "|" & artist of t & "|" & album of t)
                        end try
                    end repeat
                    
                    if (count results) is 0 then return "EMPTY"
                    
                    set AppleScript's text item delimiters to "!!"
                    return results as string
                on error
                    return "EMPTY"
                end try
            on error
                return "ERROR"
            end try
        end tell
        '''
        
        try:
            result = subprocess.run(['osascript', '-e', script], capture_output=True, text=True, timeout=5)
            output = result.stdout.strip()
            
            if output in ["STOPPED", "EMPTY"] or output.startswith("ERROR"):
                print(json.dumps({"queue": []}))
            else:
                queue = []
                for item in output.split('!!'):
                    if '|' in item:
                        parts = item.split('|')
                        queue.append({
                            "track": parts[0], 
                            "artist": parts[1] if len(parts) > 1 else "",
                            "album": parts[2] if len(parts) > 2 else ""
                        })
                print(json.dumps({"queue": queue}))
        except Exception as e:
            print(json.dumps({"queue": [], "error": str(e)}))
    else:
        print(f"Unknown action: {action}")
        sys.exit(1)

if __name__ == "__main__":
    main()
