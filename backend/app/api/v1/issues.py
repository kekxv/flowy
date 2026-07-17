import logging
import os
import re
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.dispatcher import dispatch
from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Comment, Issue, issue_assignees
from app.models.tracking import IssueAssigneeLog, TimeEntry
from app.models.user import User
from app.schemas.common import PaginationParams, paginated_response
from app.schemas.issue import (
    AssigneeResponse,
    IssueCreate,
    IssueFilter,
    IssueUpdate,
)
from app.services import issue_service
from app.services.notifications.base import NotificationEvent
from app.utils.settings import get_frontend_url

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/issues", tags=["issues"])


async def _build_assignees(db: AsyncSession, issue_id: str) -> list[AssigneeResponse]:
    """Fetch assignees with roles from the association table."""
    result = await db.execute(
        select(issue_assignees.c.user_id, issue_assignees.c.role).where(
            issue_assignees.c.issue_id == issue_id
        )
    )
    rows = result.all()
    if not rows:
        return []

    # Batch fetch all users at once to avoid N+1
    user_ids = [r.user_id for r in rows if r.user_id]
    users_map: dict[str, User] = {}
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u for u in users_result.scalars().all()}

    return [
        AssigneeResponse(
            id=users_map[user_id].id if user_id in users_map else user_id,
            username=users_map[user_id].username if user_id in users_map else "",
            email=users_map[user_id].email if user_id in users_map else "",
            display_name=users_map[user_id].display_name if user_id in users_map else "",
            role=role or "member",
            avatar_url=users_map[user_id].avatar_url if user_id in users_map else None,
        )
        for user_id, role in rows
    ]


