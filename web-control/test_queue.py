import subprocess

script = '''
tell application "Music"
    try
        if not (exists current track) then return "STOPPED"
        
        try
            set sourceObj to current secondary container
        on error
            set sourceObj to current playlist
        end try
        
        set curIdx to index of current track
        set totalCount to count tracks of sourceObj
        
        set stopIdx to curIdx + 15
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

def run_script():
    try:
        p = subprocess.Popen(['osascript', '-e', script], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        stdout, stderr = p.communicate()
        print(f"STDOUT: {stdout.strip()}")
        if stderr:
             print(f"STDERR: {stderr.strip()}")
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    run_script()
