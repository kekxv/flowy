# === Stage 1: Backend dependencies ===
FROM python:3.11-slim AS backend-deps
WORKDIR /app
RUN pip install uv
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --no-dev --frozen

# === Stage 2: Frontend dependencies ===
FROM node:22-alpine AS frontend-deps
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# === Stage 3: Frontend build ===
FROM frontend-deps AS frontend-build
COPY frontend/ .
RUN npm run build

# === Stage 4: Final runtime ===
FROM python:3.11-slim

# Install nginx (cached unless this layer changes)
RUN apt-get update && apt-get install -y nginx && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy backend venv (cached unless pyproject.toml/uv.lock change)
COPY --from=backend-deps /app/.venv /app/.venv
COPY --from=backend-deps /root/.local /root/.local
ENV PATH="/app/.venv/bin:/root/.local/bin:$PATH"

# Copy nginx config (cached unless nginx.conf changes)
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy frontend dist (cached unless frontend code changes)
COPY --from=frontend-build /app/dist /app/static

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy backend code (this layer changes most often - keep LAST)
COPY backend/ .

RUN mkdir -p /data
ENV DATABASE_URL=sqlite+aiosqlite:////data/flowy.db

EXPOSE 80
CMD ["/entrypoint.sh"]
