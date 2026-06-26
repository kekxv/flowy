"""Tests for WeChat Work bot command handlers — auto-assign and stats."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Issue, issue_assignees
from app.models.user import User
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.services.wechat_work_bot.handlers import CommandHandlers


def _make_user_kwargs(**kwargs):
    """Default user kwargs for creation."""
    import bcrypt

    defaults = {
        "id": str(uuid.uuid4()),
        "username": "testuser",
        "email": "test@example.com",
        "display_name": "Test User",
        "role": "member",
        "avatar_url": "",
        "password_hash": bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode(),
    }
    defaults.update(kwargs)
    return defaults


async def _create_bot_user(
    db_session: AsyncSession,
    wechat_user_id: str,
    flowy_user_id: str | None = None,
    role: str = "helper",
) -> WeChatWorkBotUser:
    """Helper to create a WeChatWorkBotUser record."""
    bot_user = WeChatWorkBotUser(
        id=str(uuid.uuid4()),
        wechat_user_id=wechat_user_id,
        flowy_user_id=flowy_user_id,
        role=role,
    )
    db_session.add(bot_user)
    await db_session.flush()
    return bot_user


class TestBotAutoAssign:
    """Tests for auto-assignment when creating issues via bot."""

    @pytest.mark.asyncio
    async def test_create_auto_assigns_to_linked_user(self, db_session: AsyncSession):
        """Creating an issue via bot auto-assigns to the linked Flowy user."""
        # Create a Flowy user
        flowy_user = User(**_make_user_kwargs(
            id="user-bot-001",
            username="botuser",
            email="botuser@example.com",
        ))
        db_session.add(flowy_user)
        await db_session.flush()

        # Create bot user linked to flowy_user
        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-user-001",
            flowy_user_id=flowy_user.id,
        )

        # Create issue via handler
        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-user-001",
        )
        result = await handlers.handle_create(
            args=["bug", "Auto-assign test issue"],
            quote={},
        )

        assert "✅" in result

        # Verify issue was created and auto-assigned
        issue_query = await db_session.execute(
            select(Issue).where(Issue.title == "Auto-assign test issue")
        )
        issue = issue_query.scalar_one_or_none()
        assert issue is not None

        # Check assignee was added
        assignee_query = await db_session.execute(
            select(issue_assignees).where(
                issue_assignees.c.issue_id == issue.id,
                issue_assignees.c.user_id == flowy_user.id,
            )
        )
        assignee = assignee_query.first()
        assert assignee is not None
        assert assignee.role == "member"

    @pytest.mark.asyncio
    async def test_create_no_auto_assign_without_link(self, db_session: AsyncSession):
        """Bot user without linked Flowy account cannot create issues."""
        # Create bot user WITHOUT flowy_user_id link
        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-unlinked",
            flowy_user_id=None,
        )

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-unlinked",
        )
        result = await handlers.handle_create(
            args=["bug", "No assign test"],
            quote={},
        )

        # Should get a message about needing to bind an account
        assert "绑定" in result

    @pytest.mark.asyncio
    async def test_auto_assign_guards_none_safely(self, db_session: AsyncSession):
        """Creating issue without linked account returns a helpful message."""
        # Bot user with NO flowy_user_id link (not None bot_user)
        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-guard",
            flowy_user_id=None,
        )

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-guard",
        )
        result = await handlers.handle_create(
            args=["bug", "Guard test issue"],
            quote={},
        )

        # Should return a helpful message about needing to bind, not crash
        assert "绑定" in result


class TestBotStats:
    """Tests for /stats command output format."""

    async def _create_issues(self, db_session: AsyncSession, assignee_user_id: str = None):
        """Create a set of issues with various statuses for stats testing.

        If assignee_user_id is provided, all issues are assigned to that user.
        """
        now = datetime.now().isoformat()
        base_user = assignee_user_id or "user-stats-001"

        statuses = [
            ("open", 3),
            ("in_progress", 2),
            ("resolved", 4),
            ("closed", 1),
        ]
        issue_ids = []
        for status, count in statuses:
            for i in range(count):
                issue = Issue(
                    id=f"stats-{status}-{i}",
                    title=f"{status} issue {i}",
                    description="Test",
                    issue_type="bug",
                    status=status,
                    priority="medium",
                    reporter_id=base_user,
                    created_at=now,
                    updated_at=now,
                )
                db_session.add(issue)
                issue_ids.append(issue.id)

                if assignee_user_id:
                    await db_session.execute(
                        issue_assignees.insert().values(
                            issue_id=issue.id,
                            user_id=assignee_user_id,
                            role="member",
                            assigned_at=now,
                        )
                    )
        await db_session.flush()
        return issue_ids

    @pytest.mark.asyncio
    async def test_stats_no_progress_column_in_header(self, db_session: AsyncSession):
        """Stats output should NOT have a '进度' column in the status table."""
        # Create test user (so bot_user lookup works)
        user = User(**_make_user_kwargs(
            id="user-stats-001",
            username="statsviewer",
            email="stats@example.com",
        ))
        db_session.add(user)
        await db_session.flush()

        # Create bot user linked to the test user
        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-stats",
            flowy_user_id=user.id,
        )

        await self._create_issues(db_session, assignee_user_id=user.id)

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-stats",
        )
        result = await handlers.handle_stats(args=["all"], quote={})

        # Verify the status table header
        assert "按状态" in result
        assert "占比" in result
        # "进度" should NOT appear as a column header (only in "当前进度" section)
        header_section = result.split("📈")[0]
        assert "进度" not in header_section

    @pytest.mark.asyncio
    async def test_stats_has_progress_bar(self, db_session: AsyncSession):
        """Stats output should have a single progress bar section with resolved/total."""
        user = User(**_make_user_kwargs(
            id="user-stats-002",
            username="statsviewer2",
            email="stats2@example.com",
        ))
        db_session.add(user)
        await db_session.flush()

        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-stats2",
            flowy_user_id=user.id,
        )

        await self._create_issues(db_session, assignee_user_id=user.id)

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-stats2",
        )
        result = await handlers.handle_stats(args=["all"], quote={})

        # Verify the progress bar section exists
        assert "📈 当前进度" in result
        # Should have a progress bar: ■ followed by □ or just □s
        assert "■" in result or "□" in result
        # Should show resolved count (4 resolved + 1 closed = 5) vs total (10)
        assert "已解决 5" in result
        assert "总计 10" in result
        # Progress should be 50%
        assert "50%" in result

    @pytest.mark.asyncio
    async def test_stats_empty(self, db_session: AsyncSession):
        """Stats with no assigned issues returns empty message."""
        user = User(**_make_user_kwargs(
            id="user-stats-003",
            username="statsempty",
            email="statsempty@example.com",
        ))
        db_session.add(user)
        await db_session.flush()

        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-stats3",
            flowy_user_id=user.id,
        )

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-stats3",
        )
        result = await handlers.handle_stats(args=["all"], quote={})

        # When no issues assigned, should get a message about no issues
        assert "没有指派给你的问题" in result

    @pytest.mark.asyncio
    async def test_stats_zero_percent(self, db_session: AsyncSession):
        """Stats with no resolved issues shows 0% progress."""
        user = User(**_make_user_kwargs(
            id="user-stats-004",
            username="statszero",
            email="statszero@example.com",
        ))
        db_session.add(user)
        await db_session.flush()

        bot_user = await _create_bot_user(
            db_session,
            wechat_user_id="wx-stats4",
            flowy_user_id=user.id,
        )

        # Create only open issues (no resolved/closed)
        now = datetime.now().isoformat()
        for i in range(3):
            issue = Issue(
                id=f"stats-zero-{i}",
                title=f"open only {i}",
                description="Test",
                issue_type="bug",
                status="open",
                priority="medium",
                reporter_id=user.id,
                created_at=now,
                updated_at=now,
            )
            db_session.add(issue)
            await db_session.execute(
                issue_assignees.insert().values(
                    issue_id=issue.id,
                    user_id=user.id,
                    role="member",
                    assigned_at=now,
                )
            )
        await db_session.flush()

        handlers = CommandHandlers(
            db=db_session,
            bot_user=bot_user,
            wechat_user_id="wx-stats4",
        )
        result = await handlers.handle_stats(args=["all"], quote={})

        assert "已解决 0" in result
        assert "总计 3" in result
        assert "0%" in result
        # Progress bar should be all empty
        assert "□" * 10 in result
