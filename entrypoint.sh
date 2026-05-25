#!/bin/bash
set -e

# Start backend (uvicorn is in /app/.venv/bin)
uvicorn app.main:app --host 127.0.0.1 --port 8000 &

# Start nginx (foreground)
echo "Starting Flowy..."
exec nginx -g "daemon off;"
