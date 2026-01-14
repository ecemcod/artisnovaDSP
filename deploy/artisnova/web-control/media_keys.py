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
        # simulate_media_key(KEY_PLAY_PAUSE)
        import subprocess
        subprocess.run(['osascript', '-e', 'tell application "Music" to playpause'])
        print("Play/Pause simulated")
    elif action == 'next':
        # simulate_media_key(KEY_NEXT)
        import subprocess
        subprocess.run(['osascript', '-e', 'tell application "Music" to next track'])
        print("Next track simulated")
    elif action in ['prev', 'previous']:
        # simulate_media_key(KEY_PREVIOUS)
        import subprocess
        subprocess.run(['osascript', '-e', 'tell application "Music" to previous track'])
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
                    set trackDuration to duration of current track
                    set playerPos to player position
                    
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
                    
                    return playState & "|" & trackName & "|" & artistName & "|" & albumName & "|" & artworkPath & "|" & trackDuration & "|" & playerPos
                else
                    return "stopped||||||"
                end if
            end tell
        on error errMsg
            return "unknown||||||"
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
                duration = parts[5].replace(',', '.') if len(parts) > 5 else '0'
                position = parts[6].replace(',', '.') if len(parts) > 6 else '0'
                
                info = {
                    "state": state, 
                    "track": track, 
                    "artist": artist, 
                    "album": album, 
                    "artwork": artwork,
                    "duration": float(duration) if duration else 0,
                    "position": float(position) if position else 0
                }
            else:
                info = {"state": "unknown", "track": "", "artist": "", "album": "", "artwork": "", "duration": 0, "position": 0, "note": output}
            
            print(json.dumps(info))
        except Exception as e:
            print(json.dumps({"state": "error", "track": "", "artist": "", "album": "", "artwork": "", "duration": 0, "position": 0, "error": str(e)}))
    elif action == 'queue':
        # Get upcoming tracks from the current playlist using AppleScript
        import subprocess
        import json
        
        script = '''
        tell application "Music"
            try
                if not (exists current track) then return "STOPPED"
                
                -- Use current playlist as the most reliable source
                set sourceObj to current playlist
                
                set curIdx to index of current track
                set totalCount to count tracks of sourceObj
                
                -- Gather up to 50 next tracks
                set stopIdx to curIdx + 50
                if stopIdx > totalCount then set stopIdx to totalCount
                
                set results to {}
                if curIdx < totalCount then
                    repeat with i from (curIdx + 1) to stopIdx
                        try
                            set t to track i of sourceObj
                            set end of results to (name of t & "|" & artist of t & "|" & album of t)
                        end try
                    end repeat
                end if
                
                if (count results) is 0 then return "EMPTY"
                
                set AppleScript's text item delimiters to "!!"
                return results as string
            on error errMsg
                return "ERROR|" & errMsg
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
    elif action == 'seek':
        if len(sys.argv) < 3:
            print("Usage: python3 media_keys.py seek [seconds]")
            sys.exit(1)
        import subprocess
        pos = sys.argv[2]
        subprocess.run(['osascript', '-e', f'tell application "Music" to set player position to {pos}'])
        print(f"Seeked to {pos}s")
    elif action == 'play_queue_item':
        if len(sys.argv) < 3:
            print("Error: Missing queue index")
            sys.exit(1)

        try:
            queue_index = int(sys.argv[2]) # 0-based index from the UI queue
        except ValueError:
            print("Error: Invalid queue index")
            sys.exit(1)

        import subprocess
        script = f'''
        tell application "Music"
            try
                set sourceObj to current playlist
                set curIdx to index of current track
                -- Queue index 0 is the NEXT track, so +1. 
                -- We want to jump to (curIdx + 1 + queue_index)
                -- Example: Queue[0] is curIdx+1.
                set targetIdx to curIdx + 1 + {queue_index}
                
                play track targetIdx of sourceObj
                return "OK"
            on error
                return "ERROR"
            end try
        end tell
        '''
        
        proc = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        out, err = proc.communicate()
        print(out.decode('utf-8').strip())

    else:
        print(f"Unknown action: {action}")
        sys.exit(1)

if __name__ == "__main__":
    main()