@router.get("")
async def list_issues(
    status: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    assignee_id: str | None = Query(default=None),
    reporter_id: str | None = Query(default=None),
    label_id: str | None = Query(default=None),
    q: str | None = Query(default=None),
    issue_type: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    per_page: int = Query(default=20, ge=1, le=100),
    sort: str = Query(default="status_priority"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    pagination = PaginationParams(page=page, per_page=per_page, sort=sort)
    filters = IssueFilter(
        status=status,
        priority=priority,
        assignee_id=assignee_id,
        reporter_id=reporter_id,
        label_id=label_id,
        q=q,
        issue_type=issue_type,
    )
    issues, total = await issue_service.list_issues(db, pagination, filters)
    data = []
    for i in issues:
        d = {
            "id": i.id,
            "title": i.title,
            "description": i.description,
            "issue_type": i.issue_type,
            "status": i.status,
            "priority": i.priority,
            "reporter": {
                "id": i.reporter.id,
                "username": i.reporter.username,
                "display_name": i.reporter.display_name,
                "avatar_url": i.reporter.avatar_url,
            }
            if i.reporter
            else None,
            "labels": [
                {"id": l.id, "name": l.name, "color": l.color, "description": l.description}
                for l in (i.labels or [])
            ],
            "milestone_ids": [m.id for m in (i.milestones or [])],
            "created_at": i.created_at,
            "updated_at": i.updated_at,
            "closed_at": i.closed_at,
            "assignees": [a.model_dump() for a in await _build_assignees(db, i.id)],
        }
        data.append(d)
    return paginated_response(data, total, pagination)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_issue(
    data: IssueCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    issue = await issue_service.create_issue(db, data, user.id)
    return _issue_detail(issue, await _build_assignees(db, issue.id))


@router.get("/{issue_id}")
async def get_issue(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    issue = await issue_service.get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    return _issue_detail(issue, await _build_assignees(db, issue.id))


def _is_assignee_only(data: IssueUpdate) -> bool:
    """Check if the update only changes assignees and/or milestones (no restricted fields)."""
    return (
        data.title is None
        and data.description is None
        and data.status is None
        and data.priority is None
        and data.label_ids is None
    )


@router.put("/{issue_id}")
async def update_issue(
    issue_id: str,
    data: IssueUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):

    issue = await issue_service.get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    # Permission check
    is_admin = user.role == "admin"
    is_reporter = issue.reporter_id == user.id
    assignee_roles = {a.role for a in (issue.assignees or []) if a.id == user.id}
    is_lead = "project_lead" in assignee_roles
    is_feature_owner = issue.issue_type == "feature" and len(assignee_roles) > 0

    # Admin, project_lead, and feature owner can do anything
    if not is_admin and not is_lead and not is_feature_owner:
        # Allow assignee/milestone-only changes for everyone (claim/release/link milestone)
        if (data.assignees is not None or data.milestone_ids is not None) and _is_assignee_only(
            data
        ):
            safe = IssueUpdate(assignees=data.assignees, milestone_ids=data.milestone_ids)
            issue = await issue_service.update_issue(db, issue, safe, changed_by=user.id)
            return _issue_detail(issue, await _build_assignees(db, issue.id))
        # Reporter can change status to resolved/cancelled
        if is_reporter and data.status is not None and data.status in ("resolved", "cancelled"):
            safe_data = IssueUpdate(status=data.status)
            issue = await issue_service.update_issue(db, issue, safe_data, changed_by=user.id)
            return _issue_detail(issue, await _build_assignees(db, issue.id))
        # Others cannot modify
        raise HTTPException(
            status_code=403, detail="You do not have permission to modify this issue"
        )

    issue = await issue_service.update_issue(db, issue, data, changed_by=user.id)
    return _issue_detail(issue, await _build_assignees(db, issue.id))


def _issue_detail(issue, assignees: list):
    return {
        "id": issue.id,
        "title": issue.title,
        "description": issue.description,
        "issue_type": issue.issue_type,
        "status": issue.status,
        "priority": issue.priority,
        "reporter": {
            "id": issue.reporter.id,
            "username": issue.reporter.username,
            "display_name": issue.reporter.display_name,
            "avatar_url": issue.reporter.avatar_url,
        }
        if issue.reporter
        else None,
        "assignees": [a.model_dump() if hasattr(a, "model_dump") else a for a in assignees],
        "labels": [
            {
                "id": l.id,
                "name": l.name,
                "color": l.color,
                "description": l.description,
                "created_at": l.created_at,
            }
            for l in (issue.labels or [])
        ],
        "milestone_ids": [m.id for m in (issue.milestones or [])],
        "created_at": issue.created_at,
        "updated_at": issue.updated_at,
        "closed_at": issue.closed_at,
        "comments": [
            _comment_dict(c) for c in (issue.comments or []) if not getattr(c, "parent_id", None)
        ],
        "external_links": [],
    }


# Comments


def _comment_dict(c) -> dict:
    """Serialize a comment with replies and status info."""
    replies = getattr(c, "replies", [])
    return {
        "id": c.id,
        "issue_id": c.issue_id,
        "parent_id": getattr(c, "parent_id", None),
        "author": {
            "id": c.author.id,
            "username": c.author.username,
            "display_name": c.author.display_name,
        }
        if c.author
        else None,
        "body": c.body,
        "status": getattr(c, "status", "valid"),
        "status_changed_by": c.status_changed_by,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "replies": [_comment_dict(r) for r in replies] if replies else [],
    }


@router.get("/{issue_id}/comments")
async def list_comments(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    issue = await issue_service.get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")

    async def load_replies(comment):
        result = await db.execute(
            select(Comment).where(Comment.parent_id == comment.id).order_by(Comment.created_at)
        )
        children = list(result.scalars().all())
        for child in children:
            child.replies = await load_replies(child)
        return children

    comments = []
    for c in issue.comments or []:
        if not getattr(c, "parent_id", None):
            c.replies = await load_replies(c)
            comments.append(_comment_dict(c))
    return comments


@router.post("/{issue_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_comment(
    issue_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.issue import Comment

    if not data.get("body"):
        raise HTTPException(status_code=422, detail="body is required")
    issue = await issue_service.get_issue(db, issue_id)
    if not issue:
        raise HTTPException(status_code=404, detail="Issue not found")
    parent_id = data.get("parent_id")
    comment = Comment(
        id=str(uuid.uuid4()),
        issue_id=issue_id,
        author_id=user.id,
        body=data["body"],
        parent_id=parent_id,
    )
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    # Dispatch notification
    try:
        frontend_url = await get_frontend_url(db)
        await dispatch(
            db,
            NotificationEvent(
                event_type="issue.commented",
                title=f"Comment on #{issue.id[:8]}: {issue.title}",
                summary=data["body"][:200],
                detail_url=f"{frontend_url}/issues/{issue_id}",
                actor_name=user.display_name or user.username,
                resource_type="comment",
                resource_id=comment.id,
            ),
        )
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return _comment_dict(comment)


@router.put("/{issue_id}/comments/{comment_id}")
async def edit_comment(
    issue_id: str,
    comment_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.issue import Comment

    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment or comment.issue_id != issue_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot edit this comment")
    if "body" in data:
        comment.body = data["body"]
    await db.commit()
    await db.refresh(comment)
    return _comment_dict(comment)


@router.patch("/{issue_id}/comments/{comment_id}/status")
async def set_comment_status(
    issue_id: str,
    comment_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Set comment status. Only project_lead on this issue can change status."""
    from app.models.issue import Comment

    # Check user is project_lead on this issue
    role_result = await db.execute(
        select(issue_assignees.c.role).where(
            issue_assignees.c.issue_id == issue_id,
            issue_assignees.c.user_id == user.id,
            issue_assignees.c.role == "project_lead",
        )
    )
    is_lead = role_result.first() is not None
    if not is_lead and user.role != "admin":
        raise HTTPException(status_code=403, detail="Only project lead can change comment status")

    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment or comment.issue_id != issue_id:
        raise HTTPException(status_code=404, detail="Comment not found")

    valid_statuses = ["valid", "invalid", "outdated", "duplicate", "resolved"]
    new_status = data.get("status", "valid")
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=422, detail=f"Invalid status. Must be one of: {valid_statuses}"
        )

    comment.status = new_status
    comment.status_changed_by = user.id
    await db.commit()
    await db.refresh(comment)
    return _comment_dict(comment)


@router.delete("/{issue_id}/comments/{comment_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_comment(
    issue_id: str,
    comment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    from app.models.issue import Comment

    result = await db.execute(select(Comment).where(Comment.id == comment_id))
    comment = result.scalar_one_or_none()
    if not comment or comment.issue_id != issue_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    if comment.author_id != user.id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Cannot delete this comment")
    # Clean up attachment files from disk
    if comment.body:
        attachments_dir = os.path.join(os.environ.get("STATIC_DIR", "static"), "bot_attachments")
        filenames = set(re.findall(r'attachment:([a-f0-9]+\.\w+)', comment.body))
        for fn in filenames:
            fp = os.path.join(attachments_dir, fn)
            if os.path.exists(fp):
                os.remove(fp)
    await db.delete(comment)
    await db.commit()


# Timer endpoints


async def _check_issue_permission(issue_id: str, user: User, db: AsyncSession):
    """Check if user can modify the issue. Raises 403 if not."""
    if user.role == "admin":
        return
    # Check if project_lead
    result = await db.execute(
        select(issue_assignees.c.role).where(
            issue_assignees.c.issue_id == issue_id,
            issue_assignees.c.user_id == user.id,
            issue_assignees.c.role == "project_lead",
        )
    )
    if result.first() is not None:
        return
    # Check if feature owner (any assignee on a feature)
    from app.models.issue import Issue

    issue = await db.get(Issue, issue_id)
    if issue and issue.issue_type == "feature":
        roles = await db.execute(
            select(issue_assignees.c.role).where(
                issue_assignees.c.issue_id == issue_id,
                issue_assignees.c.user_id == user.id,
            )
        )
        if roles.first() is not None:
            return
    raise HTTPException(
        status_code=403, detail="Only admin, project_lead, or feature owner can perform this action"
    )


@router.post("/{issue_id}/timer/start")
async def start_timer(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_issue_permission(issue_id, user, db)
    # Check no other timer is running for this user
    existing = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user.id,
            TimeEntry.is_running == True,  # noqa: E712
        )
    )
    for running in existing.scalars().all():
        running.is_running = False
        running.stopped_at = datetime.now().isoformat()

    entry = TimeEntry(
        id=str(uuid.uuid4()),
        user_id=user.id,
        issue_id=issue_id,
        started_at=datetime.now().isoformat(),
        is_running=True,
    )
    db.add(entry)
    db.add(
        IssueAssigneeLog(
            id=str(uuid.uuid4()),
            issue_id=issue_id,
            user_id=user.id,
            role="",
            action="timer_started",
            changed_by=user.id,
        )
    )
    await db.commit()
    await db.refresh(entry)
    # Dispatch notification
    try:
        issue = await db.get(Issue, issue_id)
        if issue:
            frontend_url = await get_frontend_url(db)
            await dispatch(
                db,
                NotificationEvent(
                    event_type="timer.started",
                    title=f"Timer started: {issue.title}",
                    summary=f"{user.display_name or user.username} started tracking time",
                    detail_url=f"{frontend_url}/issues/{issue_id}",
                    actor_name=user.display_name or user.username,
                    resource_type="timer",
                    resource_id=entry.id,
                ),
            )
            await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return {
        "id": entry.id,
        "issue_id": entry.issue_id,
        "started_at": entry.started_at,
        "is_running": True,
    }


@router.post("/{issue_id}/timer/stop")
async def stop_timer(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_issue_permission(issue_id, user, db)
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user.id,
            TimeEntry.issue_id == issue_id,
            TimeEntry.is_running == True,  # noqa: E712
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="No running timer for this issue")

    now = datetime.now()
    elapsed = (now - datetime.fromisoformat(entry.started_at)).total_seconds() * 1000
    entry.is_running = False
    entry.stopped_at = now.isoformat()
    entry.duration_ms += int(elapsed)
    db.add(
        IssueAssigneeLog(
            id=str(uuid.uuid4()),
            issue_id=issue_id,
            user_id=user.id,
            role=f"{int(elapsed / 60000)}m",
            action="timer_stopped",
            changed_by=user.id,
        )
    )
    await db.commit()
    await db.refresh(entry)
    # Dispatch notification
    try:
        issue = await db.get(Issue, issue_id)
        if issue:
            mins = int(elapsed / 60000)
            frontend_url = await get_frontend_url(db)
            await dispatch(
                db,
                NotificationEvent(
                    event_type="timer.stopped",
                    title=f"Timer stopped: {issue.title}",
                    summary=f"{user.display_name or user.username} tracked {mins}min",
                    detail_url=f"{frontend_url}/issues/{issue_id}",
                    actor_name=user.display_name or user.username,
                    resource_type="timer",
                    resource_id=entry.id,
                ),
            )
            await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return {"id": entry.id, "duration_ms": entry.duration_ms, "is_running": False}


@router.get("/{issue_id}/timer/status")
async def timer_status(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user.id,
            TimeEntry.issue_id == issue_id,
            TimeEntry.is_running == True,  # noqa: E712
        )
    )
    entry = result.scalar_one_or_none()
    if not entry:
        return {"is_running": False, "entry_id": None, "started_at": None, "duration_ms": 0}
    elapsed = (datetime.now() - datetime.fromisoformat(entry.started_at)).total_seconds() * 1000
    return {
        "is_running": True,
        "entry_id": entry.id,
        "started_at": entry.started_at,
        "duration_ms": entry.duration_ms + int(elapsed),
    }


@router.get("/{issue_id}/time-entries")
async def list_time_entries(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TimeEntry)
        .where(TimeEntry.issue_id == issue_id)
        .order_by(TimeEntry.started_at.desc())
        .limit(50)
    )
    entries = list(result.scalars().all())
    return [
        {
            "id": e.id,
            "user_id": e.user_id,
            "user_name": e.user.display_name or e.user.username,
            "started_at": e.started_at,
            "stopped_at": e.stopped_at,
            "duration_ms": e.duration_ms,
            "is_running": e.is_running,
        }
        for e in entries
    ]


# Assignee log endpoint


@router.get("/{issue_id}/assignee-logs")
async def assignee_logs(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(IssueAssigneeLog)
        .where(IssueAssigneeLog.issue_id == issue_id)
        .order_by(IssueAssigneeLog.created_at.desc())
        .limit(50)
    )
    logs = list(result.scalars().all())

    # Batch fetch all users at once to avoid N+1
    all_user_ids: set[str] = set()
    for l in logs:
        if l.user_id:
            all_user_ids.add(l.user_id)
        if l.changed_by:
            all_user_ids.add(l.changed_by)
    users_map: dict[str, User] = {}
    if all_user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(list(all_user_ids))))
        users_map = {u.id: u for u in users_result.scalars().all()}

    data = []
    for l in logs:
        u = users_map.get(l.user_id) if l.user_id else None
        cb = users_map.get(l.changed_by) if l.changed_by else None
        action_label = l.action
        if l.action == "status_changed" or l.action == "priority_changed":
            action_label = f"{l.role}"
        elif l.action == "label_added":
            action_label = f"+{l.role}"
        elif l.action == "label_removed":
            action_label = f"−{l.role}"
        elif l.action == "milestone_added":
            action_label = f"+{l.role}"
        elif l.action == "timer_started":
            action_label = "▶ started"
        elif l.action == "timer_stopped":
            action_label = f"⏹ {l.role}"
        elif l.action == "milestone_removed":
            action_label = f"−{l.role}"
        elif l.action == "added":
            action_label = l.role  # use role directly, shown with user_name
        elif l.action == "removed":
            action_label = l.role
        data.append(
            {
                "id": l.id,
                "user_id": l.user_id,
                "user_name": u.display_name or u.username if u else "Unknown",
                "role": l.role,
                "action": action_label,
                "raw_action": l.action,
                "changed_by_name": cb.display_name or cb.username if cb else "Unknown",
                "created_at": l.created_at,
            }
        )
    return data
