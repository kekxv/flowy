import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.notification import (
    NotificationChannel,
    NotificationLog,
    NotificationRule,
)
from app.models.user import User
from app.services.notifications import get_channel, CHANNEL_REGISTRY

router = APIRouter(prefix="/notifications", tags=["notifications"])


EVENT_TYPES = [
    {"key": "issue.created", "label": "Issue Created", "label_zh": "问题创建"},
    {"key": "issue.updated", "label": "Issue Updated", "label_zh": "问题更新"},
    {"key": "issue.commented", "label": "Comment Added", "label_zh": "评论添加"},
    {"key": "issue.closed", "label": "Issue Closed", "label_zh": "问题关闭"},
    {"key": "milestone.created", "label": "Milestone Created", "label_zh": "里程碑创建"},
    {"key": "milestone.published", "label": "Milestone Published", "label_zh": "里程碑发布"},
    {"key": "milestone.closed", "label": "Milestone Closed", "label_zh": "里程碑关闭"},
    {"key": "milestone.reopened", "label": "Milestone Reopened", "label_zh": "里程碑重新打开"},
    {"key": "timer.started", "label": "Timer Started", "label_zh": "开始计时"},
    {"key": "timer.stopped", "label": "Timer Stopped", "label_zh": "停止计时"},
    {"key": "external_link.updated", "label": "External Link Updated", "label_zh": "外部关联更新"},
    {"key": "sync.completed", "label": "Sync Completed", "label_zh": "同步完成"},
    {"key": "sync.failed", "label": "Sync Failed", "label_zh": "同步失败"},
    {"key": "external.connected", "label": "External Connection Added", "label_zh": "外部连接添加"},
    {"key": "external.disconnected", "label": "External Connection Removed", "label_zh": "外部连接移除"},
]


# Channels

@router.get("/channels")
async def list_channels(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(NotificationChannel).where(NotificationChannel.created_by == user.id)
    )
    channels = result.scalars().all()
    return [
        {
            "id": c.id,
            "name": c.name,
            "channel_type": c.channel_type,
            "config": c.config_dict,
            "is_active": c.is_active,
            "created_at": c.created_at,
        }
        for c in channels
    ]


@router.post("/channels", status_code=status.HTTP_201_CREATED)
async def create_channel(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    required = {"name", "channel_type", "config"}
    if not required.issubset(data.keys()):
        raise HTTPException(status_code=422, detail="Missing fields: name, channel_type, config")

    if data["channel_type"] not in CHANNEL_REGISTRY:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown channel_type. Available: {', '.join(CHANNEL_REGISTRY.keys())}",
        )

    channel = NotificationChannel(
        id=str(uuid.uuid4()),
        name=data["name"],
        channel_type=data["channel_type"],
        config=json.dumps(data["config"]),
        created_by=user.id,
    )
    db.add(channel)
    await db.commit()
    await db.refresh(channel)
    return {
        "id": channel.id,
        "name": channel.name,
        "channel_type": channel.channel_type,
        "config": channel.config_dict,
        "is_active": channel.is_active,
    }


