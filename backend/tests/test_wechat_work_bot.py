"""Comprehensive tests for WeChat Work bot command handlers."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Issue, issue_assignees, issue_milestones_table
from app.models.tracking import Milestone
from app.models.user import User
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.services.wechat_work_bot.bind_token import generate_bind_token
from app.services.wechat_work_bot.handlers import CommandHandlers

NOW = datetime.now().isoformat()


def _make_user_kwargs(**kwargs):
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
    bot_user = WeChatWorkBotUser(
        id=str(uuid.uuid4()),
        wechat_user_id=wechat_user_id,
        flowy_user_id=flowy_user_id,
        role=role,
    )
    db_session.add(bot_user)
    await db_session.flush()
    return bot_user


async def _create_issue(
    db_session: AsyncSession,
    title: str,
    reporter_id: str,
    status: str = "open",
    priority: str = "medium",
    issue_type: str = "bug",
    description: str = "",
    issue_id: str | None = None,
) -> Issue:
    issue = Issue(
        id=issue_id or str(uuid.uuid4()),
        title=title,
        description=description,
        issue_type=issue_type,
        status=status,
        priority=priority,
        reporter_id=reporter_id,
        created_at=NOW,
        updated_at=NOW,
    )
    db_session.add(issue)
    await db_session.flush()
    return issue


async def _make_handlers(
    db_session: AsyncSession,
    wechat_user_id: str = "wx-test",
    flowy_user_id: str | None = "user-test",
    bot_role: str = "helper",
) -> CommandHandlers:
    """Create handlers with a linked bot user."""
    if flowy_user_id:
        bot_user = await _create_bot_user(
            db_session, wechat_user_id, flowy_user_id, bot_role
        )
    else:
        bot_user = None
    return CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id=wechat_user_id)


def _id(issue: Issue) -> str:
    """Format issue ID for command args (with # prefix)."""
    return f"#{issue.id[:8]}"


# ── TestBotHelp ──────────────────────────────────────────────────────────────

class TestBotHelp:
    @pytest.mark.asyncio
    async def test_help_returns_commands(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-help", username="helpuser", email="help@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_help([], {})
        assert "create" in result or "创建" in result
        assert "list" in result or "列表" in result
        assert "stats" in result or "统计" in result
        assert "close" in result or "关闭" in result
        assert "resolve" in result or "解决" in result


# ── TestBotList ──────────────────────────────────────────────────────────────

class TestBotList:
    @pytest.mark.asyncio
    async def test_list_empty(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-list1", username="lister1", email="list1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_list([], {})
        assert "没有找到匹配的问题" in result

    @pytest.mark.asyncio
    async def test_list_with_issues(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-list2", username="lister2", email="list2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        await _create_issue(db_session, "Bug 1", user.id, "open")
        await _create_issue(db_session, "Bug 2", user.id, "in_progress")

        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_list(["all"], {})
        assert "Bug 1" in result
        assert "Bug 2" in result


# ── TestBotCreate ────────────────────────────────────────────────────────────

class TestBotCreate:
    @pytest.mark.asyncio
    async def test_create_default_bug(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cr1", username="creator1", email="cr1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_create(["登录报错"], {})
        assert "✅" in result
        assert "Bug" in result

        issue_q = await db_session.execute(select(Issue).where(Issue.reporter_id == user.id))
        issues = issue_q.scalars().all()
        assert len(issues) == 1
        assert issues[0].issue_type == "bug"
        assert issues[0].title == "登录报错"

    @pytest.mark.asyncio
    async def test_create_feature_english(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cr2", username="creator2", email="cr2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_create(["feature", "New dashboard"], {})
        assert "需求" in result

        issue_q = await db_session.execute(select(Issue).where(Issue.reporter_id == user.id))
        issue = issue_q.scalar_one()
        assert issue.issue_type == "feature"
        assert issue.title == "New dashboard"

    @pytest.mark.asyncio
    async def test_create_feature_chinese(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cr3", username="creator3", email="cr3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_create(["需求", "数据看板"], {})
        assert "需求" in result

        issue_q = await db_session.execute(select(Issue).where(Issue.reporter_id == user.id))
        issue = issue_q.scalar_one()
        assert issue.issue_type == "feature"
        assert issue.title == "数据看板"

    @pytest.mark.asyncio
    async def test_create_with_description_from_args(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cr4", username="creator4", email="cr4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_create(["bug", "崩溃", "点击按钮后页面崩溃，需要修复"], {})
        assert "✅" in result

        issue_q = await db_session.execute(select(Issue).where(Issue.reporter_id == user.id))
        issue = issue_q.scalar_one()
        assert "点击按钮后页面崩溃" in issue.description

    @pytest.mark.asyncio
    async def test_create_with_quoted_description(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cr5", username="creator5", email="cr5@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        quote = {"quoted_content": "报错信息：\nError 500\nInternal Server Error"}
        result = await handlers.handle_create(["bug", "服务端报错"], quote)
        assert "✅" in result

        issue_q = await db_session.execute(select(Issue).where(Issue.reporter_id == user.id))
        issue = issue_q.scalar_one()
        assert "Error 500" in issue.description

    @pytest.mark.asyncio
    async def test_create_requires_binding(self, db_session: AsyncSession):
        handlers = await _make_handlers(db_session, wechat_user_id="wx-nb", flowy_user_id=None)
        result = await handlers.handle_create(["test"], {})
        assert "绑定" in result


# ── TestBotUpdate ─────────────────────────────────────────────────────────────

class TestBotUpdate:
    @pytest.mark.asyncio
    async def test_update_status(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-up1", username="updater1", email="up1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Update me", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_update([_id(issue), "status", "in_progress"], {})
        assert "✅" in result
        await db_session.refresh(issue)
        assert issue.status == "in_progress"

    @pytest.mark.asyncio
    async def test_update_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-up2", username="updater2", email="up2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Old title", user.id)
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_update([_id(issue), "title", "New title here"], {})
        assert "✅" in result
        await db_session.refresh(issue)
        assert issue.title == "New title here"

    @pytest.mark.asyncio
    async def test_update_priority(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-up3", username="updater3", email="up3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Priority update", user.id, priority="low")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_update([_id(issue), "priority", "critical"], {})
        assert "✅" in result
        await db_session.refresh(issue)
        assert issue.priority == "critical"

    @pytest.mark.asyncio
    async def test_update_nonexistent(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-up4", username="updater4", email="up4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_update(["#nonexist", "status", "open"], {})
        assert "找不到" in result

    @pytest.mark.asyncio
    async def test_update_by_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-up5", username="updater5", email="up5@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Unique title for update", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_update(["Unique title", "status", "in_progress"], {})
        assert "✅" in result
        await db_session.refresh(issue)
        assert issue.status == "in_progress"


# ── TestBotClose ──────────────────────────────────────────────────────────────

class TestBotClose:
    @pytest.mark.asyncio
    async def test_close_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cl1", username="closer1", email="cl1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Close bug", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_close([_id(issue), "已修复"], {})
        assert "已关闭" in result
        await db_session.refresh(issue)
        assert issue.status == "closed"

    @pytest.mark.asyncio
    async def test_close_already_closed(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cl2", username="closer2", email="cl2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Already closed", user.id, "closed")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_close([_id(issue)], {})
        assert "已经是" in result or "关闭状态" in result

    @pytest.mark.asyncio
    async def test_close_with_quoted_id(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cl3", username="closer3", email="cl3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Quoted close", user.id)
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_close([], {"extracted_issue_ids": [issue.id[:8]]})
        assert "已关闭" in result
        await db_session.refresh(issue)
        assert issue.status == "closed"

    @pytest.mark.asyncio
    async def test_close_by_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cl4", username="closer4", email="cl4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "登录页面崩溃", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_close(["登录页面崩溃"], {})
        assert "已关闭" in result
        await db_session.refresh(issue)
        assert issue.status == "closed"


# ── TestBotResolve ────────────────────────────────────────────────────────────

class TestBotResolve:
    @pytest.mark.asyncio
    async def test_resolve_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-rs1", username="resolver1", email="rs1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Resolve me", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_resolve([_id(issue), "已处理完成"], {})
        assert "已解决" in result
        assert "已处理完成" in result
        await db_session.refresh(issue)
        assert issue.status == "resolved"

    @pytest.mark.asyncio
    async def test_resolve_already_resolved(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-rs2", username="resolver2", email="rs2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Done", user.id, "resolved")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_resolve([_id(issue)], {})
        assert "已经是" in result

    @pytest.mark.asyncio
    async def test_resolve_nonexistent(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-rs3", username="resolver3", email="rs3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_resolve(["#nonexist"], {})
        assert "找不到" in result

    @pytest.mark.asyncio
    async def test_resolve_by_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-rs4", username="resolver4", email="rs4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "修复支付流程", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_resolve(["修复支付流程"], {})
        assert "已解决" in result
        await db_session.refresh(issue)
        assert issue.status == "resolved"


# ── TestBotAssign ─────────────────────────────────────────────────────────────

class TestBotAssign:
    @pytest.mark.asyncio
    async def test_assign_to_flowy_user(self, db_session: AsyncSession):
        reporter = User(**_make_user_kwargs(id="user-as1", username="assigner", email="as1@ex.com"))
        target = User(**_make_user_kwargs(id="user-as2", username="targetuser", email="as2@ex.com", display_name="Target"))
        db_session.add_all([reporter, target])
        await db_session.flush()
        issue = await _create_issue(db_session, "Assign test", reporter.id)
        handlers = await _make_handlers(db_session, flowy_user_id=reporter.id)

        result = await handlers.handle_assign([_id(issue), "targetuser"], {})
        assert "指派" in result

        assignee_q = await db_session.execute(
            select(issue_assignees).where(issue_assignees.c.issue_id == issue.id)
        )
        assert assignee_q.first() is not None

    @pytest.mark.asyncio
    async def test_assign_nonexistent_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-as3", username="assigner2", email="as3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_assign(["#NOEXIST", "someone"], {})
        assert "找不到" in result

    @pytest.mark.asyncio
    async def test_assign_by_title(self, db_session: AsyncSession):
        reporter = User(**_make_user_kwargs(id="user-as4", username="assigner3", email="as4@ex.com"))
        target = User(**_make_user_kwargs(id="user-as5", username="target2", email="as5@ex.com", display_name="Target2"))
        db_session.add_all([reporter, target])
        await db_session.flush()
        issue = await _create_issue(db_session, "修复登录验证码", reporter.id)
        handlers = await _make_handlers(db_session, flowy_user_id=reporter.id)

        result = await handlers.handle_assign(["修复登录验证码", "target2"], {})
        assert "指派" in result

        assignee_q = await db_session.execute(
            select(issue_assignees).where(issue_assignees.c.issue_id == issue.id)
        )
        assert assignee_q.first() is not None

    @pytest.mark.asyncio
    async def test_resolve_multiple_title_matches(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-rs5", username="resolver5", email="rs5@ex.com"))
        db_session.add(user)
        await db_session.flush()
        await _create_issue(db_session, "登录页面崩溃", user.id, "open")
        await _create_issue(db_session, "登录按钮失效", user.id, "open")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_resolve(["登录"], {})
        assert "找到多个" in result or "匹配" in result


# ── TestBotPriority ───────────────────────────────────────────────────────────

class TestBotPriority:
    @pytest.mark.asyncio
    async def test_priority_english(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-pr1", username="prior1", email="pr1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Prio test", user.id, priority="medium")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_priority([_id(issue), "critical"], {})
        assert "已将" in result
        await db_session.refresh(issue)
        assert issue.priority == "critical"

    @pytest.mark.asyncio
    async def test_priority_chinese(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-pr2", username="prior2", email="pr2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Prio zh test", user.id, priority="low")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_priority([_id(issue), "紧急"], {})
        assert "已将" in result
        await db_session.refresh(issue)
        assert issue.priority == "critical"
        await db_session.refresh(issue)
        assert issue.priority == "critical"

    @pytest.mark.asyncio
    async def test_priority_by_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-pr3", username="prior3", email="pr3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "首页加载超时", user.id, priority="medium")
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_priority(["首页加载超时", "高"], {})
        assert "已将" in result
        await db_session.refresh(issue)
        assert issue.priority == "high"


# ── TestBotComment ────────────────────────────────────────────────────────────

class TestBotComment:
    @pytest.mark.asyncio
    async def test_comment_on_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cm1", username="commenter", email="cm1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Comment test", user.id)
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_comment([_id(issue), "This is a test comment"], {})
        assert "已评论" in result

    @pytest.mark.asyncio
    async def test_comment_requires_binding(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cm2", username="nobind", email="cm2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "No bind test", user.id)
        # Bot user without flowy link
        bot_user = await _create_bot_user(db_session, "wx-nobind2", flowy_user_id=None)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-nobind2")
        result = await handlers.handle_comment([_id(issue), "test"], {})
        assert "绑定" in result

    @pytest.mark.asyncio
    async def test_comment_by_title(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-cm3", username="commenter3", email="cm3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        _ = await _create_issue(db_session, "数据库连接超时", user.id)
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_comment(["数据库连接超时", "已排查到慢查询"], {})
        assert "已评论" in result

    @pytest.mark.asyncio
    async def test_attachment_uses_full_uuid_capability_name(
        self, db_session: AsyncSession, tmp_path, monkeypatch
    ):
        from app.models.issue import Comment

        user = User(
            **_make_user_kwargs(id="user-cm4", username="commenter4", email="cm4@ex.com")
        )
        db_session.add(user)
        await db_session.flush()
        issue = await _create_issue(db_session, "Attachment test", user.id)
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

        class FakeWebSocketClient:
            async def download_file(self, _url, _aes_key):
                return b"image-data", "photo.png"

        class FakeBotClient:
            _ws_client = FakeWebSocketClient()

        frame = {
            "body": {
                "msgtype": "image",
                "image": {"url": "https://wechat.example/media", "aeskey": "key"},
            },
            "_bot_client": FakeBotClient(),
        }

        result = await handlers.handle_comment([_id(issue), "see image"], {}, frame)

        assert "已评论" in result
        comment = (await db_session.execute(select(Comment))).scalars().one()
        filename = comment.body.split("attachment:", 1)[1].split(")", 1)[0]
        assert len(filename.removesuffix(".png")) == 32


# ── TestBotMilestone ──────────────────────────────────────────────────────────

class TestBotMilestone:
    @pytest.mark.asyncio
    async def test_milestone_create(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms1", username="mstone1", email="ms1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["create", "Sprint 1"], {})
        assert "已创建" in result
        assert "Sprint 1" in result

    @pytest.mark.asyncio
    async def test_milestone_list(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms2", username="mstone2", email="ms2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["list"], {})
        assert "里程碑" in result or "暂无" in result

    @pytest.mark.asyncio
    async def test_milestone_close(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms3", username="mstone3", email="ms3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint X", status="open")
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["close", ms.id[:8]], {})
        assert "已关闭" in result
        await db_session.refresh(ms)
        assert ms.status == "closed"

    @pytest.mark.asyncio
    async def test_milestone_stats(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms4", username="mstone4", email="ms4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint Y", status="open")
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["stats", ms.id[:8]], {})
        assert "Sprint Y" in result
        assert "0" in result

    @pytest.mark.asyncio
    async def test_milestone_no_args_defaults_to_list(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms5", username="mstone5", email="ms5@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone([], {})
        assert "里程碑" in result or "暂无" in result

    @pytest.mark.asyncio
    async def test_milestone_list_table_format(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms6", username="mstone6", email="ms6@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint Z", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["list"], {})
        assert "| 状态 |" in result
        assert "| 名称 |" in result
        assert "Sprint Z" in result

    @pytest.mark.asyncio
    async def test_milestone_view_by_name(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms7", username="mstone7", email="ms7@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Release 2.0", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["Release", "2.0"], {})
        assert "Release 2.0" in result
        assert "进度" in result
        assert "关联问题" in result or "暂无关联问题" in result

    @pytest.mark.asyncio
    async def test_milestone_view_by_id_prefix(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms8", username="mstone8", email="ms8@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Beta 1.0", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone([ms.id[:8]], {})
        assert "Beta 1.0" in result
        assert "进度" in result

    @pytest.mark.asyncio
    async def test_milestone_view_with_issues(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms9", username="mstone9", email="ms9@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 5", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()

        issue = Issue(
            id=str(uuid.uuid4()),
            title="Fix login bug",
            reporter_id=user.id,
            status="open",
            priority="high",
        )
        db_session.add(issue)
        await db_session.flush()
        await db_session.execute(
            issue_milestones_table.insert().values(issue_id=issue.id, milestone_id=ms.id)
        )
        await db_session.commit()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["Sprint", "5"], {})
        assert "Sprint 5" in result
        assert "Fix login bug" in result
        assert "100%" in result or "0%" in result  # progress shown

    @pytest.mark.asyncio
    async def test_milestone_stats_with_progress(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms10", username="mstone10", email="ms10@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 6", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()

        open_issue = Issue(
            id=str(uuid.uuid4()),
            title="Open issue",
            reporter_id=user.id,
            status="open",
        )
        closed_issue = Issue(
            id=str(uuid.uuid4()),
            title="Closed issue",
            reporter_id=user.id,
            status="closed",
        )
        db_session.add_all([open_issue, closed_issue])
        await db_session.flush()
        await db_session.execute(
            issue_milestones_table.insert().values(issue_id=open_issue.id, milestone_id=ms.id)
        )
        await db_session.execute(
            issue_milestones_table.insert().values(issue_id=closed_issue.id, milestone_id=ms.id)
        )
        await db_session.commit()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["stats", ms.id[:8]], {})
        assert "Sprint 6" in result
        assert "50%" in result  # 1 closed out of 2
        assert "2" in result  # total issues

    @pytest.mark.asyncio
    async def test_milestone_add_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms11", username="mstone11", email="ms11@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 7", status="open", owner_id=user.id)
        db_session.add(ms)
        issue = Issue(
            id=str(uuid.uuid4()),
            title="Add to milestone",
            reporter_id=user.id,
            status="open",
        )
        db_session.add(issue)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["add", "Sprint 7", f"#{issue.id[:8]}"], {})
        assert "已" in result and "关联" in result
        assert "Sprint 7" in result

        # Verify association in DB
        row = await db_session.execute(
            select(issue_milestones_table).where(
                issue_milestones_table.c.milestone_id == ms.id,
                issue_milestones_table.c.issue_id == issue.id,
            )
        )
        assert row.first() is not None

    @pytest.mark.asyncio
    async def test_milestone_add_issue_already_linked(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms12", username="mstone12", email="ms12@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 8", status="open", owner_id=user.id)
        db_session.add(ms)
        issue = Issue(
            id=str(uuid.uuid4()),
            title="Already linked",
            reporter_id=user.id,
            status="open",
        )
        db_session.add(issue)
        await db_session.flush()
        await db_session.execute(
            issue_milestones_table.insert().values(issue_id=issue.id, milestone_id=ms.id)
        )
        await db_session.commit()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["add", ms.id[:8], issue.id[:8]], {})
        assert "已在" in result or "已" in result

    @pytest.mark.asyncio
    async def test_milestone_remove_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms13", username="mstone13", email="ms13@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 9", status="open", owner_id=user.id)
        db_session.add(ms)
        issue = Issue(
            id=str(uuid.uuid4()),
            title="Remove from milestone",
            reporter_id=user.id,
            status="open",
        )
        db_session.add(issue)
        await db_session.flush()
        await db_session.execute(
            issue_milestones_table.insert().values(issue_id=issue.id, milestone_id=ms.id)
        )
        await db_session.commit()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["remove", "Sprint 9", f"#{issue.id[:8]}"], {})
        assert "移除" in result

        # Verify association removed
        row = await db_session.execute(
            select(issue_milestones_table).where(
                issue_milestones_table.c.milestone_id == ms.id,
                issue_milestones_table.c.issue_id == issue.id,
            )
        )
        assert row.first() is None

    @pytest.mark.asyncio
    async def test_milestone_remove_issue_not_linked(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms14", username="mstone14", email="ms14@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 10", status="open", owner_id=user.id)
        db_session.add(ms)
        issue = Issue(
            id=str(uuid.uuid4()),
            title="Not linked",
            reporter_id=user.id,
            status="open",
        )
        db_session.add(issue)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["remove", ms.id[:8], issue.id[:8]], {})
        assert "不在" in result or "不在" in result

    @pytest.mark.asyncio
    async def test_milestone_add_nonexistent_issue(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms15", username="mstone15", email="ms15@ex.com"))
        db_session.add(user)
        await db_session.flush()
        ms = Milestone(id=str(uuid.uuid4()), name="Sprint 11", status="open", owner_id=user.id)
        db_session.add(ms)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["add", "Sprint 11", "deadbeef"], {})
        assert "找不到" in result

    @pytest.mark.asyncio
    async def test_milestone_add_nonexistent_milestone(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-ms16", username="mstone16", email="ms16@ex.com"))
        db_session.add(user)
        await db_session.flush()
        issue = Issue(
            id=str(uuid.uuid4()),
            title="Orphan issue",
            reporter_id=user.id,
            status="open",
        )
        db_session.add(issue)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)

        result = await handlers.handle_milestone(["add", "非存在里程碑", issue.id[:8]], {})
        assert "找不到" in result


# ── TestBotUserMgmt ───────────────────────────────────────────────────────────

class TestBotUserMgmt:
    @pytest.mark.asyncio
    async def test_add_user(self, db_session: AsyncSession):
        admin = User(**_make_user_kwargs(id="user-mg1", username="botadmin", email="mg1@ex.com", role="admin"))
        db_session.add(admin)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=admin.id, bot_role="admin")

        result = await handlers.handle_add_user(["wx-newbie", "viewer"], {})
        assert "已添加" in result or "wx-newbie" in result

    @pytest.mark.asyncio
    async def test_list_users(self, db_session: AsyncSession):
        admin = User(**_make_user_kwargs(id="user-mg2", username="botadmin2", email="mg2@ex.com", role="admin"))
        db_session.add(admin)
        await db_session.flush()
        await _create_bot_user(db_session, "wx-u1", flowy_user_id=admin.id, role="admin")
        await _create_bot_user(db_session, "wx-u2", flowy_user_id=None, role="viewer")
        handlers = await _make_handlers(db_session, flowy_user_id=admin.id, bot_role="admin")

        result = await handlers.handle_list_users([], {})
        assert "wx-u1" in result
        assert "wx-u2" in result

    @pytest.mark.asyncio
    async def test_set_role(self, db_session: AsyncSession):
        admin = User(**_make_user_kwargs(id="user-mg3", username="botadmin3", email="mg3@ex.com", role="admin"))
        db_session.add(admin)
        await db_session.flush()
        bot_u = await _create_bot_user(db_session, "wx-role1", flowy_user_id=None, role="viewer")
        handlers = await _make_handlers(db_session, flowy_user_id=admin.id, bot_role="admin")

        result = await handlers.handle_set_role(["wx-role1", "helper"], {})
        assert "✅" in result
        await db_session.refresh(bot_u)
        assert bot_u.role == "helper"

    @pytest.mark.asyncio
    async def test_remove_user(self, db_session: AsyncSession):
        admin = User(**_make_user_kwargs(id="user-mg4", username="botadmin4", email="mg4@ex.com", role="admin"))
        db_session.add(admin)
        await db_session.flush()
        await _create_bot_user(db_session, "wx-remove", flowy_user_id=None, role="viewer")
        handlers = await _make_handlers(db_session, flowy_user_id=admin.id, bot_role="admin")

        result = await handlers.handle_remove_user(["wx-remove"], {})
        assert "已移除" in result

        q = await db_session.execute(select(WeChatWorkBotUser).where(WeChatWorkBotUser.wechat_user_id == "wx-remove"))
        assert q.scalar_one_or_none() is None


# ── TestBotBind ───────────────────────────────────────────────────────────────

class TestBotBind:
    @pytest.mark.asyncio
    async def test_bind_with_valid_token(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-bind1", username="binder", email="bind1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        token = generate_bind_token(user.id, "helper")

        # Don't pre-create a bot_user — handle_bind creates one
        handlers = CommandHandlers(db=db_session, bot_user=None, wechat_user_id="wx-bind1")
        result = await handlers.handle_bind([token], {})
        assert "绑定成功" in result

    @pytest.mark.asyncio
    async def test_bind_invalid_token(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-bind2", username="binder2", email="bind2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = CommandHandlers(db=db_session, bot_user=None, wechat_user_id="wx-bind2")

        result = await handlers.handle_bind(["invalid.token.here"], {})
        assert "无效" in result or "过期" in result


# ── TestBotStats ──────────────────────────────────────────────────────────────

class TestBotStats:
    async def _create_issues(self, db_session: AsyncSession, assignee_user_id: str = None):
        now = datetime.now().isoformat()
        base_user = assignee_user_id or "user-stats-001"
        statuses = [("open", 3), ("in_progress", 2), ("resolved", 4), ("closed", 1)]
        for status, count in statuses:
            for i in range(count):
                issue = Issue(
                    id=f"stats-{status}-{i}",
                    title=f"{status} issue {i}",
                    description="Test", issue_type="bug",
                    status=status, priority="medium",
                    reporter_id=base_user,
                    created_at=now, updated_at=now,
                )
                db_session.add(issue)
                if assignee_user_id:
                    await db_session.execute(
                        issue_assignees.insert().values(
                            issue_id=issue.id, user_id=assignee_user_id,
                            role="member", assigned_at=now,
                        )
                    )
        await db_session.flush()

    @pytest.mark.asyncio
    async def test_stats_no_progress_column_in_header(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-stats-001", username="statsviewer", email="stats@ex.com"))
        db_session.add(user)
        await db_session.flush()
        bot_user = await _create_bot_user(db_session, "wx-stats", flowy_user_id=user.id)
        await self._create_issues(db_session, assignee_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-stats")
        result = await handlers.handle_stats(["all"], {})
        assert "按状态" in result
        assert "占比" in result
        header_section = result.split("📈")[0]
        assert "进度" not in header_section

    @pytest.mark.asyncio
    async def test_stats_has_progress_bar(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-stats-002", username="statsviewer2", email="stats2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        bot_user = await _create_bot_user(db_session, "wx-stats2", flowy_user_id=user.id)
        await self._create_issues(db_session, assignee_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-stats2")
        result = await handlers.handle_stats(["all"], {})
        assert "📈 当前进度" in result
        assert "已解决 5" in result
        assert "总计 10" in result

    @pytest.mark.asyncio
    async def test_stats_empty(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-stats-003", username="statsempty", email="se@ex.com"))
        db_session.add(user)
        await db_session.flush()
        bot_user = await _create_bot_user(db_session, "wx-stats3", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-stats3")
        result = await handlers.handle_stats(["all"], {})
        assert "没有指派给你的问题" in result

    @pytest.mark.asyncio
    async def test_stats_zero_percent(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-stats-004", username="statszero", email="sz@ex.com"))
        db_session.add(user)
        await db_session.flush()
        bot_user = await _create_bot_user(db_session, "wx-stats4", flowy_user_id=user.id)
        now = datetime.now().isoformat()
        for i in range(3):
            issue = Issue(
                id=f"stats-zero-{i}", title=f"open only {i}",
                description="Test", issue_type="bug",
                status="open", priority="medium",
                reporter_id=user.id, created_at=now, updated_at=now,
            )
            db_session.add(issue)
            await db_session.execute(
                issue_assignees.insert().values(
                    issue_id=issue.id, user_id=user.id,
                    role="member", assigned_at=now,
                )
            )
        await db_session.flush()
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-stats4")
        result = await handlers.handle_stats(["all"], {})
        assert "已解决 0" in result
        assert "总计 3" in result
        assert "□" * 10 in result


# ── TestIntranetParser ──────────────────────────────────────────

class TestIntranetParser:
    def test_parse_json_array_of_objects(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_json

        body = '[{"name": "report.pdf", "url": "http://nas/report.pdf"}, {"name": "data.zip", "url": "http://nas/data.zip"}]'
        result = _parse_json(body, "http://nas/")
        assert len(result) == 2
        names = {r["name"] for r in result}
        assert names == {"report.pdf", "data.zip"}
        assert all("mtime" in r for r in result)

    def test_parse_json_nested_files_key(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_json

        body = '{"files": [{"name": "a.txt", "url": "http://x/a.txt"}]}'
        result = _parse_json(body, "http://x/")
        assert len(result) == 1
        assert result[0]["name"] == "a.txt"

    def test_parse_json_flat_strings(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_json

        body = '["file1.txt", "file2.zip"]'
        result = _parse_json(body, "http://nas/share/")
        assert len(result) == 2
        names = {r["name"] for r in result}
        assert names == {"file1.txt", "file2.zip"}

    def test_parse_json_with_mtime_sorted_newest_first(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_json

        body = '[{"name": "old.txt", "url": "http://x/old.txt", "mtime": "2024-01-01 10:00:00"}, {"name": "new.txt", "url": "http://x/new.txt", "mtime": "2024-06-01 10:00:00"}]'
        result = _parse_json(body, "http://x/")
        assert len(result) == 2
        assert result[0]["name"] == "new.txt"
        assert result[1]["name"] == "old.txt"

    def test_parse_json_normalizes_common_size_fields(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_json

        body = """[
            {"name": "bytes.bin", "url": "http://x/bytes.bin", "size": 1536},
            {"name": "kilobytes.bin", "url": "http://x/kilobytes.bin", "file_size": "2 KB"},
            {"name": "megabyte.bin", "url": "http://x/megabyte.bin", "content_length": "1048576"},
            {"name": "unknown.bin", "url": "http://x/unknown.bin", "size": "-"}
        ]"""

        result = {item["name"]: item["size"] for item in _parse_json(body, "http://x/")}

        assert result == {
            "bytes.bin": 1536,
            "kilobytes.bin": 2048,
            "megabyte.bin": 1048576,
            "unknown.bin": None,
        }

    def test_parse_nginx_index(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = """
        <html><body>
        <h1>Index of /files</h1>
        <table>
        <tr><td><a href="../">Parent Directory</a></td></tr>
        <tr><td><a href="document.pdf">document.pdf</a></td><td>2024-01-15 10:30</td><td>1.2M</td></tr>
        <tr><td><a href="image.png">image.png</a></td><td>2024-06-20 14:00</td><td>3.4M</td></tr>
        <tr><td><a href="backup/">backup/</a></td><td>2024-01-03</td><td>-</td></tr>
        </table>
        </body></html>
        """
        result = _parse_nginx(html, "http://nas/files/")
        assert len(result) == 2  # skips ../ and backup/
        names = {r["name"] for r in result}
        assert names == {"document.pdf", "image.png"}
        # image.png has newer mtime → should be first
        assert result[0]["name"] == "image.png"
        assert result[0]["size"] == int(3.4 * 1024 * 1024)
        assert result[1]["size"] == int(1.2 * 1024 * 1024)

    def test_parse_nginx_html_entities_in_text(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        # Nginx sometimes renders filenames with HTML entities in text
        # e.g. a file named "a>b.txt" shows as "a&gt;b.txt"
        html = '<a href="a&gt;b.txt">a&gt;b.txt</a>   2024-03-01 10:00<a href="c&amp;d.zip">c&amp;d.zip</a>   2024-05-01 10:00'
        result = _parse_nginx(html, "http://nas/")
        assert len(result) == 2
        assert result[0]["name"] == "c&d.zip"  # newer mtime first
        assert result[1]["name"] == "a>b.txt"

    def test_parse_nginx_url_encoded_href(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = '<a href="%E6%96%87%E4%BB%B6.pdf">%E6%96%87%E4%BB%B6.pdf</a>'
        result = _parse_nginx(html, "http://nas/")
        assert len(result) == 1
        assert result[0]["name"] == "文件.pdf"

    def test_parse_nginx_skips_sort_links(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = '<a href="?C=N;O=D">Name</a><a href="file.txt">file.txt</a>'
        result = _parse_nginx(html, "http://nas/")
        assert len(result) == 1
        assert result[0]["name"] == "file.txt"


class TestParseTime:
    def test_iso_format(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_time

        assert _parse_time("2024-01-15 10:30:00") is not None
        assert _parse_time("2024-01-15 10:30") is not None
        assert _parse_time("2024-01-15T10:30:00") is not None
        assert _parse_time("2024-01-15") is not None

    def test_nginx_format(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_time

        result = _parse_time("15-Jan-2024 10:30:00")
        assert result is not None
        assert "2024-01-15" in result

    def test_unix_timestamp(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_time

        assert _parse_time(1700000000) is not None
        assert _parse_time("1700000000") is not None
        assert _parse_time(1700000000.123) is not None

    def test_none_and_invalid(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_time

        assert _parse_time(None) is None
        assert _parse_time("") is None
        assert _parse_time("invalid-date") is None
        assert _parse_time([]) is None


class TestParseSize:
    def test_byte_and_unit_values(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_size

        assert _parse_size(0) == 0
        assert _parse_size(1536) == 1536
        assert _parse_size("1.5K") == 1536
        assert _parse_size("2 KB") == 2048
        assert _parse_size("1 MiB") == 1048576

    def test_invalid_values_are_unknown(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_size

        assert _parse_size(None) is None
        assert _parse_size("-") is None
        assert _parse_size(-1) is None
        assert _parse_size(True) is None


class TestNginxTimeExtraction:
    def test_table_format_with_time(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = """
        <table>
        <tr><td><a href="file1.pdf">file1.pdf</a></td><td>2024-01-15 10:30</td></tr>
        <tr><td><a href="file2.pdf">file2.pdf</a></td><td>2024-06-20 14:00</td></tr>
        </table>
        """
        result = _parse_nginx(html, "http://x/")
        assert result[0]["mtime"] is not None
        assert result[1]["mtime"] is not None
        assert result[0]["name"] == "file2.pdf"  # newer first

    def test_pre_format_with_time(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = """
        <pre>
        <a href="old.txt">old.txt</a>    15-Jan-2024 10:30:00 GMT
        <a href="new.txt">new.txt</a>    20-Dec-2024 14:00:00 GMT
        </pre>
        """
        result = _parse_nginx(html, "http://x/")
        assert len(result) == 2
        assert result[0]["name"] == "new.txt"
        assert result[0]["mtime"] is not None

    def test_no_time_available(self):
        from app.services.wechat_work_bot.intranet_parser import _parse_nginx

        html = '<a href="file.txt">file.txt</a>'
        result = _parse_nginx(html, "http://x/")
        assert result[0]["mtime"] is None


# ── TestFileToken ───────────────────────────────────────────────

class TestFileToken:
    def test_generate_and_verify(self):
        from app.services.wechat_work_bot.file_token import generate_file_token, verify_file_token

        token = generate_file_token("source-123", "http://nas/file.pdf", 3600)
        result = verify_file_token(token)
        assert result is not None
        assert result["sid"] == "source-123"
        assert result["url"] == "http://nas/file.pdf"

    def test_expired_token(self):
        from app.services.wechat_work_bot.file_token import generate_file_token, verify_file_token

        token = generate_file_token("src", "http://x/f", ttl_seconds=-10)
        result = verify_file_token(token)
        assert result is None

    def test_tampered_token(self):
        from app.services.wechat_work_bot.file_token import verify_file_token

        result = verify_file_token("invalid-token-data")
        assert result is None

    def test_empty_token(self):
        from app.services.wechat_work_bot.file_token import verify_file_token

        result = verify_file_token("")
        assert result is None


# ── TestBotFileCommand ──────────────────────────────────────────

class TestBotFileCommand:
    @pytest.mark.asyncio
    async def test_file_no_args(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-file1", username="fileuser1", email="f1@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_file([], {})
        assert "用法" in result or "Usage" in result.lower() or "用法" in result

    @pytest.mark.asyncio
    async def test_file_no_sources(self, db_session: AsyncSession):
        user = User(**_make_user_kwargs(id="user-file2", username="fileuser2", email="f2@ex.com"))
        db_session.add(user)
        await db_session.flush()
        handlers = await _make_handlers(db_session, flowy_user_id=user.id)
        result = await handlers.handle_file(["test.pdf"], {})
        assert "暂无" in result or "配置" in result

    @pytest.mark.asyncio
    async def test_file_search_uses_source_basic_auth(self, db_session: AsyncSession):
        """The /file command can search a protected intranet source."""
        from unittest.mock import patch

        from app.core.crypto import encrypt_token
        from app.models.wechat_work_bot import IntranetSource

        user = User(
            **_make_user_kwargs(
                id="user-file-auth",
                username="fileauth",
                email="fileauth@example.com",
            )
        )
        db_session.add(user)
        db_session.add(
            IntranetSource(
                id="src-file-auth",
                name="Protected",
                url="http://10.20.0.8/files/",
                source_type="json",
                file_ttl_seconds=3600,
                auth_username="reader",
                auth_password_encrypted=encrypt_token("source-secret"),
            )
        )
        await db_session.flush()

        async def protected_parser(_url, _source_type, auth=None):
            if auth != ("reader", "source-secret"):
                raise PermissionError("missing Basic Auth")
            return [
                {
                    "name": "protected.txt",
                    "url": "http://10.20.0.8/files/protected.txt",
                    "mtime": None,
                    "size": 4,
                }
            ]

        with patch(
            "app.services.wechat_work_bot.intranet_parser.parse_source",
            side_effect=protected_parser,
        ):
            handlers = await _make_handlers(db_session, flowy_user_id=user.id)
            result = await handlers.handle_file(["protected"], {})

        assert "protected.txt" in result
        assert "部分源获取失败" not in result

    @pytest.mark.asyncio
    async def test_file_results_display_known_and_unknown_sizes(
        self, db_session: AsyncSession
    ):
        from unittest.mock import patch

        from app.models.wechat_work_bot import IntranetSource

        user = User(
            **_make_user_kwargs(
                id="user-file-size",
                username="filesize",
                email="filesize@example.com",
            )
        )
        db_session.add(user)
        db_session.add(
            IntranetSource(
                id="src-file-size",
                name="Sized files",
                url="http://10.20.0.8/files/",
                source_type="json",
                file_ttl_seconds=3600,
            )
        )
        await db_session.flush()
        files = [
            {
                "name": "known.bin",
                "url": "http://10.20.0.8/files/known.bin",
                "mtime": None,
                "size": 1536,
            },
            {
                "name": "unknown.bin",
                "url": "http://10.20.0.8/files/unknown.bin",
                "mtime": None,
                "size": None,
            },
        ]

        with patch(
            "app.services.wechat_work_bot.intranet_parser.parse_source",
            return_value=files,
        ):
            handlers = await _make_handlers(db_session, flowy_user_id=user.id)
            result = await handlers.handle_file([".bin"], {})

        assert "known.bin" in result
        assert "大小：1.5 KB" in result
        assert "unknown.bin" in result
        assert "大小：未知" in result

    @pytest.mark.asyncio
    async def test_file_regex_match(self, db_session: AsyncSession):
        from unittest.mock import patch

        from app.models.wechat_work_bot import IntranetSource

        user = User(**_make_user_kwargs(id="user-file3", username="fileuser3", email="f3@ex.com"))
        db_session.add(user)
        await db_session.flush()
        source = IntranetSource(
            id="src-regex", name="Test", url="http://x/",
            source_type="json", file_ttl_seconds=3600,
            created_at=NOW, updated_at=NOW,
        )
        db_session.add(source)
        await db_session.flush()

        mock_files = [
            {"name": "report.pdf", "url": "http://x/report.pdf", "mtime": None},
            {"name": "data.csv", "url": "http://x/data.csv", "mtime": None},
            {"name": "notes.pdf", "url": "http://x/notes.pdf", "mtime": None},
            {"name": "image.png", "url": "http://x/image.png", "mtime": None},
        ]

        with patch("app.services.wechat_work_bot.intranet_parser.parse_source", return_value=mock_files):
            handlers = await _make_handlers(db_session, flowy_user_id=user.id)
            # Regex: match files ending in .pdf
            result = await handlers.handle_file([r"\.pdf$"], {})
            assert "report.pdf" in result
            assert "notes.pdf" in result
            assert "data.csv" not in result
            assert "image.png" not in result

    @pytest.mark.asyncio
    async def test_file_limit_10_results(self, db_session: AsyncSession):
        from unittest.mock import patch

        from app.models.wechat_work_bot import IntranetSource

        user = User(**_make_user_kwargs(id="user-file4", username="fileuser4", email="f4@ex.com"))
        db_session.add(user)
        await db_session.flush()
        source = IntranetSource(
            id="src-limit", name="Test", url="http://x/",
            source_type="json", file_ttl_seconds=3600,
            created_at=NOW, updated_at=NOW,
        )
        db_session.add(source)
        await db_session.flush()

        mock_files = [
            {"name": f"file{i:02d}.txt", "url": f"http://x/file{i:02d}.txt",
             "mtime": f"2024-01-{i+1:02d} 10:00:00"}
            for i in range(15)
        ]

        with patch("app.services.wechat_work_bot.intranet_parser.parse_source", return_value=mock_files):
            handlers = await _make_handlers(db_session, flowy_user_id=user.id)
            result = await handlers.handle_file(["file"], {})
            # Should show 10 results, note total is 15
            assert "15" in result  # total count
            assert "仅显示最新 10 个" in result
            result_lines = result.splitlines()
            headings = [
                line
                for line in result_lines
                if any(line.startswith(f"{index}. **") for index in range(1, 11))
            ]
            assert len(headings) == 10
            assert result.count("[下载文件](") == 10
            assert "| 文件名 |" not in result
            assert "| --- |" not in result
