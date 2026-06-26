#!/bin/bash
set -e

echo "Starting Flowy..."

# Validate required environment variables
if [ -z "$JWT_SECRET" ] || [ "$JWT_SECRET" = "change-me-to-random-secret" ] || [ "$JWT_SECRET" = "dev-jwt-secret-change-in-production" ]; then
  echo "ERROR: JWT_SECRET is not set or uses a default value. Please set a secure JWT_SECRET."
  echo "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ]; then
  ENCRYPTION_KEY=$(python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())")
  echo "WARNING: ENCRYPTION_KEY was not set. Generated a temporary key."
  echo "  ENCRYPTION_KEY=$ENCRYPTION_KEY"
  echo "  Add this to your .env file to persist it across restarts."
  export ENCRYPTION_KEY
fi

# Run database migrations
echo "Running database migrations..."
cd /app
alembic upgrade head || echo "Warning: Migration failed, attempting to continue..."

# Start the application
PORT=${PORT:-80}
echo "Flowy is running on port $PORT"
exec uvicorn app.main:app --host 0.0.0.0 --port "$PORT"
