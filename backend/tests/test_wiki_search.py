"""Tests for wiki fuzzy search and bot wiki command."""

import uuid
from datetime import datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.models.wiki import WikiPage
from app.services import wiki_service
from app.services.wechat_work_bot.handlers import CommandHandlers
from app.services.wechat_work_bot.service import split_for_wecom

NOW = datetime.now().isoformat()


def _make_user_kwargs(**kwargs) -> dict:
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


async def _create_user(db_session: AsyncSession, **kwargs) -> User:
    user = User(**_make_user_kwargs(**kwargs))
    db_session.add(user)
    await db_session.flush()
    return user


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


async def _create_wiki_page(
    db_session: AsyncSession,
    owner_id: str,
    title: str,
    content: str = "",
    tags: str = "",
    is_public: bool = False,
    weight: int = 0,
    page_id: str | None = None,
) -> WikiPage:
    page = WikiPage(
        id=page_id or str(uuid.uuid4()),
        owner_id=owner_id,
        title=title,
        slug=title.lower().replace(" ", "-"),
        content=content,
        tags=tags,
        is_public=is_public,
        weight=weight,
        created_at=NOW,
        updated_at=NOW,
    )
    db_session.add(page)
    await db_session.flush()
    return page


# ─── Fuzzy Search Tests ────────────────────────────────────────


