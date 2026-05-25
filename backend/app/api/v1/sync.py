from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.external import ExternalConnection
from app.models.user import User
from app.services.sync import engine

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
    try:
        sync_log = await engine.run_sync(db, connection_id)
        return {
            "id": sync_log.id,
            "status": sync_log.status,
            "issues_processed": sync_log.issues_processed,
            "issues_created": sync_log.issues_created,
            "issues_updated": sync_log.issues_updated,
            "errors": sync_log.errors,
            "started_at": sync_log.started_at,
            "completed_at": sync_log.completed_at,
        }
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/connections/{connection_id}/logs")
async def get_sync_logs(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    logs = await engine.get_sync_logs(db, connection_id)
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
