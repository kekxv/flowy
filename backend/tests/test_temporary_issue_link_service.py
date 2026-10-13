from datetime import UTC, datetime, timedelta, timezone

import pytest

from app.services.temporary_issue_link_service import (
    MAX_EXPIRY_MINUTES,
    MIN_EXPIRY_MINUTES,
    TemporaryIssueLinkService,
    hash_link_token,
)


@pytest.mark.asyncio
async def test_create_link_hashes_token_and_validates_expiry(db_session, test_user):
    link, raw = await TemporaryIssueLinkService().create(db_session, test_user.id, 60)
    assert raw
    assert link.token_hash == hash_link_token(raw)
    assert link.expires_at > datetime.now(UTC).isoformat()

@pytest.mark.asyncio
@pytest.mark.parametrize("minutes", [MIN_EXPIRY_MINUTES - 1, MAX_EXPIRY_MINUTES + 1])
async def test_create_link_rejects_expiry_out_of_bounds(db_session, test_user, minutes):
    with pytest.raises(ValueError):
        await TemporaryIssueLinkService().create(db_session, test_user.id, minutes)

@pytest.mark.asyncio
async def test_submit_consumes_link_once_and_assigns_creator_as_member(db_session, test_user):
    service = TemporaryIssueLinkService()
    link, raw = await service.create(db_session, test_user.id, 60)
    issue = await service.consume_and_create_issue(db_session, raw, {"title": "External request", "description": "details", "issue_type": "feature", "priority": "high", "due_date": "2026-11-01"})
    assert issue.reporter_id == test_user.id
    await db_session.refresh(link)
    assert link.used_at is not None
    with pytest.raises(ValueError, match="expired or already used"):
        await service.consume_and_create_issue(db_session, raw, {"title": "Again", "description": "", "issue_type": "bug", "priority": "medium", "due_date": None})

@pytest.mark.asyncio
async def test_expired_link_is_not_active(db_session, test_user):
    service = TemporaryIssueLinkService()
    link, raw = await service.create(db_session, test_user.id, 60)
    link.expires_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    await db_session.commit()
    assert await service.get_active(db_session, raw) is None
