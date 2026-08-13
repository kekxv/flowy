from fastapi import APIRouter, Depends, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_admin
from app.models.settings import AppSetting
from app.models.user import User

router = APIRouter(prefix="/system/settings", tags=["system_settings"])


@router.get("")
async def get_settings(
    req: Request, db: AsyncSession = Depends(get_db), _admin: User = Depends(require_admin)
):
    result = await db.execute(select(AppSetting))
    safe_keys = {
        "frontend_url",
        "github_client_id",
        "gitea_client_id",
        "gitea_instance_url",
        "registration_enabled",
        "wiki_upload_max_mb",
        "theme_primary_color",
    }
    data = {s.key: s.value for s in result.scalars().all() if s.key in safe_keys}
    origin = req.headers.get("origin", str(req.base_url).rstrip("/"))
    data["_oauth_callback_url"] = origin + "/api/v1/external/connections/oauth/callback"
    return data


@router.put("")
async def save_settings(
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    allowed = {
        "frontend_url",
        "github_client_id",
        "github_client_secret",
        "gitea_client_id",
        "gitea_client_secret",
        "gitea_instance_url",
        "registration_enabled",
        "wiki_upload_max_mb",
        "theme_primary_color",
    }
    for key, value in data.items():
        if key not in allowed:
            continue
        existing = await db.get(AppSetting, key)
        if existing:
            existing.value = value
        else:
            db.add(AppSetting(key=key, value=value))
    await db.commit()
    return {"ok": True}
