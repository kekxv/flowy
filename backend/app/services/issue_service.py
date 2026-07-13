import logging
from datetime import datetime
from uuid import uuid4

from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.dispatcher import dispatch
from app.models.issue import (
    Comment,
    Issue,
    Label,
    issue_assignees,
)
from app.models.tracking import IssueAssigneeLog, Milestone
from app.models.user import User
from app.schemas.common import PaginationParams
from app.schemas.issue import IssueCreate, IssueFilter, IssueUpdate
from app.utils.settings import get_frontend_url

logger = logging.getLogger("uvicorn")
from app.services.notifications.base import NotificationEvent


async def list_issues(
    db: AsyncSession,
    pagination: PaginationParams,
    filters: IssueFilter,
) -> tuple[list[Issue], int]:
    query = select(Issue).options(
        selectinload(Issue.assignees),
        selectinload(Issue.labels),
        selectinload(Issue.milestones),
    )
    count_query = select(func.count(Issue.id))

    if filters.statuses:
        query = query.where(Issue.status.in_(filters.statuses))
        count_query = count_query.where(Issue.status.in_(filters.statuses))
    if filters.priorities:
        query = query.where(Issue.priority.in_(filters.priorities))
        count_query = count_query.where(Issue.priority.in_(filters.priorities))
    if filters.reporter_id:
        query = query.where(Issue.reporter_id == filters.reporter_id)
        count_query = count_query.where(Issue.reporter_id == filters.reporter_id)
    if filters.assignee_id:
        query = query.where(Issue.assignees.any(User.id == filters.assignee_id))
        count_query = count_query.where(Issue.assignees.any(User.id == filters.assignee_id))
    if filters.label_id:
        query = query.where(Issue.labels.any(Label.id == filters.label_id))
        count_query = count_query.where(Issue.labels.any(Label.id == filters.label_id))
    if filters.q:
        search = f"%{filters.q}%"
        query = query.where(or_(Issue.title.ilike(search), Issue.description.ilike(search)))
        count_query = count_query.where(
            or_(Issue.title.ilike(search), Issue.description.ilike(search))
        )

    if pagination.order_by == "status_priority":
        # Group statuses by workflow order:
        #   1 = 待处理 (open)
        #   2 = 进行中 (in_progress)
        #   3 = 待审核 (proposed, accepted)
        #   4 = 已解决 (resolved)
        #   5 = 已关闭 (closed)
        #   6 = 已结束 (cancelled, rejected)
        status_order = case(
            (Issue.status == "open", 1),
            (Issue.status == "in_progress", 2),
            (Issue.status.in_(["proposed", "accepted"]), 3),
            (Issue.status == "resolved", 4),
            (Issue.status == "closed", 5),
            (Issue.status.in_(["cancelled", "rejected"]), 6),
            else_=7,
        )
        if pagination.order_desc:
            query = query.order_by(status_order.desc(), Issue.created_at.desc())
        else:
            query = query.order_by(status_order.asc(), Issue.created_at.desc())
    else:
        order_col = getattr(Issue, pagination.order_by)
        query = query.order_by(order_col.desc() if pagination.order_desc else order_col.asc())

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    result = await db.execute(query.offset(pagination.offset).limit(pagination.per_page))
    return list(result.unique().scalars().all()), total


async def get_issue(db: AsyncSession, issue_id: str) -> Issue | None:
    result = await db.execute(
        select(Issue)
        .options(
            selectinload(Issue.assignees),
            selectinload(Issue.labels),
            selectinload(Issue.milestones),
            selectinload(Issue.comments).selectinload(Comment.author),
        )
        .where(Issue.id == issue_id)
    )
    return result.unique().scalar_one_or_none()