class TestFuzzySearch:

    @pytest.mark.asyncio
    async def test_empty_keyword_returns_empty(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u1", username="u1", email="u1@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Guide")
        result = await wiki_service.fuzzy_search(db_session, "", user.id)
        assert result == []

    @pytest.mark.asyncio
    async def test_whitespace_keyword_returns_empty(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u2", username="u2", email="u2@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Guide")
        result = await wiki_service.fuzzy_search(db_session, "   ", user.id)
        assert result == []

    @pytest.mark.asyncio
    async def test_title_exact_match_first(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u3", username="u3", email="u3@ex.com")
        # "Docker" in content but not title
        await _create_wiki_page(db_session, user.id, "Other Page", content="Useful docker tips", is_public=True)
        # Exact title match
        await _create_wiki_page(db_session, user.id, "Docker", content="Some content", is_public=True)
        result = await wiki_service.fuzzy_search(db_session, "Docker", user.id)
        # Exact title match is far ahead → dominant result, only one returned.
        assert len(result) == 1
        assert result[0].title == "Docker"

    @pytest.mark.asyncio
    async def test_title_partial_match(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u4", username="u4", email="u4@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker 入门指南", is_public=True)
        await _create_wiki_page(db_session, user.id, "Kubernetes 入门", content="Docker 相关", is_public=True)
        result = await wiki_service.fuzzy_search(db_session, "Docker", user.id)
        assert len(result) == 2
        # Title match should rank higher
        assert result[0].title == "Docker 入门指南"

    @pytest.mark.asyncio
    async def test_content_match(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u5", username="u5", email="u5@ex.com")
        await _create_wiki_page(db_session, user.id, "My Notes", content="Learn about docker containers", is_public=True)
        result = await wiki_service.fuzzy_search(db_session, "docker", user.id)
        assert len(result) == 1
        assert result[0].title == "My Notes"

    @pytest.mark.asyncio
    async def test_tag_match(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u6", username="u6", email="u6@ex.com")
        await _create_wiki_page(db_session, user.id, "Some Page", tags="docker,kubernetes,devops", is_public=True)
        result = await wiki_service.fuzzy_search(db_session, "devops", user.id)
        assert len(result) == 1

    @pytest.mark.asyncio
    async def test_relevance_ranking(self, db_session: AsyncSession):
        """Title match > tags match > content match."""
        user = await _create_user(db_session, id="u7", username="u7", email="u7@ex.com")
        # Content match only (lowest score)
        await _create_wiki_page(db_session, user.id, "Random Title", content="docker is great", is_public=True)
        # Tag match (medium score)
        await _create_wiki_page(db_session, user.id, "Another Page", tags="docker,tools", is_public=True)
        # Title match (highest score)
        await _create_wiki_page(db_session, user.id, "Docker Tutorial", content="Some content", is_public=True)

        result = await wiki_service.fuzzy_search(db_session, "docker", user.id)
        assert len(result) == 3
        assert result[0].title == "Docker Tutorial"
        assert result[1].title == "Another Page"
        assert result[2].title == "Random Title"

    @pytest.mark.asyncio
    async def test_public_only_for_non_related(self, db_session: AsyncSession):
        """Non-related users can only see public pages."""
        owner = await _create_user(db_session, id="u8", username="u8", email="u8@ex.com")
        viewer = await _create_user(db_session, id="u9", username="u9", email="u9@ex.com")
        # Private page (should not be visible to viewer)
        await _create_wiki_page(db_session, owner.id, "Private Docker", content="secret", is_public=False)
        # Public page (should be visible)
        await _create_wiki_page(db_session, owner.id, "Public Docker", content="shared", is_public=True)

        result = await wiki_service.fuzzy_search(db_session, "Docker", viewer.id)
        assert len(result) == 1
        assert result[0].title == "Public Docker"

    @pytest.mark.asyncio
    async def test_related_priority(self, db_session: AsyncSession):
        """Related users' private pages should be searchable."""
        owner = await _create_user(db_session, id="u10", username="u10", email="u10@ex.com")
        viewer = await _create_user(db_session, id="u11", username="u11", email="u11@ex.com")
        # Private page from related user
        await _create_wiki_page(db_session, owner.id, "Team Docker", content="internal", is_public=False)

        # Without related_user_ids: shouldn't see it
        result = await wiki_service.fuzzy_search(db_session, "Docker", viewer.id, related_user_ids=[])
        assert len(result) == 0

        # With related_user_ids: should see it
        result = await wiki_service.fuzzy_search(db_session, "Docker", viewer.id, related_user_ids=[owner.id])
        assert len(result) == 1
        assert result[0].title == "Team Docker"

    @pytest.mark.asyncio
    async def test_no_results(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u12", username="u12", email="u12@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Guide", is_public=True)
        result = await wiki_service.fuzzy_search(db_session, "Kubernetes", user.id)
        assert result == []

    @pytest.mark.asyncio
    async def test_weight_priority(self, db_session: AsyncSession):
        """Higher weight should rank higher when content relevance is similar."""
        user = await _create_user(db_session, id="u13", username="u13", email="u13@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Low", content="docker", is_public=True, weight=8)
        await _create_wiki_page(db_session, user.id, "Docker High", content="docker", is_public=True, weight=10)

        result = await wiki_service.fuzzy_search(db_session, "docker", user.id)
        assert len(result) == 2
        assert result[0].title == "Docker High"

    @pytest.mark.asyncio
    async def test_multi_token_search(self, db_session: AsyncSession):
        """Search with multiple tokens."""
        user = await _create_user(db_session, id="u14", username="u14", email="u14@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Compose Guide", content="multi container", is_public=True)
        await _create_wiki_page(db_session, user.id, "Docker Only", content="single container", is_public=True)
        await _create_wiki_page(db_session, user.id, "Compose Only", content="docker compose", is_public=True)

        result = await wiki_service.fuzzy_search(db_session, "Docker Compose", user.id)
        assert len(result) == 3
        # "Docker Compose Guide" matches both tokens in title - should be first
        assert result[0].title == "Docker Compose Guide"

    @pytest.mark.asyncio
    async def test_user_can_see_own_private_pages(self, db_session: AsyncSession):
        """User should see their own private pages."""
        user = await _create_user(db_session, id="u15", username="u15", email="u15@ex.com")
        await _create_wiki_page(db_session, user.id, "My Private Docker", is_public=False)
        result = await wiki_service.fuzzy_search(db_session, "Docker", user.id)
        assert len(result) == 1


# ─── Handle Wiki Tests ────────────────────────────────────────


class TestHandleWiki:

    @pytest.mark.asyncio
    async def test_unbound_user(self, db_session: AsyncSession):
        bot_user = await _create_bot_user(db_session, "wx-wiki-1", flowy_user_id=None)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-1")
        result = await handlers.handle_wiki(["test"], {})
        assert "绑定" in result

    @pytest.mark.asyncio
    async def test_no_results(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u20", username="u20", email="u20@ex.com")
        bot_user = await _create_bot_user(db_session, "wx-wiki-2", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-2")
        result = await handlers.handle_wiki(["nonexistent"], {})
        assert "未找到" in result

    @pytest.mark.asyncio
    async def test_single_result_returns_content(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u21", username="u21", email="u21@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Tips", content="# Docker\n\nUse docker ps", is_public=True)
        bot_user = await _create_bot_user(db_session, "wx-wiki-3", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-3")
        result = await handlers.handle_wiki(["Docker"], {})
        assert "Docker Tips" in result
        assert "Use docker ps" in result
        # Should NOT have numbered list
        assert "1." not in result

    @pytest.mark.asyncio
    async def test_multiple_results_returns_list(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u22", username="u22", email="u22@ex.com")
        await _create_wiki_page(db_session, user.id, "Docker Basics", content="basics", is_public=True)
        await _create_wiki_page(db_session, user.id, "Docker Advanced", content="advanced", is_public=True)
        await _create_wiki_page(db_session, user.id, "Docker Compose", content="compose", is_public=True)
        bot_user = await _create_bot_user(db_session, "wx-wiki-4", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-4")
        result = await handlers.handle_wiki(["Docker"], {})
        assert "1." in result
        assert "2." in result
        assert "3." in result
        assert "回复序号" in result
        # Should set pending_wiki_results
        assert handlers.pending_wiki_results is not None
        assert len(handlers.pending_wiki_results) == 3

    @pytest.mark.asyncio
    async def test_list_recent_pages(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u23", username="u23", email="u23@ex.com")
        await _create_wiki_page(db_session, user.id, "Page 1")
        await _create_wiki_page(db_session, user.id, "Page 2")
        bot_user = await _create_bot_user(db_session, "wx-wiki-5", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-5")
        result = await handlers.handle_wiki([], {})
        assert "最近的知识库页面" in result
        assert "Page 1" in result
        assert "Page 2" in result

    @pytest.mark.asyncio
    async def test_add_wiki_page(self, db_session: AsyncSession):
        user = await _create_user(db_session, id="u24", username="u24", email="u24@ex.com")
        bot_user = await _create_bot_user(db_session, "wx-wiki-6", flowy_user_id=user.id)
        handlers = CommandHandlers(db=db_session, bot_user=bot_user, wechat_user_id="wx-wiki-6")
        result = await handlers.handle_wiki(["add", "测试标题", "|", "测试内容"], {})
        assert "已创建" in result
        assert "测试标题" in result


# ─── Split for WeChat Tests ────────────────────────────────────


class TestSplitForWecom:

    def test_short_text_not_split(self):
        text = "Hello world"
        result = split_for_wecom(text)
        assert result == [text]

    def test_long_text_split_by_paragraph(self):
        # Create text that exceeds 100 bytes (use smaller limit for testing)
        para1 = "A" * 60
        para2 = "B" * 60
        text = f"{para1}\n\n{para2}"
        result = split_for_wecom(text, max_bytes=100)
        assert len(result) == 2
        assert result[0] == para1
        assert result[1] == para2

    def test_merge_paragraphs(self):
        # Two small paragraphs should be merged into one chunk
        para1 = "A" * 30
        para2 = "B" * 30
        text = f"{para1}\n\n{para2}"
        result = split_for_wecom(text, max_bytes=100)
        assert len(result) == 1
        assert para1 in result[0]
        assert para2 in result[0]

    def test_single_long_paragraph_hard_split(self):
        # Single paragraph exceeding limit should be hard-split
        text = "A" * 250
        result = split_for_wecom(text, max_bytes=100)
        assert len(result) == 3  # 100 + 100 + 50
        assert all(len(chunk.encode("utf-8")) <= 100 for chunk in result)

    def test_chinese_text_byte_boundary(self):
        # Chinese characters are 3 bytes each in UTF-8
        text = "中" * 50  # 150 bytes
        result = split_for_wecom(text, max_bytes=100)
        assert len(result) >= 2
        # Each chunk should be valid UTF-8
        for chunk in result:
            chunk.encode("utf-8")  # Should not raise
            assert len(chunk.encode("utf-8")) <= 100

    def test_empty_text(self):
        result = split_for_wecom("")
        assert result == [""]

    def test_exact_limit(self):
        # Text exactly at limit should not be split
        text = "A" * 100
        result = split_for_wecom(text, max_bytes=100)
        assert result == [text]

    def test_mixed_paragraph_lengths(self):
        # Mix of short and long paragraphs
        short = "Short"
        long = "L" * 200
        text = f"{short}\n\n{long}\n\n{short}"
        result = split_for_wecom(text, max_bytes=100)
        # Short + short might merge, long is split
        assert len(result) >= 2
        # Verify all chunks are within limit
        for chunk in result:
            assert len(chunk.encode("utf-8")) <= 100
