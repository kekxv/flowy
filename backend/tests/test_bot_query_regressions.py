import json

import pytest
from sqlalchemy import select

from app.models.issue import Issue
from app.models.temporary_bot_detail import TemporaryBotDetail
from app.services.wechat_work_bot.handlers import CommandHandlers
from app.services.wechat_work_bot.service import split_for_wecom


@pytest.mark.asyncio
async def test_ambiguous_issue_prefix_returns_choices_instead_of_exception(db_session, test_user):
    db_session.add_all([
        Issue(id=f'abc12345-{n}', title=f'Matching issue {n}', reporter_id=test_user.id)
        for n in range(2)
    ])
    await db_session.flush()
    response = await CommandHandlers(db_session).handle_view(['abc12345'], {})
    assert 'Matching issue 0' in response
    assert 'Matching issue 1' in response
    assert '更精确' in response


@pytest.mark.asyncio
@pytest.mark.parametrize('args', [['report', '#test-prefix'], ['测试', '标题'], ['report']])
async def test_test_query_accepts_report_hash_and_full_titles(db_session, test_user, args):
    from app.models.test import TestRequest as Request
    db_session.add(Request(id='test-prefix-001', title='测试 标题', reporter_id=test_user.id))
    db_session.add(Request(id='different-001', title='测试 其他', reporter_id=test_user.id, updated_at='2099-01-01T00:00:00'))
    await db_session.flush()
    response = await CommandHandlers(db_session).handle_test(args, {})
    if args == ['report']:
        assert '用法' in response
    else:
        assert '点击查看详情' in response
        assert '测试 标题' in response


def test_wecom_splitting_preserves_unicode_at_byte_boundaries():
    original = '测试😀' * 100
    chunks = split_for_wecom(original, max_bytes=31)
    assert ''.join(chunks) == original
    assert all(len(chunk.encode('utf-8')) <= 31 for chunk in chunks)


@pytest.mark.asyncio
async def test_dashboard_counts_all_matches_even_when_issue_list_is_limited(db_session, test_user):
    db_session.add_all([
        Issue(id=f'dashboard-{n:03}', title=f'Issue {n}', reporter_id=test_user.id, priority='high')
        for n in range(65)
    ])
    await db_session.flush()
    await CommandHandlers(db_session).handle_list(['all'], {})
    detail = (await db_session.scalars(select(TemporaryBotDetail))).one()
    dashboard = json.loads(detail.content.split('<!-- flowy-dashboard:', 1)[1].split(' -->', 1)[0])
    assert dashboard['total'] == 65
    assert dashboard['shown'] == 50
    assert dashboard['statuses'] == [{'key': 'open', 'label': '待处理', 'count': 65}]
    assert dashboard['priorities'] == [{'key': 'high', 'label': '高', 'count': 65}]
    assert sum(day['count'] for day in dashboard['activity']) == 65


@pytest.mark.asyncio
async def test_bot_audit_log_records_bound_account_instead_of_mapping_id(db_session, test_user):
    from contextlib import asynccontextmanager
    from unittest.mock import AsyncMock, patch

    from app.models.wechat_work_bot import WeChatWorkBotLog, WeChatWorkBotUser
    from app.services.wechat_work_bot.service import WeChatWorkBotService

    @asynccontextmanager
    async def session_context():
        yield db_session

    db_session.add(WeChatWorkBotUser(id='mapping-id', wechat_user_id='wx-query', role='viewer', flowy_user_id=test_user.id))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    with patch('app.services.wechat_work_bot.service.async_session', session_context):
        await service.handle_message({'body': {'from': {'userid': 'wx-query'}, 'msgtype': 'text', 'text': {'content': '/help'}}})
    log = (await db_session.scalars(select(WeChatWorkBotLog))).one()
    assert log.flowy_user_id == test_user.id


@pytest.mark.asyncio
@pytest.mark.parametrize('quoted_id', ['b56bae5b', '1234abcd', '1234abcd-5678-4abc-9abc-123456789abc'])
async def test_quoted_real_issue_ids_can_be_used_to_close_issues(db_session, test_user, quoted_id):
    from app.services.wechat_work_bot.message_parser import MessageParser
    issue_id = quoted_id if len(quoted_id) == 36 else quoted_id + '-5678-4abc-9abc-123456789abc'
    issue = Issue(id=issue_id, title='Quoted issue', reporter_id=test_user.id)
    db_session.add(issue)
    db_session.add(Issue(id='1234ffff-5678-4abc-9abc-123456789abc', title='Other issue', reporter_id=test_user.id))
    await db_session.flush()
    context = MessageParser().extract_context({'body': {'text': {'content': '/close'}, 'quote': {'text': {'content': f'问题 #{quoted_id} Quoted issue'}}}})
    response = await CommandHandlers(db_session).handle_close([], {'extracted_issue_ids': context.extracted_issue_ids})
    assert '已关闭' in response
    await db_session.refresh(issue)
    assert issue.status == 'closed'


def test_oversized_quoted_numbers_do_not_crash_message_parser():
    from app.services.wechat_work_bot.message_parser import MessageParser
    context = MessageParser().extract_context({'body': {'text': {'content': '/help'}, 'quote': {'text': {'content': '#' + '9' * 5000}}}})
    assert context.extracted_issue_ids == []
    assert context.extracted_numbers == []


@pytest.mark.asyncio
async def test_new_command_replaces_stale_numeric_selections(db_session, test_user):
    from contextlib import asynccontextmanager
    from unittest.mock import AsyncMock, patch

    from app.models.wechat_work_bot import WeChatWorkBotUser
    from app.services.wechat_work_bot.service import WeChatWorkBotService

    @asynccontextmanager
    async def session_context():
        yield db_session

    db_session.add(WeChatWorkBotUser(wechat_user_id='wx-query', role='viewer', flowy_user_id=test_user.id))
    await db_session.commit()
    service = WeChatWorkBotService()
    service._client = AsyncMock()
    service._pending_wiki['wx-query'] = ['old-page']
    service._pending_assignments['wx-query'] = {'issues': [('old-issue', 'old title')], 'assignee_name': 'old user'}
    with patch('app.services.wechat_work_bot.service.async_session', session_context):
        await service.handle_message({'body': {'from': {'userid': 'wx-query'}, 'msgtype': 'text', 'text': {'content': '/help'}}})
    assert 'wx-query' not in service._pending_wiki
    assert 'wx-query' not in service._pending_assignments
