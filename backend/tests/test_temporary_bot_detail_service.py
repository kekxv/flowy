from datetime import UTC, datetime, timedelta

import pytest

from app.services.temporary_bot_detail_service import TemporaryBotDetailService, hash_detail_token


@pytest.mark.asyncio
async def test_create_and_get_active_detail(db_session, test_user):
    service = TemporaryBotDetailService()
    detail, raw = await service.create(db_session, test_user.id, "Wiki title", "A summary", "# Full body", 60)
    assert raw
    assert detail.token_hash == hash_detail_token(raw)
    found = await service.get_active(db_session, raw)
    assert found.id == detail.id
    assert found.content == "# Full body"


@pytest.mark.asyncio
async def test_expired_detail_is_unavailable(db_session, test_user):
    service = TemporaryBotDetailService()
    detail, raw = await service.create(db_session, test_user.id, "Title", "Summary", "Body", 60)
    detail.expires_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
    await db_session.commit()
    assert await service.get_active(db_session, raw) is None

@pytest.mark.asyncio
async def test_handler_compacts_content_into_public_link(db_session):
    from app.services.wechat_work_bot.handlers import CommandHandlers

    response = await CommandHandlers(db_session)._temporary_detail("问题详情", "# 完整正文\n\n这里是很长的说明", "问题概括")
    assert response.startswith("**问题详情**\n\n问题概括")
    assert "点击查看详情" in response
    assert "/#/public/bot-details/" in response
