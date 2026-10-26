"""Security boundaries for bot continuations and wiki search."""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import select

from app.models.issue import issue_assignees
from app.models.temporary_bot_detail import TemporaryBotDetail
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.services import wiki_service
from app.services.wechat_work_bot.service import WeChatWorkBotService


@asynccontextmanager
async def session_context(db):
    yield db


def frame(text="1"):
    return {"body": {"from": {"userid": "wx-security"}, "msgtype": "text", "text": {"content": text}}}


@pytest.mark.asyncio
@pytest.mark.parametrize("role", [None, "viewer"])
async def test_pending_assignment_rechecks_current_role(db_session, test_issue, test_user, role):
    if role:
        db_session.add(WeChatWorkBotUser(wechat_user_id="wx-security", role=role))
        await db_session.flush()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    service._pending_assignments["wx-security"] = {"assignee_name": test_user.display_name, "issues": [(test_issue.id, test_issue.title)]}
    with patch("app.services.wechat_work_bot.service.async_session", lambda: session_context(db_session)):
        await service.handle_message(frame())
    assert (await db_session.execute(select(issue_assignees))).all() == []
    assert "wx-security" not in service._pending_assignments
    assert "权限" in service._client.reply_text.call_args.args[1]
    assert service._client.reply_markdown.call_count == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("visible", [False, True])
async def test_wiki_selection_rechecks_visibility_and_creates_detail(db_session, test_user, test_admin, visible):
    page = await wiki_service.create_page(db_session, test_admin.id, "Private security notes", "secret body", is_public=visible)
    db_session.add(WeChatWorkBotUser(wechat_user_id="wx-security", role="viewer", flowy_user_id=test_user.id))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    service._pending_wiki["wx-security"] = [page.id]
    with patch("app.services.wechat_work_bot.service.async_session", lambda: session_context(db_session)):
        await service.handle_message(frame())
    details = list((await db_session.scalars(select(TemporaryBotDetail))).all())
    assert len(details) == int(visible)
    if visible:
        assert details[0].content == "secret body"
        assert "点击查看详情" in service._client.reply_markdown.call_args.args[1]
    else:
        assert service._client.reply_markdown.call_count == 0
    assert "wx-security" not in service._pending_wiki


@pytest.mark.asyncio
@pytest.mark.parametrize("keyword", ["Docker", "Team Docker"])
async def test_related_issue_does_not_grant_private_wiki_access(db_session, test_user, test_admin, keyword):
    await wiki_service.create_page(db_session, test_admin.id, "Team Docker", "secret body")
    assert await wiki_service.fuzzy_search(db_session, keyword, test_user.id, [test_admin.id]) == []
    results = await wiki_service.search_for_bot(db_session, keyword, test_user.id, [test_admin.id])
    assert results == {"related": [], "public": []}


@pytest.mark.asyncio
async def test_disabled_bound_user_cannot_query_bot(db_session, test_user):
    test_user.is_active = False
    db_session.add(WeChatWorkBotUser(wechat_user_id="wx-security", role="viewer", flowy_user_id=test_user.id))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    with patch("app.services.wechat_work_bot.service.async_session", lambda: session_context(db_session)):
        await service.handle_message(frame("/list"))
    assert service._client.reply_markdown.call_count == 0
    assert "权限" in service._client.reply_text.call_args.args[1]


@pytest.mark.asyncio
@pytest.mark.parametrize('text', ['9' * 5000, '²'], ids=['oversized', 'non-ascii-digit'])
async def test_invalid_numeric_selection_is_rejected_without_crashing(db_session, test_user, text):
    page = await wiki_service.create_page(db_session, test_user.id, 'Owned', 'body')
    db_session.add(WeChatWorkBotUser(wechat_user_id='wx-security', role='viewer', flowy_user_id=test_user.id))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    service._pending_wiki['wx-security'] = [page.id]
    with patch('app.services.wechat_work_bot.service.async_session', lambda: session_context(db_session)):
        await service.handle_message(frame(text))
    assert '无效序号' in service._client.reply_text.call_args.args[1]
    assert (await db_session.scalars(select(TemporaryBotDetail))).all() == []


@pytest.mark.asyncio
async def test_handler_errors_do_not_expose_internal_secrets(db_session):
    db_session.add(WeChatWorkBotUser(wechat_user_id='wx-security', role='viewer'))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    with (
        patch('app.services.wechat_work_bot.service.async_session', lambda: session_context(db_session)),
        patch('app.services.wechat_work_bot.handlers.CommandHandlers.handle_list', side_effect=RuntimeError('postgres://user:secret@internal')),
    ):
        await service.handle_message(frame('/list'))
    assert 'secret' not in service._client.reply_text.call_args.args[1]
    assert 'internal' not in service._client.reply_text.call_args.args[1]
