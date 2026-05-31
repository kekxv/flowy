"""Tests for app/core/dispatcher.py."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.dispatcher import dispatch
from app.models.notification import NotificationChannel, NotificationLog, NotificationRule
from app.services.notifications.base import NotificationEvent


def _make_event(event_type="test.event") -> NotificationEvent:
    return NotificationEvent(
        event_type=event_type,
        title="Test Event",
        summary="A test event summary",
        detail_url="http://example.com/test",
        actor_name="Tester",
        resource_type="test",
        resource_id="test-001",
    )


async def _create_channel_and_rule(db_session: AsyncSession, channel_id="ch-1", rule_id="rule-1",
                                    event_type="test.event", is_active=True):
    """Create a user, channel, and rule for testing."""
    from app.models.user import User
    import bcrypt
    user = User(
        id=f"user-{channel_id}", username=f"chuser_{channel_id}",
        email=f"ch{channel_id}@test.com",
        password_hash=bcrypt.hashpw("pass123".encode(), bcrypt.gensalt()).decode(),
    )
    db_session.add(user)
    await db_session.flush()

    channel = NotificationChannel(
        id=channel_id, name="Test Channel", channel_type="webhook",
        is_active=is_active, config='{"url": "http://example.com/hook"}',
        created_by=user.id,
    )
    rule = NotificationRule(
        id=rule_id, name="Test Rule", channel_id=channel_id,
        event_type=event_type, is_active=is_active,
        created_by=user.id,
    )
    db_session.add(channel)
    db_session.add(rule)
    await db_session.flush()
    return user, channel, rule


class TestDispatch:
    @pytest.mark.asyncio
    async def test_dispatch_no_rules(self, db_session: AsyncSession):
        """Dispatching with no rules doesn't raise."""
        await dispatch(db_session, _make_event())
        # No exception should be raised

    @pytest.mark.asyncio
    async def test_dispatch_inactive_rule(self, db_session: AsyncSession):
        """Inactive rules don't trigger dispatch."""
        await _create_channel_and_rule(db_session, is_active=False)

        await dispatch(db_session, _make_event())

        # No logs should be created since rule is inactive
        result = await db_session.execute(select(NotificationLog))
        logs = list(result.scalars().all())
        assert len(logs) == 0

    @pytest.mark.asyncio
    async def test_dispatch_creates_log(self, db_session: AsyncSession):
        """Active matching rule creates a success log."""
        await _create_channel_and_rule(db_session)

        await dispatch(db_session, _make_event())
        await db_session.commit()

        result = await db_session.execute(
            select(NotificationLog).where(
                NotificationLog.event_type == "test.event"
            )
        )
        logs = list(result.scalars().all())
        assert len(logs) == 1
        # The webhook send may fail (no real endpoint), but the log should be created
        assert logs[0].status in ("success", "failed")

    @pytest.mark.asyncio
    async def test_dispatch_does_not_commit(self, db_session: AsyncSession):
        """Dispatch does NOT commit the session. Logs added by dispatch
        should remain uncommitted until the caller commits."""
        await _create_channel_and_rule(db_session)

        await dispatch(db_session, _make_event())
        # Don't commit

        # Rollback should remove the dispatch's changes
        await db_session.rollback()

        # After rollback, no logs should exist
        result = await db_session.execute(select(NotificationLog))
        logs = list(result.scalars().all())
        assert len(logs) == 0

    @pytest.mark.asyncio
    async def test_dispatch_multi_event_type(self, db_session: AsyncSession):
        """Rule with comma-separated event types matches individual events."""
        await _create_channel_and_rule(
            db_session, channel_id="ch-multi", rule_id="rule-multi",
            event_type="event.a,event.b,event.c"
        )

        event = _make_event(event_type="event.b")
        await dispatch(db_session, event)
        await db_session.commit()

        result = await db_session.execute(
            select(NotificationLog).where(NotificationLog.event_type == "event.b")
        )
        logs = list(result.scalars().all())
        assert len(logs) == 1
