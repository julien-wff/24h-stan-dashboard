#!/usr/bin/env bash

# ====== EDIT THESE TWO VALUES FIRST ======
KIOSK_USER=$USER
KIOSK_URL="https://news.google.com/home"
# ========================================

set -euo pipefail

# 1) Install required packages (minimal Wayland kiosk stack)
sudo apt update
sudo apt install -y --no-install-recommends \
cage chromium seatd dbus-user-session

# 2) Enable seat management
sudo systemctl enable --now seatd

# 3) Ensure kiosk user has required device access
sudo usermod -aG video,render,input "$KIOSK_USER"

# 3b) Disable kernel console blanking persistently
CMDLINE_FILE="/boot/firmware/cmdline.txt"
if [ -f "$CMDLINE_FILE" ]; then
    if grep -q 'consoleblank=' "$CMDLINE_FILE"; then
        sudo sed -i -E 's/consoleblank=[0-9]+/consoleblank=0/g' "$CMDLINE_FILE"
    else
        sudo sed -i '1 s/$/ consoleblank=0/' "$CMDLINE_FILE"
    fi
fi

# 4) Create kiosk launcher script
sudo -u "$KIOSK_USER" tee "/home/$KIOSK_USER/kiosk-wayland.sh" > /dev/null <<EOF
#!/usr/bin/env bash
export XDG_SESSION_TYPE=wayland

while true; do
  mkdir -p "/dev/shm/chromium-cache"
  chromium \
    --kiosk "$KIOSK_URL" \
    --no-first-run \
    --noerrdialogs \
    --disable-session-crashed-bubble \
    --disable-infobars \
    --disable-background-networking \
    --disable-translate \
    --disable-features=Translate,TranslateUI,LanguageDetection \
    --user-data-dir="/home/$KIOSK_USER/.config/chromium-kiosk" \
    --disk-cache-dir="/dev/shm/chromium-cache" \
    --disk-cache-size=67108864 \
    --media-cache-size=33554432 \
    --renderer-process-limit=2 \
    --use-gl=egl \
    --enable-gpu-rasterization \
    --enable-zero-copy \
    --ignore-gpu-blocklist \
    --ozone-platform=wayland \
    --enable-features=UseOzonePlatform
  sleep 1
done
EOF

sudo chmod +x "/home/$KIOSK_USER/kiosk-wayland.sh"
sudo chown "$KIOSK_USER:$KIOSK_USER" "/home/$KIOSK_USER/kiosk-wayland.sh"

# 5) Create systemd service for Cage kiosk
sudo tee /etc/systemd/system/kiosk.service > /dev/null <<EOF
[Unit]
Description=Wayland Cage Chromium Kiosk
After=systemd-user-sessions.service network-online.target seatd.service
Wants=network-online.target seatd.service

[Service]
User=$KIOSK_USER
Group=$KIOSK_USER
PAMName=login
TTYPath=/dev/tty1
StandardInput=tty
TTYReset=yes
TTYVHangup=yes
TTYVTDisallocate=yes
ExecStartPre=/usr/bin/sh -c '/usr/bin/setterm --blank 0 --powerdown 0 --powersave off < /dev/tty1 > /dev/tty1'
ExecStart=/usr/bin/cage -s -- /home/$KIOSK_USER/kiosk-wayland.sh
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# 6) Free tty1 and enable kiosk service at boot
sudo systemctl disable --now getty@tty1.service || true
sudo systemctl daemon-reload
sudo systemctl enable --now kiosk.service

# 7) Reboot once so new group membership definitely applies
echo "Setup complete! Press any key to reboot..."
read -n 1 -s
sudo reboot
