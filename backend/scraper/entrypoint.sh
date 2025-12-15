#!/bin/bash

# Run database migrations
echo "Running database migrations..."
./run-migrations.sh || echo "Migration warning: continuing anyway"

# Start socat to forward external 9222 to internal Chrome debugging port
# This is needed because Chrome ignores --remote-debugging-address in newer versions
socat TCP-LISTEN:9223,fork,reuseaddr TCP:127.0.0.1:9222 &

# Start the Node.js application
exec npm start