@router.post("/channels/{channel_id}/test")
async def test_channel(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    channel = await db.get(NotificationChannel, channel_id)
    if not channel or channel.created_by != user.id:
        raise HTTPException(status_code=404, detail="Channel not found")
    try:
        impl = get_channel(channel.channel_type)
        ok = await impl.validate_config(channel.config_dict)
        return {"ok": ok}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.put("/channels/{channel_id}")
async def update_channel(
    channel_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    channel = await db.get(NotificationChannel, channel_id)
    if not channel or channel.created_by != user.id:
        raise HTTPException(status_code=404, detail="Channel not found")

    if "name" in data:
        channel.name = data["name"]
    if "config" in data:
        channel.config = json.dumps(data["config"])
    if "is_active" in data:
        channel.is_active = data["is_active"]
    await db.commit()
    await db.refresh(channel)
    return {
        "id": channel.id,
        "name": channel.name,
        "channel_type": channel.channel_type,
        "config": channel.config_dict,
        "is_active": channel.is_active,
    }


@router.delete("/channels/{channel_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_channel(
    channel_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    channel = await db.get(NotificationChannel, channel_id)
    if not channel or channel.created_by != user.id:
        raise HTTPException(status_code=404, detail="Channel not found")
    await db.delete(channel)
    await db.commit()


# Rules

@router.get("/rules")
async def list_rules(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(NotificationRule).where(NotificationRule.created_by == user.id)
    )
    rules = result.scalars().all()
    return [
        {
            "id": r.id,
            "channel_id": r.channel_id,
            "event_type": r.event_type,
            "name": r.name,
            "filters": json.loads(r.filters) if r.filters else {},
            "is_active": r.is_active,
        }
        for r in rules
    ]


@router.post("/rules", status_code=status.HTTP_201_CREATED)
async def create_rule(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    required = {"channel_id", "event_type"}
    if not required.issubset(data.keys()):
        raise HTTPException(status_code=422, detail="Missing fields: channel_id, event_type")

    # Support comma-separated multi-event
    events = [e.strip() for e in data["event_type"].split(",") if e.strip()]
    valid_events = {e["key"] for e in EVENT_TYPES}
    for ev in events:
        if ev not in valid_events:
            raise HTTPException(status_code=422, detail=f"Invalid event_type: {ev}")

    rule = NotificationRule(
        id=str(uuid.uuid4()),
        channel_id=data["channel_id"],
        event_type=",".join(events),
        name=data.get("name", ""),
        filters=json.dumps(data.get("filters", {})),
        created_by=user.id,
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "channel_id": rule.channel_id,
        "event_type": rule.event_type,
        "name": rule.name,
        "filters": json.loads(rule.filters) if rule.filters else {},
        "is_active": rule.is_active,
    }


@router.put("/rules/{rule_id}")
async def update_rule(
    rule_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rule = await db.get(NotificationRule, rule_id)
    if not rule or rule.created_by != user.id:
        raise HTTPException(status_code=404, detail="Rule not found")

    if "is_active" in data:
        rule.is_active = data["is_active"]
    if "name" in data:
        rule.name = data["name"]
    if "event_type" in data:
        events = [e.strip() for e in data["event_type"].split(",") if e.strip()]
        valid_events = {e["key"] for e in EVENT_TYPES}
        for ev in events:
            if ev not in valid_events:
                raise HTTPException(status_code=422, detail=f"Invalid event_type: {ev}")
        rule.event_type = ",".join(events)
    if "filters" in data:
        rule.filters = json.dumps(data["filters"])
    await db.commit()
    await db.refresh(rule)
    return {
        "id": rule.id,
        "channel_id": rule.channel_id,
        "event_type": rule.event_type,
        "name": rule.name,
        "filters": json.loads(rule.filters) if rule.filters else {},
        "is_active": rule.is_active,
    }


@router.delete("/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    rule_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rule = await db.get(NotificationRule, rule_id)
    if not rule or rule.created_by != user.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()


# Logs

@router.get("/logs")
async def list_logs(
    channel_id: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = select(NotificationLog)
    count_q = select(func.count(NotificationLog.id))

    if channel_id:
        query = query.where(NotificationLog.channel_id == channel_id)
        count_q = count_q.where(NotificationLog.channel_id == channel_id)

    total_r = await db.execute(count_q)
    total = total_r.scalar() or 0

    result = await db.execute(
        query.order_by(NotificationLog.created_at.desc())
        .offset((page - 1) * per_page)
        .limit(per_page)
    )
    logs = result.scalars().all()

    return {
        "data": [
            {
                "id": l.id,
                "channel_id": l.channel_id,
                "rule_id": l.rule_id,
                "event_type": l.event_type,
                "status": l.status,
                "message": l.message,
                "error": l.error,
                "created_at": l.created_at,
            }
            for l in logs
        ],
        "meta": {"page": page, "per_page": per_page, "total": total},
    }


# Channel types info (for frontend config_schema rendering)

@router.get("/channel-types")
async def list_channel_types():
    return {
        name: {
            "config_schema": cls.config_schema(),
        }
        for name, cls in CHANNEL_REGISTRY.items()
    }


@router.get("/event-types")
async def list_event_types():
    return EVENT_TYPES
