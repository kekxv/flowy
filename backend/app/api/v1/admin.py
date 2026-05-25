from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.external import AuditLog, ExternalConnection, SyncLog
from app.models.issue import Issue
from app.models.user import User

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    user_count = await db.execute(select(func.count(User.id)))
    issue_count = await db.execute(select(func.count(Issue.id)))
    open_count = await db.execute(
        select(func.count(Issue.id)).where(Issue.status == "open")
    )
    closed_count = await db.execute(
        select(func.count(Issue.id)).where(Issue.status.in_(["closed", "resolved"]))
    )
    conn_count = await db.execute(select(func.count(ExternalConnection.id)))

    return {
        "users": user_count.scalar() or 0,
        "issues": issue_count.scalar() or 0,
        "open_issues": open_count.scalar() or 0,
        "closed_issues": closed_count.scalar() or 0,
        "connections": conn_count.scalar() or 0,
    }


@router.get("/audit-log")
async def get_audit_log(
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    total_result = await db.execute(select(func.count(AuditLog.id)))
    total = total_result.scalar() or 0

    result = await db.execute(
        select(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )

    return {
        "data": [
            {
                "id": l.id,
                "user_id": l.user_id,
                "action": l.action,
                "resource_type": l.resource_type,
                "resource_id": l.resource_id,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": l.created_at,
            }
            for l in result.scalars().all()
        ],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }
