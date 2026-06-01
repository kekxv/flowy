from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.external import ExternalConnection, SyncLog
from app.models.user import User
from app.services.sync_service import sync_service

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/connections/{connection_id}")
async def trigger_sync(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    await sync_service.sync_all()
    return {"status": "completed", "message": "Sync triggered"}


@router.get("/connections/{connection_id}/logs")
async def get_sync_logs(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.connection_id == connection_id)
        .order_by(SyncLog.started_at.desc())
        .limit(10)
    )
    logs = result.scalars().all()
    return [
        {
            "id": l.id,
            "status": l.status,
            "direction": l.direction,
            "issues_processed": l.issues_processed,
            "issues_created": l.issues_created,
            "issues_updated": l.issues_updated,
            "errors": l.errors,
            "started_at": l.started_at,
            "completed_at": l.completed_at,
        }
        for l in logs
    ]
