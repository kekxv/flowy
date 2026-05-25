# Flowy

Lightweight issue tracking platform — 问题和需求管理平台

## Features

- **Issue & Feature tracking** — bugs (问题) and feature requests (需求) with full CRUD
- **Project roles** — project_lead, backend_dev, frontend_dev, tester, ui_designer, devops, clerk, member
- **Milestones** — progress tracking, publish/close/reopen workflow
- **Time tracking** — per-user per-issue timer with duration logging
- **Comments** — Markdown support, threaded replies, status moderation (valid/invalid/outdated/duplicate)
- **External linking** — connect Gitea/GitHub via OAuth or PAT, link issues & PRs, auto-sync every 5 min
- **Notifications** — webhook and WeChat Work channels, multi-event rules
- **Permissions** — admin, project_lead, feature owner, reporter roles with granular access
- **i18n** — Chinese & English

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI, SQLAlchemy (async), SQLite |
| Frontend | React 19, Vite, Tailwind CSS 4, react-i18next |
| Package | uv (Python), npm (Node) |
| Auth | JWT (bcrypt) |
| OAuth | Gitea, GitHub |

## Quick Start

### Development

```bash
# Backend
cd backend
cp .env.example .env    # edit secrets
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload --host 0.0.0.0

# Frontend
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` — the first registered user becomes admin.

### Docker

```bash
cp .env.example .env     # edit secrets
docker compose up -d
```

## Project Structure

```
flowy/
├── backend/
│   ├── app/
│   │   ├── api/v1/       # REST endpoints
│   │   ├── core/         # crypto, dispatcher
│   │   ├── models/       # SQLAlchemy models
│   │   ├── schemas/      # Pydantic schemas
│   │   └── services/     # business logic, external providers, notifications, sync
│   ├── alembic/          # DB migrations
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── api/          # API client
│       ├── pages/        # page components
│       ├── components/   # layout, UI
│       ├── locales/      # zh.json, en.json
│       └── store/        # Zustand stores
├── Dockerfile.backend
├── Dockerfile.frontend
├── docker-compose.yml
└── nginx.conf
```

## Configuration

| Setting | Description |
|---------|-------------|
| `frontend_url` | For notification links (set in admin panel) |
| `gitea_instance_url` | Gitea server URL |
| `gitea_client_id` / `gitea_client_secret` | Gitea OAuth app credentials |
| `github_client_id` / `github_client_secret` | GitHub OAuth app credentials |

OAuth callback URL: `{frontend_url}/profile`

## License

MIT
