#!/bin/bash

# Detect local IP
IP=$(ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -n 1)

if [ -z "$IP" ]; then
  echo "Could not detect local IP. Defaulting to localhost."
  IP="localhost"
else
  echo "Detected Local IP: $IP"
fi

echo ""
echo "Select Run Mode:"
echo "  [1] Web (Persistent Auth) - Defaults to Chrome with saved login"
echo "  [2] Select Device Interactively (Run on macOS, iOS, or Web without persistence)"
echo ""
read -p "Enter choice [1]: " choice
choice=${choice:-1}

if [[ "$choice" == "1" ]]; then
    echo "Starting Flutter Web with persistent profile..."
    flutter run -d chrome --web-port=4000 --web-browser-flag "--user-data-dir=/tmp/flutter_chrome_dev_social_event" --dart-define=API_URL=http://$IP:3007
else
    echo "Starting Flutter interactively..."
    flutter run --dart-define=API_URL=http://$IP:3007
fi
