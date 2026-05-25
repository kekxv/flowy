from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.settings import AppSetting
from app.models.user import User

router = APIRouter(prefix="/system/settings", tags=["system_settings"])


@router.get("")
async def get_settings(req: Request, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    result = await db.execute(select(AppSetting))
    data = {s.key: s.value for s in result.scalars().all()}
    origin = req.headers.get("origin", str(req.base_url).rstrip("/"))
    data["_oauth_callback_url"] = origin + "/profile"
    return data


@router.put("")
async def save_settings(
    data: dict,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    allowed = {"frontend_url", "github_client_id", "github_client_secret", "gitea_client_id", "gitea_client_secret", "gitea_instance_url"}
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
