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
            if marker.encode() in buf:
                return buf
        except OSError:
            break
        time.sleep(0.1)
    return buf

def run_scp(user, host, password, local_path, remote_path):
    pid, fd = pty.fork()
    if pid == 0:
        # Recursive copy
        # Ensure we capture stderr too
        os.dup2(1, 2)
        os.execvp("scp", ["scp", "-r", "-v", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=5", local_path, f"{user}@{host}:{remote_path}"])
    else:
        output_data = b""
        
        # Check for password prompt or immediate failure
        # We need to read continuously to catch "password:" or errors
        
        while True:
            try:
                chunk = os.read(fd, 1024)
                if not chunk: break
                output_data += chunk
                
                if b"password:" in chunk or b"Password:" in chunk:
                    os.write(fd, (password + "\n").encode())
                
                # Print debug info (verbose)
                # print(chunk.decode(errors='replace'), end='') 
                
            except OSError:
                break
        
        _, status = os.waitpid(pid, 0)
        
        if os.WEXITSTATUS(status) == 0:
            print("Transfer successful")
        else:
            print("Transfer failed")
            print("Output dump:")
            print(output_data.decode(errors='replace'))

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: python3 scp_client.py <user> <host> <password> <local_path> <remote_path>")
        sys.exit(1)
    run_scp(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5])
