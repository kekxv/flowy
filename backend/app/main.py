import json
import logging
import uuid
from contextlib import asynccontextmanager

from uvicorn.logging import DefaultFormatter

# Monkey-patch json.dumps to output Unicode as-is (not escaped)
# but respect explicit ensure_ascii if provided
_original_dumps = json.dumps
def _json_dumps_unicode(obj, **kwargs):
    kwargs.setdefault('ensure_ascii', False)
    return _original_dumps(obj, **kwargs)
json.dumps = _json_dumps_unicode

# Unified colored log format — all app loggers use "uvicorn"
_LOG_FORMAT = "%(levelprefix)s %(asctime)s %(message)s"
_log_handler = logging.StreamHandler()
_log_handler.setFormatter(DefaultFormatter(fmt=_LOG_FORMAT, datefmt="%H:%M:%S", use_colors=True))

_uvicorn_logger = logging.getLogger("uvicorn")
_uvicorn_logger.handlers.clear()
_uvicorn_logger.addHandler(_log_handler)
_uvicorn_logger.setLevel(logging.DEBUG)
_uvicorn_logger.propagate = False

logger = logging.getLogger("uvicorn")

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select

# Ensure all models are loaded for SQLAlchemy mapper configuration
import app.models  # noqa: E402, F401
from app.api.v1.router import api_router
from app.database import Base, async_session, engine
from app.services.sync_service import sync_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting application lifespan...")

    # Auto-apply migrations using alembic (run in thread to avoid blocking async loop)
    import asyncio

    from alembic.config import Config

    from alembic import command

    def _run_migrations():
        alembic_cfg = Config("alembic.ini")
        command.upgrade(alembic_cfg, "head")

    try:
        await asyncio.to_thread(_run_migrations)
        logger.info("alembic finish...")
    except Exception:
        logger.warning("alembic finish...")
        # Fallback: create tables if alembic fails
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    # Seed default labels if none exist
    from app.models.issue import Label

    async with async_session() as db:
        try:
            count = (await db.execute(select(func.count(Label.id)))).scalar() or 0
            if count == 0:
                defaults = [
                    ("bug", "#ef4444", "Bug / 缺陷"),
                    ("feature", "#8b5cf6", "Feature / 功能"),
                    ("improvement", "#3b82f6", "Improvement / 改进"),
                    ("documentation", "#6b7280", "Docs / 文档"),
                    ("design", "#ec4899", "Design / 设计"),
                    ("security", "#f97316", "Security / 安全"),
                    ("performance", "#eab308", "Performance / 性能"),
                    ("testing", "#14b8a6", "Testing / 测试"),
                ]
                for name, color, desc in defaults:
                    db.add(Label(id=str(uuid.uuid4()), name=name, color=color, description=desc))
                await db.commit()
        except Exception:
            logger.exception("Failed to seed default labels")

    await sync_service.start()
    logger.info("External sync started")

    # Auto-start WeChat Work bot if configured
    from app.services.wechat_work_bot import bot_service

    try:
        started = await bot_service.load_config_and_start()
        if started:
            logger.info("WeChat Work bot auto-started")
        else:
            logger.info("WeChat Work bot not configured (no bot_id/secret)")
    except Exception:
        logger.exception("Failed to auto-start WeChat Work bot")

    logger.info("Application startup complete")
    yield

    await bot_service.stop()
    await sync_service.stop()


def create_app() -> FastAPI:
    app = FastAPI(title="Flowy", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    app.include_router(api_router)

    # Serve frontend static files (SPA fallback)
    import os

    from fastapi.responses import FileResponse

    static_dir = os.environ.get("STATIC_DIR", "static")
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.isdir(static_dir) and os.path.isdir(assets_dir):
        # Mount static assets first
        app.mount(
            "/assets", StaticFiles(directory=assets_dir), name="assets"
        )

        # SPA fallback: serve index.html for any other path
        @app.get("/{path:path}")
        async def spa(path: str):
            if path.startswith("api/"):
                raise HTTPException(status_code=404)
            return FileResponse(os.path.join(static_dir, "index.html"))

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        return JSONResponse(
            status_code=500,
            content={
                "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}
            },
        )

    return app


app = create_app()