async def create_issue(db: AsyncSession, data: IssueCreate, reporter_id: str) -> Issue:
    issue = Issue(
        id=str(uuid4()),
        title=data.title,
        description=data.description,
        issue_type=data.issue_type,
        priority=data.priority,
        reporter_id=reporter_id,
    )
    # Don't set issue.assignees via relationship - we'll insert manually below
    # to include role and assigned_at columns
    if data.label_ids:
        result = await db.execute(select(Label).where(Label.id.in_(data.label_ids)))
        issue.labels = list(result.scalars().all())
    if data.milestone_ids:
        result = await db.execute(select(Milestone).where(Milestone.id.in_(data.milestone_ids)))
        issue.milestones = list(result.scalars().all())

    db.add(issue)
    await db.flush()

    # Insert assignees with roles directly via association table
    if data.assignees:
        for a in data.assignees:
            await db.execute(
                issue_assignees.insert().values(
                    issue_id=issue.id,
                    user_id=a.user_id,
                    role=a.role,
                    assigned_at=datetime.now().isoformat(),
                )
            )
            db.add(
                IssueAssigneeLog(
                    id=str(uuid4()),
                    issue_id=issue.id,
                    user_id=a.user_id,
                    role=a.role,
                    action="added",
                    changed_by=reporter_id,
                )
            )

    await db.commit()
    issue = await get_issue(db, issue.id)
    # Dispatch notification
    try:
        frontend_url = await get_frontend_url(db)
        reporter_name = (
            issue.reporter.display_name or issue.reporter.username if issue.reporter else ""
        )
        await dispatch(
            db,
            NotificationEvent(
                event_type="issue.created",
                title=f"Issue #{issue.id[:8]}: {issue.title}",
                summary=f"Created by {reporter_name} | Priority: {issue.priority}",
                detail_url=f"{frontend_url}/issues/{issue.id}",
                actor_name=reporter_name,
                resource_type="issue",
                resource_id=issue.id,
            ),
        )
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return issue


