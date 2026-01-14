import pty
import os
import sys
import time
import subprocess

def read_until(fd, markers, timeout=10):
    buf = b""
    start_time = time.time()
    while time.time() - start_time < timeout:
        try:
            chunk = os.read(fd, 1024)
            if not chunk:
                break
            buf += chunk
            for marker in markers:
                if marker.encode().lower() in buf.lower():
                    return buf, marker
        except OSError:
            break
        time.sleep(0.05)
    return buf, None

def run_with_password(cmd_args, password):
    pid, fd = pty.fork()
    if pid == 0:
        # Child
        os.execvp(cmd_args[0], cmd_args)
    else:
        # Parent
        output, found = read_until(fd, ["password:", "yes/no"], timeout=10)
        
        if found == "yes/no":
            os.write(fd, b"yes\n")
            output, found = read_until(fd, ["password:"], timeout=10)
            
        if found == "password:":
            os.write(fd, (password + "\n").encode())
            
            # Read rest of output
            while True:
                try:
                    chunk = os.read(fd, 1024)
                    if not chunk:
                        break
                    sys.stdout.buffer.write(chunk)
                    sys.stdout.flush()
                except OSError:
                    break
        else:
            print("Error: Expected password prompt, got:", output.decode('utf-8', errors='replace'))
            os.kill(pid, 9)
        
        os.waitpid(pid, 0)

if __name__ == "__main__":
    # Usage: python3 automate_scp.py <password> <command...>
    password = sys.argv[1]
    cmd = sys.argv[2:]
    run_with_password(cmd, password)
