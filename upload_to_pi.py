import os
import subprocess
import getpass

def run_command(cmd):
    print(f"Executing: {cmd}")
    subprocess.run(cmd, shell=True)

def main():
    host = "raspberrypi.local"
    user = "manuelcouceiro"
    
    # Prompt for password once to use in scp/ssh if needed
    # but actual scp/ssh will prompt their own.
    
    print("🚀 Starting deployment to Raspberry Pi...")
    
    # 1. Sync web-control (includes built frontend in public/)
    print("📡 Uploading web-control...")
    run_command(f"scp -r \"web-control/\" {user}@{host}:/home/{user}/camilla/")
    
    # 2. Sync root files
    print("📡 Uploading root scripts...")
    run_command(f"scp raspi_config.yml {user}@{host}:/home/{user}/camilla/")
    
    # 3. Restart Service
    print("🔄 Restarting service on Pi...")
    run_command(f"ssh {user}@{host} 'sudo systemctl restart camilla-web'")
    
    print("✅ Deployment complete!")

if __name__ == "__main__":
    main()
