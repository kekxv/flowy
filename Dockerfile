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
WORKDIR /app

# Copy backend venv
COPY --from=backend-deps /app/.venv /app/.venv
ENV PATH="/app/.venv/bin:$PATH"

# Copy frontend dist
COPY --from=frontend-build /app/dist /app/static

# Copy entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Copy backend code (last layer - changes most often)
COPY backend/ .

RUN mkdir -p /data
ENV DATABASE_URL=sqlite+aiosqlite:////data/flowy.db
ENV STATIC_DIR=/app/static

EXPOSE 80
CMD ["/entrypoint.sh"]
