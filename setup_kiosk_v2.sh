#!/bin/bash

# Log everything
exec > >(tee -a setup_v2.log) 2>&1

echo "Starting setup v2..."

# Helper for sudo
mysudo() {
    echo "Lo0125ks" | sudo -S "$@"
}

# 0. Fix .bash_profile mess from previous run
if [ -f ~/.bash_profile ]; then
    echo "Appending .bash_profile to .profile and removing it..."
    cat ~/.bash_profile >> ~/.profile
    rm ~/.bash_profile
fi

# 1. Install System Dependencies
echo "Installing dependencies..."
mysudo apt-get update
mysudo apt-get install -y xserver-xorg xinit openbox chromium unclutter fbi

# 2. Setup Node.js App Service
echo "Setting up Systemd Service..."
# Use a temporary file to avoid complex piping with sudo
cat <<EOF > /tmp/artisnova.service
[Unit]
Description=Artis Nova Server
After=network.target

[Service]
User=manuelcouceiro
WorkingDirectory=/home/manuelcouceiro/artisnova/web-control
ExecStart=$(which node || echo "/usr/bin/node") server.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

mysudo mv /tmp/artisnova.service /etc/systemd/system/artisnova.service
mysudo chown root:root /etc/systemd/system/artisnova.service

mysudo systemctl daemon-reload
mysudo systemctl enable artisnova.service
mysudo systemctl restart artisnova.service

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
# Disable Screen Saving
xset s off
xset -dpms
xset s noblank

# Hide cursor
unclutter -idle 0.1 -root &

# Start Chromium
# Wait a bit for server
sleep 5
/usr/bin/chromium --kiosk --no-first-run --noerrdialogs --disable-infobars --check-for-update-interval=31536000 http://localhost:3000 &
EOF

# 4. Enable Console Autologin (Systemd)
echo "Enabling Autologin..."
mysudo mkdir -p /etc/systemd/system/getty@tty1.service.d
# Create file locally then move
cat <<EOF > /tmp/override.conf
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin manuelcouceiro --noclear %I \$TERM
EOF
mysudo mv /tmp/override.conf /etc/systemd/system/getty@tty1.service.d/override.conf

# 5. Start X on login (Append to .profile)
echo "Configuring .profile to start X..."
if ! grep -q "startx" ~/.profile; then
    cat <<EOF >> ~/.profile

# Start X11 automatically if on tty1
if [[ -z \$DISPLAY ]] && [[ \$(tty) = /dev/tty1 ]]; then
    startx
fi
EOF
fi

# 6. Splash Screen
echo "Setting up Boot Splash..."
cat <<EOF > /tmp/splashscreen.service
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
mysudo mv /tmp/splashscreen.service /etc/systemd/system/splashscreen.service
mysudo systemctl enable splashscreen.service

echo "Setup Complete. Rebooting in 5 seconds..."
# mysudo reboot
