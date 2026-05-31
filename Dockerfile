# === Stage 1: Backend dependencies ===
FROM python:3.11-slim AS backend-deps
WORKDIR /app
RUN pip install uv --no-cache-dir
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

# Copy backend code (last layer - changes most often)
COPY backend/ .

# Create non-root user and set permissions
RUN useradd --system --group --shell /bin/false appuser \
    && mkdir -p /data \
    && chown -R appuser:appuser /app /data

ENV DATABASE_URL=sqlite+aiosqlite:////data/flowy.db
ENV STATIC_DIR=/app/static

USER appuser

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:80/api/v1/health')" || exit 1

CMD ["/entrypoint.sh"]
