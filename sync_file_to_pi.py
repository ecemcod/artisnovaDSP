import pty
import os
import sys
import base64
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
            if marker.encode() in buf:
                return buf
        except OSError:
            break
        time.sleep(0.1)
    return buf

def sync_file(user, host, password, local_path, remote_path):
    # Read local file and encode base64
    with open(local_path, "rb") as f:
        content = f.read()
    encoded = base64.b64encode(content).decode("utf-8")
    
    # Command to receive and decode file
    cmd = f"base64 -d > {remote_path}"
    
    pid, fd = pty.fork()
    if pid == 0:
        # Child process
        os.execvp("ssh", ["ssh", "-o", "StrictHostKeyChecking=no", f"{user}@{host}", cmd])
    else:
        # Parent process
        output = read_until(fd, "password:", timeout=10)
        
        if b"password:" in output or b"Password:" in output:
            # Send password
            os.write(fd, (password + "\n").encode())
            
            # Wait a bit for the shell to be ready
            time.sleep(1)
            
            # Send the base64 content in chunks to avoid PTY buffer issues
            chunk_size = 4096
            for i in range(0, len(encoded), chunk_size):
                chunk = encoded[i:i + chunk_size]
                os.write(fd, chunk.encode())
                # Small sleep to allow the buffer to clear if needed
                time.sleep(0.01)
            
            os.write(fd, b"\n")
            
            # Send EOF (Ctrl-D) to close stdin of the remote command
            os.write(fd, b"\x04")
            
            # Read any remaining output
            final_output = b""
            while True:
                try:
                    chunk = os.read(fd, 1024)
                    if not chunk:
                        break
                    final_output += chunk
                except OSError:
                    break
            
            _, status = os.waitpid(pid, 0)
            print(f"File {local_path} synced to {remote_path}")
        else:
            print("Error: Did not receive password prompt.")
            print("Output was:", output.decode('utf-8', errors='replace'))
            try:
                os.kill(pid, 9)
            except:
                pass

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python3 sync_file_to_pi.py <user> <host> <password> <local_path> <remote_path>")
        sys.exit(1)
    
    sync_file(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
