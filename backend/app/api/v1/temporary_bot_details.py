from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.temporary_bot_detail_service import TemporaryBotDetailService

public_router = APIRouter(prefix="/public/bot-details", tags=["public-bot-details"])
service = TemporaryBotDetailService()


@public_router.get("/{token}")
async def get_public_bot_detail(token: str, response: Response, db: AsyncSession = Depends(get_db)):
    detail = await service.get_active(db, token)
    if not detail:
        raise HTTPException(410, "This link is expired")
    response.headers["Cache-Control"] = "no-store"
    return {
        "title": detail.title,
        "summary": detail.summary,
        "content": detail.content,
        "expires_at": detail.expires_at,
        "server_time": datetime.now(UTC).isoformat(),
    }
