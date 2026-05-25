import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Ensure all models are loaded for SQLAlchemy mapper configuration
import app.models  # noqa: E402, F401

from app.api.v1.router import api_router
from app.services.sync_service import sync_service


@asynccontextmanager
async def lifespan(_app: FastAPI):
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
