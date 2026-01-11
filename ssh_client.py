import pty
import os
import sys
import time

def read_until(fd, marker, timeout=10):
    buf = b""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            chunk = os.read(fd, 1024)
            if not chunk:
                break
            buf += chunk
            if marker.encode() in buf: # case sensitive for now
                return buf
            if b"Password:" in buf or b"password:" in buf: # Backup check
                return buf
        except OSError:
            break
        time.sleep(0.05)
    return buf

def run_ssh_command(user, host, password, command):
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        # Use -o BatchMode=no to ensure it asks for password
        # Use -o StrictHostKeyChecking=no to avoid yes/no prompt
        # Use -tt to force tty allocation which helps with some commands not returning if they expect interactive, 
        # but might cause CR/LF issues. We'll handle CR/LF.
        os.execvp("ssh", ["ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5", f"{user}@{host}", command])
    else:
        # Parent process
        output = read_until(fd, "password:", timeout=10)
        
        if b"password:" in output or b"Password:" in output:
            os.write(fd, (password + "\n").encode())
            
            final_output = b""
            while True:
                try:
                    # Give it time to execute. 
                    # We loop reading until EOF (command finishes and closes connection)
                    chunk = os.read(fd, 1024)
                    if not chunk:
                        break
                    final_output += chunk
                except OSError:
                    break
            
            _, status = os.waitpid(pid, 0)
            
            # Decode
            decoded = final_output.decode('utf-8', errors='replace').replace('\r\n', '\n')
            # Remove the password line if present (some systems echo it)
            # Usually we see the command output.
            print(decoded)
        else:
            print("Error: No password prompt.")
            print("Received:", output.decode('utf-8', errors='replace'))
            try:
                os.kill(pid, 9)
            except:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 5:
        print("Usage: python3 ssh_client.py <user> <host> <password> <command>")
        sys.exit(1)
    
    user = sys.argv[1]
    host = sys.argv[2]
    password = sys.argv[3]
    command = sys.argv[4]
    
    run_ssh_command(user, host, password, command)
