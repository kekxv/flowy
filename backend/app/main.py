import uuid
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, inspect, select, text

# Ensure all models are loaded for SQLAlchemy mapper configuration
import app.models  # noqa: E402, F401

from app.api.v1.router import api_router
from app.database import async_session, engine, Base
from app.services.sync_service import sync_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Auto-apply migrations if fresh database
    async with engine.begin() as conn:
        has_tables = await conn.run_sync(lambda c: inspect(c).has_table("users"))
        if not has_tables:
            await conn.run_sync(Base.metadata.create_all)
            await conn.run_sync(lambda c: c.execute(
                text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY)")
            ))
            versions = [
                "972e94b14d0d", "2a561e160fc0", "79b188889e30", "a15a1fa9a7c3",
                "00990fcb887b", "df200ec12a76", "01731fcd0b00", "4692ab361441",
                "manual_fix_assignee_pk", "e001", "e002", "e003",
            ]
            for v in versions:
                await conn.run_sync(lambda c, v=v: c.execute(
                    text("INSERT OR IGNORE INTO alembic_version (version_num) VALUES (:v)"), {"v": v}
                ))

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
            pass

    await sync_service.start()
    yield
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
    if os.path.isdir(static_dir):
        # Mount static assets first
        app.mount("/assets", StaticFiles(directory=os.path.join(static_dir, "assets")), name="assets")
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
            content={"error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred"}},
        )

    @app.get("/api/v1/health")
    async def health_check():
        return {"status": "ok"}

    return app


app = create_app()
