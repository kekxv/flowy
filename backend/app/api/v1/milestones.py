import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dispatcher import dispatch
from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Issue, issue_milestones_table
from app.models.tracking import Milestone
from app.models.user import User
from app.schemas.issue import MilestoneCreate, MilestoneUpdate
from app.services.notifications.base import NotificationEvent
from app.utils.settings import get_frontend_url

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/milestones", tags=["milestones"])


@router.get("")
async def list_milestones(
    status_filter: str | None = None,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = select(Milestone)
    if status_filter:
        query = query.where(Milestone.status == status_filter)
    result = await db.execute(query.order_by(Milestone.created_at.desc()))
    milestones = list(result.scalars().all())

    # Batch-fetch issue counts per milestone in a single aggregate query
    stats_map: dict[str, tuple[int, int]] = {}
    if milestones:
        milestone_ids = [m.id for m in milestones]
        stats_query = (
            select(
                issue_milestones_table.c.milestone_id,
                func.count().label("total"),
                func.sum(
                    case(
                        (Issue.status.in_(["closed", "resolved"]), 1),
                        else_=0,
                    )
                ).label("closed"),
            )
            .join(Issue, Issue.id == issue_milestones_table.c.issue_id)
            .where(issue_milestones_table.c.milestone_id.in_(milestone_ids))
            .group_by(issue_milestones_table.c.milestone_id)
        )
        stats_result = await db.execute(stats_query)
        for row in stats_result.all():
            stats_map[row.milestone_id] = (row.total, int(row.closed or 0))

    data = []
    for m in milestones:
        total, closed = stats_map.get(m.id, (0, 0))
        progress = round((closed / total) * 100) if total > 0 else 0

        data.append(
            {
                "id": m.id,
                "name": m.name,
                "description": m.description,
                "owner_id": m.owner_id,
                "start_date": m.start_date,
                "due_date": m.due_date,
                "status": m.status,
                "total_issues": total,
                "closed_issues": closed,
                "progress": progress,
                "created_at": m.created_at,
                "updated_at": m.updated_at,
            }
        )
    return data


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_milestone(
    data: MilestoneCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    milestone = Milestone(
        id=str(uuid.uuid4()),
        name=data.name,
        description=data.description,
        start_date=data.start_date,
        due_date=data.due_date,
        owner_id=user.id,
    )
    db.add(milestone)
    await db.commit()
    await db.refresh(milestone)

    # Dispatch notification
    try:
        frontend_url = await get_frontend_url(db)
        await dispatch(
            db,
            NotificationEvent(
                event_type="milestone.created",
                title=f"Milestone created: {milestone.name}",
                summary=f"Created by {user.display_name or user.username}",
                detail_url=f"{frontend_url}/milestones/{milestone.id}",
                actor_name=user.display_name or user.username,
                resource_type="milestone",
                resource_id=milestone.id,
            ),
        )
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")

    return {
        "id": milestone.id,
        "name": milestone.name,
        "description": milestone.description,
        "owner_id": milestone.owner_id,
        "start_date": milestone.start_date,
        "due_date": milestone.due_date,
        "status": milestone.status,
        "progress": 0,
        "total_issues": 0,
        "closed_issues": 0,
    }


@router.put("/{milestone_id}")
async def update_milestone(
    milestone_id: str,
    data: MilestoneUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await db.get(Milestone, milestone_id)
    if not m:
        raise HTTPException(status_code=404, detail="Milestone not found")
    # Permission: admin, owner, or creator can modify
    if user.role != "admin" and m.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the milestone owner can modify it")
    if data.owner_id is not None and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only admin can change the owner")
    old_status = m.status
    if data.name is not None:
        m.name = data.name
    if data.description is not None:
        m.description = data.description
    if data.start_date is not None:
        m.start_date = data.start_date
    if data.due_date is not None:
        m.due_date = data.due_date
    if data.status is not None:
        m.status = data.status
    if data.owner_id is not None:
        m.owner_id = data.owner_id
    await db.commit()
    await db.refresh(m)

    # Dispatch notification on status change
    try:
        new_status = data.status
        if new_status and new_status != old_status:
            event_map = {
                "published": "milestone.published",
                "closed": "milestone.closed",
                "open": "milestone.reopened",
            }
            event_type = event_map.get(new_status, "milestone.updated")
            status_labels = {"published": "已发布", "closed": "已关闭", "open": "已重新打开"}
            frontend_url = await get_frontend_url(db)
            await dispatch(
                db,
                NotificationEvent(
                    event_type=event_type,
                    title=f"Milestone: {m.name}",
                    summary=f"{status_labels.get(new_status, new_status)} by {user.display_name or user.username}",
                    detail_url=f"{frontend_url}/milestones/{m.id}",
                    actor_name=user.display_name or user.username,
                    resource_type="milestone",
                    resource_id=m.id,
                ),
            )
            await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")

    return {
        "id": m.id,
        "name": m.name,
        "description": m.description,
        "start_date": m.start_date,
        "due_date": m.due_date,
        "status": m.status,
        "owner_id": m.owner_id,
    }


@router.delete("/{milestone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_milestone(
    milestone_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    m = await db.get(Milestone, milestone_id)
    if not m:
        raise HTTPException(status_code=404)
    if user.role != "admin" and m.owner_id != user.id:
        raise HTTPException(status_code=403, detail="Only the milestone owner can delete it")
    await db.delete(m)
    await db.commit()


@router.get("/{milestone_id}/issues")
async def milestone_issues(
    milestone_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Issue)
        .join(issue_milestones_table, Issue.id == issue_milestones_table.c.issue_id)
        .where(issue_milestones_table.c.milestone_id == milestone_id)
        .order_by(Issue.created_at.desc())
    )
    issues = list(result.scalars().all())
    return [
        {
            "id": i.id,
            "title": i.title,
            "status": i.status,
            "priority": i.priority,
            "issue_type": i.issue_type,
            "start_date": i.start_date,
            "due_date": i.due_date,
            "created_at": i.created_at,
        }
        for i in issues
    ]