async def update_issue(
    db: AsyncSession, issue: Issue, data: IssueUpdate, changed_by: str = ""
) -> Issue:
    # Track changes for notification
    added_labels: list = []
    removed_labels: list = []
    added_ms: list = []
    removed_ms: list = []

    if data.issue_type is not None:
        issue.issue_type = data.issue_type
    if data.title is not None:
        issue.title = data.title
    if data.description is not None:
        issue.description = data.description
    if data.status is not None and data.status != issue.status:
        issue.status = data.status
        if data.status in ("closed", "resolved", "cancelled"):
            issue.closed_at = datetime.now().isoformat()
        else:
            issue.closed_at = None
        db.add(
            IssueAssigneeLog(
                id=str(uuid4()),
                issue_id=issue.id,
                user_id=changed_by,
                role=data.status,
                action="status_changed",
                changed_by=changed_by,
            )
        )
    if data.priority is not None and data.priority != issue.priority:
        db.add(
            IssueAssigneeLog(
                id=str(uuid4()),
                issue_id=issue.id,
                user_id=changed_by,
                role=data.priority,
                action="priority_changed",
                changed_by=changed_by,
            )
        )
        issue.priority = data.priority

    if data.assignees is not None:
        # Get old assignees for logging
        old_rows = (
            await db.execute(
                select(issue_assignees.c.user_id, issue_assignees.c.role).where(
                    issue_assignees.c.issue_id == issue.id
                )
            )
        ).all()
        old_set = {(r.user_id, r.role) for r in old_rows}
        new_set = {(a.user_id, a.role) for a in data.assignees}

        # Log removals and additions
        for uid, role in old_set - new_set:
            db.add(
                IssueAssigneeLog(
                    id=str(uuid4()),
                    issue_id=issue.id,
                    user_id=uid,
                    role=role,
                    action="removed",
                    changed_by=issue.reporter_id,  # caller context not available in service
                )
            )
        for uid, role in new_set - old_set:
            db.add(
                IssueAssigneeLog(
                    id=str(uuid4()),
                    issue_id=issue.id,
                    user_id=uid,
                    role=role,
                    action="added",
                    changed_by=issue.reporter_id,
                )
            )

        # Delete all existing rows and re-insert with correct roles
        await db.execute(issue_assignees.delete().where(issue_assignees.c.issue_id == issue.id))
        for a in data.assignees:
            await db.execute(
                issue_assignees.insert().values(
                    issue_id=issue.id,
                    user_id=a.user_id,
                    role=a.role,
                    assigned_at=datetime.now().isoformat(),
                )
            )

    if data.label_ids is not None:
        old_label_ids = {l.id for l in (issue.labels or [])}
        new_label_ids = set(data.label_ids)
        if old_label_ids != new_label_ids:
            new_labels = (
                (await db.execute(select(Label).where(Label.id.in_(new_label_ids)))).scalars().all()
            )
            old_labels = [l for l in (issue.labels or []) if l.id in old_label_ids]
            added_labels = [l for l in new_labels if l.id not in old_label_ids]
            removed_labels = [l for l in old_labels if l.id not in new_label_ids]
            for l in added_labels:
                db.add(
                    IssueAssigneeLog(
                        id=str(uuid4()),
                        issue_id=issue.id,
                        user_id=changed_by,
                        role=l.name,
                        action="label_added",
                        changed_by=changed_by,
                    )
                )
            for l in removed_labels:
                db.add(
                    IssueAssigneeLog(
                        id=str(uuid4()),
                        issue_id=issue.id,
                        user_id=changed_by,
                        role=l.name,
                        action="label_removed",
                        changed_by=changed_by,
                    )
                )
        result = await db.execute(select(Label).where(Label.id.in_(data.label_ids)))
        issue.labels = list(result.scalars().all())

    if data.milestone_ids is not None:
        old_m = {m.id for m in (issue.milestones or [])}
        new_ms = set(data.milestone_ids)
        if old_m != new_ms:
            new_milestones = (
                (await db.execute(select(Milestone).where(Milestone.id.in_(new_ms))))
                .scalars()
                .all()
            )
            old_milestones = [m for m in (issue.milestones or []) if m.id in old_m]
            added_ms = [m for m in new_milestones if m.id not in old_m]
            removed_ms = [m for m in old_milestones if m.id not in new_ms]
            for m in added_ms:
                db.add(
                    IssueAssigneeLog(
                        id=str(uuid4()),
                        issue_id=issue.id,
                        user_id=changed_by,
                        role=m.name,
                        action="milestone_added",
                        changed_by=changed_by,
                    )
                )
            for m in removed_ms:
                db.add(
                    IssueAssigneeLog(
                        id=str(uuid4()),
                        issue_id=issue.id,
                        user_id=changed_by,
                        role=m.name,
                        action="milestone_removed",
                        changed_by=changed_by,
                    )
                )
        result = await db.execute(select(Milestone).where(Milestone.id.in_(data.milestone_ids)))
        issue.milestones = list(result.scalars().all())

    await db.commit()
    await db.refresh(issue)
    issue = await get_issue(db, issue.id)
    # Build notification with specific change details
    try:
        frontend_url = await get_frontend_url(db)
        changes = []
        if data.status is not None:
            changes.append(f"状态 → {data.status}")
        if data.priority is not None:
            changes.append(f"优先级 → {data.priority}")
        if data.title is not None:
            changes.append("标题已修改")
        if data.assignees is not None:
            changes.append("负责人已更新")
        if data.label_ids is not None:
            if added_labels:
                changes.append(f"+标签: {', '.join(l.name for l in added_labels)}")
            if removed_labels:
                changes.append(f"-标签: {', '.join(l.name for l in removed_labels)}")
            if not added_labels and not removed_labels:
                changes.append("标签已更新")
        if data.milestone_ids is not None:
            if added_ms:
                changes.append(f"+里程碑: {', '.join(m.name for m in added_ms)}")
            if removed_ms:
                changes.append(f"-里程碑: {', '.join(m.name for m in removed_ms)}")
            if not added_ms and not removed_ms:
                changes.append("里程碑已更新")
        event_type = (
            "issue.closed"
            if (data.status is not None and data.status in ("closed", "resolved"))
            else "issue.updated"
        )
        await dispatch(
            db,
            NotificationEvent(
                event_type=event_type,
                title=f"Issue #{issue.id[:8]}: {issue.title}",
                summary="; ".join(changes) if changes else "updated",
                detail_url=f"{frontend_url}/issues/{issue.id}",
                actor_name=issue.reporter.display_name or issue.reporter.username
                if issue.reporter
                else "",
                resource_type="issue",
                resource_id=issue.id,
            ),
        )
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return issue


async def create_comment(db: AsyncSession, issue_id: str, author_id: str, body: str) -> Comment:
    comment = Comment(id=str(uuid4()), issue_id=issue_id, author_id=author_id, body=body)
    db.add(comment)
    await db.commit()
    await db.refresh(comment)
    return comment


async def get_labels(db: AsyncSession) -> list[Label]:
    result = await db.execute(select(Label).order_by(Label.name))
    return list(result.scalars().all())


async def create_label(db: AsyncSession, name: str, color: str, description: str) -> Label:
    label = Label(id=str(uuid4()), name=name, color=color, description=description)
    db.add(label)
    await db.commit()
    await db.refresh(label)
    return label


async def update_label(
    db: AsyncSession, label: Label, name: str | None, color: str | None, description: str | None
) -> Label:
    if name is not None:
        label.name = name
    if color is not None:
        label.color = color
    if description is not None:
        label.description = description
    await db.commit()
    await db.refresh(label)
    return label


async def delete_label(db: AsyncSession, label: Label) -> None:
    await db.delete(label)
    await db.commit()
