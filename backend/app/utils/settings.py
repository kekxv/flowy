import logging

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.settings import AppSetting

logger = logging.getLogger("uvicorn")


async def get_frontend_url(db: AsyncSession) -> str:
    """Get frontend URL from DB settings, falling back to config."""
    row = await db.get(AppSetting, "frontend_url")
    return (row.value if row and row.value else settings.frontend_url).rstrip("/")
