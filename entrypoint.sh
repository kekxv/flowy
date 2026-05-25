#!/bin/bash
set -e

# Start backend
uvicorn app.main:app --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!

# Start nginx (foreground)
echo "Starting Flowy..."
exec nginx -g "daemon off;"
