"""Tests for app/services/issue_service.py."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tracking import IssueAssigneeLog
from app.schemas.common import PaginationParams
from app.schemas.issue import AssigneeInput, IssueCreate, IssueFilter, IssueUpdate
from app.services import issue_service


class TestCreateIssue:
    @pytest.mark.asyncio
    async def test_create_minimal(self, db_session: AsyncSession, test_user):
        """Create issue with just title."""
        data = IssueCreate(title="New Bug")
        issue = await issue_service.create_issue(db_session, data, test_user.id)

        assert issue.title == "New Bug"
        assert issue.issue_type == "bug"
        assert issue.priority == "medium"
        assert issue.status == "open"
        assert issue.reporter_id == test_user.id

    @pytest.mark.asyncio
    async def test_create_with_custom_fields(self, db_session: AsyncSession, test_user):
        """Create issue with custom type and priority."""
        data = IssueCreate(
            title="Feature Request",
            description="We need this feature",
            issue_type="feature",
            priority="high",
        )
        issue = await issue_service.create_issue(db_session, data, test_user.id)

        assert issue.issue_type == "feature"
        assert issue.priority == "high"
        assert issue.description == "We need this feature"


class TestGetIssue:
    @pytest.mark.asyncio
    async def test_get_existing(self, db_session: AsyncSession, test_issue):
        """Get an existing issue."""
        issue = await issue_service.get_issue(db_session, test_issue.id)
        assert issue is not None
        assert issue.id == test_issue.id
        assert issue.title == "Test Bug"

    @pytest.mark.asyncio
    async def test_get_nonexistent(self, db_session: AsyncSession):
        """Get non-existent issue returns None."""
        issue = await issue_service.get_issue(db_session, "nonexistent-id")
        assert issue is None

    @pytest.mark.asyncio
    async def test_get_loads_relations(self, db_session: AsyncSession, test_issue):
        """Get issue loads assignees, labels, milestones, comments."""
        issue = await issue_service.get_issue(db_session, test_issue.id)
        assert issue is not None
        assert issue.assignees is not None
        assert issue.labels is not None
        assert issue.milestones is not None
        assert issue.comments is not None


class TestListIssues:
    @pytest.mark.asyncio
    async def test_empty_list(self, db_session: AsyncSession):
        """List returns empty when no issues."""
        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter()
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert issues == []
        assert total == 0

    @pytest.mark.asyncio
    async def test_list_with_issues(self, db_session: AsyncSession, test_issue):
        """List returns issues when they exist."""
        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter()
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert len(issues) == 1
        assert total == 1
        assert issues[0].id == test_issue.id

    @pytest.mark.asyncio
    async def test_filter_by_status(self, db_session: AsyncSession, test_user):
        """Filter issues by status."""
        await issue_service.create_issue(db_session, IssueCreate(title="Open Issue"), test_user.id)
        issue2 = await issue_service.create_issue(
            db_session, IssueCreate(title="Closed Issue"), test_user.id
        )
        # Update second issue to closed status
        await issue_service.update_issue(
            db_session, issue2, IssueUpdate(status="closed"), changed_by=test_user.id
        )

        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter(status="open")
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert total == 1
        assert issues[0].status == "open"

    @pytest.mark.asyncio
    async def test_filter_by_priority(self, db_session: AsyncSession, test_user):
        """Filter issues by priority."""
        data = IssueCreate(title="Critical Issue", priority="critical")
        await issue_service.create_issue(db_session, data, test_user.id)

        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter(priority="critical")
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert total == 1
        assert issues[0].priority == "critical"

    @pytest.mark.asyncio
    async def test_filter_by_reporter(self, db_session: AsyncSession, test_user):
        """Filter issues by reporter_id."""
        data = IssueCreate(title="My Issue")
        await issue_service.create_issue(db_session, data, test_user.id)

        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter(reporter_id=test_user.id)
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert total == 1

    @pytest.mark.asyncio
    async def test_search_by_title(self, db_session: AsyncSession, test_user):
        """Search issues by title."""
        data = IssueCreate(title="Database Connection Timeout")
        await issue_service.create_issue(db_session, data, test_user.id)

        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter(q="Database")
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert total == 1

    @pytest.mark.asyncio
    async def test_search_no_match(self, db_session: AsyncSession, test_user):
        """Search with no matching term."""
        data = IssueCreate(title="Unique Title XYZ")
        await issue_service.create_issue(db_session, data, test_user.id)

        pagination = PaginationParams(page=1, per_page=20)
        filters = IssueFilter(q="nonexistent term")
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert total == 0

    @pytest.mark.asyncio
    async def test_pagination(self, db_session: AsyncSession, test_user):
        """Pagination respects page and per_page."""
        for i in range(5):
            data = IssueCreate(title=f"Issue {i}")
            await issue_service.create_issue(db_session, data, test_user.id)

        pagination = PaginationParams(page=1, per_page=2)
        filters = IssueFilter()
        issues, total = await issue_service.list_issues(db_session, pagination, filters)
        assert len(issues) == 2
        assert total == 5


class TestUpdateIssue:
    @pytest.mark.asyncio
    async def test_change_status(self, db_session: AsyncSession, test_issue):
        """Changing status to closed sets closed_at."""
        data = IssueUpdate(status="closed")
        updated = await issue_service.update_issue(
            db_session, test_issue, data, changed_by="user-001"
        )
        assert updated.status == "closed"
        assert updated.closed_at is not None

    @pytest.mark.asyncio
    async def test_change_status_reopen(self, db_session: AsyncSession, test_issue):
        """Reopening clears closed_at."""
        # First close it
        test_issue.status = "closed"
        test_issue.closed_at = "2025-01-01T00:00:00"
        await db_session.flush()

        data = IssueUpdate(status="open")
        updated = await issue_service.update_issue(
            db_session, test_issue, data, changed_by="user-001"
        )
        assert updated.status == "open"
        assert updated.closed_at is None

    @pytest.mark.asyncio
    async def test_change_priority(self, db_session: AsyncSession, test_issue):
        """Priority change is applied."""
        data = IssueUpdate(priority="critical")
        updated = await issue_service.update_issue(
            db_session, test_issue, data, changed_by="user-001"
        )
        assert updated.priority == "critical"

    @pytest.mark.asyncio
    async def test_change_title(self, db_session: AsyncSession, test_issue):
        """Title change is applied."""
        data = IssueUpdate(title="New Title")
        updated = await issue_service.update_issue(
            db_session, test_issue, data, changed_by="user-001"
        )
        assert updated.title == "New Title"

    @pytest.mark.asyncio
    async def test_assignee_logging(
        self, db_session: AsyncSession, test_issue, test_user, test_admin
    ):
        """Adding assignees creates IssueAssigneeLog records."""
        data = IssueUpdate(
            assignees=[
                AssigneeInput(user_id=test_user.id, role="project_lead"),
                AssigneeInput(user_id=test_admin.id, role="backend"),
            ]
        )
        await issue_service.update_issue(db_session, test_issue, data, changed_by=test_user.id)

        # Verify logs were created
        result = await db_session.execute(
            __import__("sqlalchemy", fromlist=["select"])
            .select(IssueAssigneeLog)
            .where(IssueAssigneeLog.issue_id == test_issue.id)
        )
        logs = list(result.scalars().all())
        assert len(logs) >= 2  # at least 2 add logs


class TestLabels:
    @pytest.mark.asyncio
    async def test_create_label(self, db_session: AsyncSession):
        """Create a new label."""
        label = await issue_service.create_label(
            db_session, name="enhancement", color="#00ff00", description="New feature"
        )
        assert label.name == "enhancement"
        assert label.color == "#00ff00"

    @pytest.mark.asyncio
    async def test_get_labels(self, db_session: AsyncSession, test_label):
        """Get all labels."""
        labels = await issue_service.get_labels(db_session)
        assert len(labels) >= 1
        assert any(l.name == "bug" for l in labels)

    @pytest.mark.asyncio
    async def test_delete_label(self, db_session: AsyncSession):
        """Delete a label."""
        label = await issue_service.create_label(
            db_session, name="to-delete", color="#000000", description=""
        )
        await issue_service.delete_label(db_session, label)

        labels = await issue_service.get_labels(db_session)
        assert not any(l.name == "to-delete" for l in labels)


class TestComments:
    @pytest.mark.asyncio
    async def test_create_comment(self, db_session: AsyncSession, test_issue, test_user):
        """Create a comment on an issue."""
        comment = await issue_service.create_comment(
            db_session, test_issue.id, test_user.id, "This is a comment"
        )
        assert comment.body == "This is a comment"
        assert comment.issue_id == test_issue.id
        assert comment.author_id == test_user.id
