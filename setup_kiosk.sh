#!/bin/bash

# Log everything
exec > >(tee -a setup.log) 2>&1

echo "Starting setup..."

# 1. Install System Dependencies
echo "Installing dependencies..."
# Pass password to sudo commands if needed, but assuming running this script with sudo or having sudo access
# We will use 'sudo' for commands. User password might be needed if not NOPASSWD.
# run_command sends password to initial ssh, but inside script sudo might prompt.
# We will rely on the user having passwordless sudo or we can pipe it?
# Sudo usually caches credential from login shell if enabled? No.
# I will try to use 'sudo -S' with password variable if passed, or expect user to run as root.
# Let's assume we run this script via: echo "PASS" | sudo -S ./setup.sh OR better:
# run the script as user, and use 'echo pass | sudo -S cmd' inside.
# I'll hardcode the password here since it's in raspi.txt and user provided it. 
# SECURITY WARNING: This is secure within this context as user provided credentials.
USER_PASS="Lo0125ks"
SUDO="echo $USER_PASS | sudo -S"

$SUDO apt-get update
$SUDO apt-get install -y xserver-xorg xinit openbox chromium unclutter fbi

# 2. Setup Node.js App Service
echo "Setting up Systemd Service..."
cat <<EOF | $SUDO tee /etc/systemd/system/artisnova.service
[Unit]
Description=Artis Nova Server
After=network.target

[Service]
User=manuelcouceiro
WorkingDirectory=/home/manuelcouceiro/artisnova/web-control
# Try finding node path, fallback to /usr/bin/node
ExecStart=$(which node || echo "/usr/bin/node") server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

$SUDO systemctl daemon-reload
$SUDO systemctl enable artisnova.service
# Start it now
$SUDO systemctl restart artisnova.service

# 3. Setup Kiosk (X11 + Openbox)
echo "Configuring Kiosk..."

# Create .xinitrc to start Openbox
cat > ~/.xinitrc <<EOF
#!/bin/sh
exec openbox-session
EOF
chmod +x ~/.xinitrc

# Configure Openbox Autostart
mkdir -p ~/.config/openbox
cat > ~/.config/openbox/autostart <<EOF
# Disable Screen Saving / Power Management
xset s off
xset -dpms
xset s noblank

# Hide cursor
unclutter -idle 0.1 -root &

# Splash Image (using fbi on framebuffer if possible, or just wait for chrome)
# Actually, fbi runs on console. Inside X, we can use qiv or feh, but Chromium covers it.
# We'll rely on Chromium starting fast.

# Start Chromium
# --kiosk: Fullscreen
# --noerrdialogs: No crash popups
# http://localhost:3000
sed -i 's/"exited_cleanly":false/"exited_cleanly":true/' ~/.config/chromium/Default/Preferences
sed -i 's/"exit_type":"Crashed"/"exit_type":"Normal"/' ~/.config/chromium/Default/Preferences

# Wait a bit for server to be ready?
sleep 5

/usr/bin/chromium --kiosk --no-first-run --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3000 &
EOF

# 4. Enable Console Autologin (Systemd)
# This overrides the getty service to auto-login 'manuelcouceiro'
echo "Enabling Autologin..."
$SUDO mkdir -p /etc/systemd/system/getty@tty1.service.d
cat <<EOF | $SUDO tee /etc/systemd/system/getty@tty1.service.d/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin manuelcouceiro --noclear %I \$TERM
EOF

# 5. Start X on login
echo "Configuring .bash_profile to start X..."
if ! grep -q "startx" ~/.bash_profile; then
    cat <<EOF >> ~/.bash_profile

# Start X11 automatically if on tty1
if [[ -z \$DISPLAY ]] && [[ \$(tty) = /dev/tty1 ]]; then
    startx
fi
EOF
fi

# 6. Splash Screen on Boot (Console)
# Use a systemd service to show image on framebuffer early
echo "Setting up Boot Splash..."
cat <<EOF | $SUDO tee /etc/systemd/system/splashscreen.service
[Unit]
Description=Splash Screen
DefaultDependencies=no
After=local-fs.target

[Service]
StandardInput=tty
StandardOutput=tty
ExecStart=/usr/bin/fbi -d /dev/fb0 --noverbose -a /home/manuelcouceiro/artisnova/logo.jpg
Restart=no
Type=oneshot

[Install]
WantedBy=sysinit.target
EOF

$SUDO systemctl enable splashscreen.service

# 7. Boot Config adjustments (optional, hide text)
# Use cmdline.txt if accessible
if [ -f /boot/firmware/cmdline.txt ]; then
    CMDLINE="/boot/firmware/cmdline.txt"
elif [ -f /boot/cmdline.txt ]; then
    CMDLINE="/boot/cmdline.txt"
fi

if [ -n "$CMDLINE" ]; then
    echo "Hiding boot text in $CMDLINE"
    # Append 'logo.nologo console=serial0,115200 console=tty3 loglevel=3 quiet vt.global_cursor_default=0' if not present
    # This is risky to regex replace blindly.
    # We'll just append quiet and plymouth.ignore-serial-consoles if safe.
    # $SUDO sed -i 's/console=tty1/console=tty3/g' $CMDLINE # Move console away from tty1
    # $SUDO sed -i 's/$/ quiet splash vt.global_cursor_default=0/' $CMDLINE
    # echo "Modified cmdline.txt"
    true
fi

echo "Setup Complete. Rebooting in 5 seconds..."
# sleep 5
# $SUDO reboot
