from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Issue, issue_assignees, issue_milestones_table
from app.models.tracking import Milestone, TimeEntry
from app.models.user import User

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("")
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # My assigned issues (active) — use subquery to deduplicate
    sub = (
        select(issue_assignees.c.issue_id)
        .where(
            issue_assignees.c.user_id == user.id,
        )
        .distinct()
    ).subquery()

    assigned = await db.execute(
        select(Issue)
        .join(sub, Issue.id == sub.c.issue_id)
        .where(Issue.status.in_(["open", "in_progress"]))
        .order_by(Issue.updated_at.desc())
        .limit(10)
    )
    my_issues = []
    for i in assigned.scalars().all():
        # Fetch ALL roles the current user has on this issue
        res = await db.execute(
            select(issue_assignees.c.role).where(
                issue_assignees.c.issue_id == i.id,
                issue_assignees.c.user_id == user.id,
            )
        )
        roles = [r[0] for r in res.all()]
        my_issues.append(
            {
                "id": i.id,
                "title": i.title,
                "status": i.status,
                "priority": i.priority,
                "issue_type": i.issue_type,
                "created_at": i.created_at,
                "roles": roles,
            }
        )

    # Pending issues (open/in_progress, no assignee)
    pending = await db.execute(
        select(Issue)
        .outerjoin(issue_assignees, Issue.id == issue_assignees.c.issue_id)
        .where(
            Issue.status.in_(["open", "in_progress"]),
            issue_assignees.c.issue_id == None,  # noqa: E711
        )
        .order_by(Issue.created_at.desc())
        .limit(10)
    )
    pending_issues = []
    for i in pending.unique().scalars().all():
        pending_issues.append(
            {
                "id": i.id,
                "title": i.title,
                "status": i.status,
                "priority": i.priority,
                "issue_type": i.issue_type,
                "created_at": i.created_at,
            }
        )

    # Active timers
    timer_result = await db.execute(
        select(TimeEntry).where(
            TimeEntry.user_id == user.id,
            TimeEntry.is_running == True,  # noqa: E712
        )
    )
    active_timers = []
    for t in timer_result.scalars().all():
        issue = await db.get(Issue, t.issue_id)
        active_timers.append(
            {
                "entry_id": t.id,
                "issue_id": t.issue_id,
                "issue_title": issue.title if issue else "Unknown",
                "started_at": t.started_at,
                "duration_ms": t.duration_ms,
            }
        )

    # Stats
    total_issues = (await db.execute(select(func.count(Issue.id)))).scalar() or 0
    open_issues = (
        await db.execute(
            select(func.count(Issue.id)).where(Issue.status.in_(["open", "in_progress"]))
        )
    ).scalar() or 0
    closed_issues = (
        await db.execute(
            select(func.count(Issue.id)).where(Issue.status.in_(["closed", "resolved"]))
        )
    ).scalar() or 0

    # My reported count (deduplicated)
    my_reported = (
        await db.execute(select(func.count(Issue.id)).where(Issue.reporter_id == user.id))
    ).scalar() or 0

    # Active milestones
    ml_result = await db.execute(
        select(Milestone)
        .where(Milestone.status.in_(["open", "published"]))
        .order_by(Milestone.created_at.desc())
        .limit(5)
    )
    milestones_data = []
    for m in ml_result.scalars().all():
        t = (
            await db.execute(
                select(func.count()).where(issue_milestones_table.c.milestone_id == m.id)
            )
        ).scalar() or 0
        c = (
            await db.execute(
                select(func.count()).where(
                    issue_milestones_table.c.milestone_id == m.id,
                    Issue.id == issue_milestones_table.c.issue_id,
                    Issue.status.in_(["closed", "resolved"]),
                )
            )
        ).scalar() or 0
        milestones_data.append(
            {
                "id": m.id,
                "name": m.name,
                "status": m.status,
                "due_date": m.due_date,
                "total": t,
                "closed": c,
                "progress": round((c / t) * 100) if t > 0 else 0,
            }
        )

    return {
        "my_issues": my_issues,
        "pending_issues": pending_issues,
        "active_timers": active_timers,
        "stats": {
            "total_issues": total_issues,
            "open_issues": open_issues,
            "closed_issues": closed_issues,
            "my_reported": my_reported,
        },
        "milestones": milestones_data,
    }
