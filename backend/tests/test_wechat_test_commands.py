import pytest
from sqlalchemy import select

from app.models.temporary_bot_detail import TemporaryBotDetail
from app.services.wechat_work_bot.command_parser import COMMANDS
from app.services.wechat_work_bot.handlers import CommandHandlers


def test_test_command_and_chinese_alias_are_registered():
    from app.services.wechat_work_bot.command_parser import ALIAS_MAP
    assert COMMANDS["test"]["handler"] == "handle_test"
    assert ALIAS_MAP["测试"] == "test"


@pytest.mark.asyncio
async def test_test_handler_returns_status_and_report_link(db_session, test_user):
    from app.services.test_service import TestService
    request = await TestService().create_request(db_session, test_user, {"title": "查询这个测试"})
    handler = CommandHandlers(db_session)
    result = await handler.handle_test([request.id[:8]], {})
    assert "测试申请（待审核）" in result
    assert "/#/public/bot-details/" in result
    detail = (await db_session.execute(select(TemporaryBotDetail))).scalars().one()
    assert request.id not in detail.content
    assert "查询这个测试" in detail.content
