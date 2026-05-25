#!/bin/bash
set -e
echo "Starting Flowy..."
exec uvicorn app.main:app --host 0.0.0.0 --port 80
