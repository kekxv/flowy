"""Tests for WeChat Work bot new features: command test, intranet sources, file proxy."""

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User
from app.models.wechat_work_bot import IntranetSource


def _build_transport(db_session):
    """Override the get_db dependency to use test session."""
    from app.main import app as _app

    async def override_get_db():
        yield db_session

    _app.dependency_overrides[__import__("app.database", fromlist=["get_db"]).get_db] = (
        override_get_db
    )
    transport = ASGITransport(app=_app, raise_app_exceptions=False)
    return transport


async def _login_admin(client: AsyncClient, username: str = "admin", password: str = "password123") -> str:
    """Login as admin and return access token."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": username, "password": password},
    )
    return resp.json()["access_token"]


async def _setup_admin(db_session: AsyncSession) -> User:
    """Create an admin user for testing."""
    import bcrypt

    admin = User(
        id="admin-test-001",
        username="admin",
        email="admin@test.com",
        display_name="Admin",
        role="admin",
        password_hash=bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode(),
    )
    db_session.add(admin)
    await db_session.flush()
    return admin


# ─── Command Test Endpoint ──────────────────────────────────────


class TestCommandTest:
    @pytest.mark.asyncio
    async def test_test_command_help(self, db_session: AsyncSession):
        """Test command endpoint returns help text."""
        await _setup_admin(db_session)
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.post(
                "/api/v1/wechat-work-bot/test-command",
                json={"command": "/help"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["response"]
        assert "help" in data["response"].lower() or "指令" in data["response"]
        assert data["error"] is None

    @pytest.mark.asyncio
    async def test_test_command_invalid(self, db_session: AsyncSession):
        """Test command with invalid command returns error."""
        await _setup_admin(db_session)
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.post(
                "/api/v1/wechat-work-bot/test-command",
                json={"command": "/invalid_command_xyz"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["error"] is not None
        assert "无法识别" in data["error"]

    @pytest.mark.asyncio
    async def test_test_command_requires_admin(self, db_session: AsyncSession):
        """Test command endpoint requires admin role."""
        import bcrypt

        user = User(
            id="user-test-001",
            username="regular",
            email="regular@test.com",
            display_name="Regular",
            role="member",
            password_hash=bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode(),
        )
        db_session.add(user)
        await db_session.flush()

        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={"username_or_email": "regular", "password": "password123"},
            )
            token = resp.json()["access_token"]
            resp = await client.post(
                "/api/v1/wechat-work-bot/test-command",
                json={"command": "/help"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403


# ─── Intranet Sources CRUD ──────────────────────────────────────


class TestIntranetSourcesCRUD:
    @pytest.mark.asyncio
    async def test_create_source(self, db_session: AsyncSession):
        """Create an intranet source."""
        await _setup_admin(db_session)
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.post(
                "/api/v1/wechat-work-bot/intranet-sources",
                json={
                    "name": "Test NAS",
                    "url": "http://192.168.1.100/files/",
                    "source_type": "nginx",
                    "file_ttl_seconds": 7200,
                },
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test NAS"
        assert data["url"] == "http://192.168.1.100/files/"
        assert data["source_type"] == "nginx"
        assert data["file_ttl_seconds"] == 7200
        assert data["id"]

    @pytest.mark.asyncio
    async def test_list_sources(self, db_session: AsyncSession):
        """List intranet sources."""
        await _setup_admin(db_session)

        # Add a source directly
        source = IntranetSource(
            id="src-test-001",
            name="Test Source",
            url="http://test/files/",
            source_type="json",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()

        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.get(
                "/api/v1/wechat-work-bot/intranet-sources",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert any(s["name"] == "Test Source" for s in data)

    @pytest.mark.asyncio
    async def test_update_source(self, db_session: AsyncSession):
        """Update an intranet source."""
        await _setup_admin(db_session)

        source = IntranetSource(
            id="src-test-002",
            name="Old Name",
            url="http://old/",
            source_type="nginx",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()

        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.put(
                "/api/v1/wechat-work-bot/intranet-sources/src-test-002",
                json={"name": "New Name", "file_ttl_seconds": 7200},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "New Name"
        assert data["file_ttl_seconds"] == 7200
        assert data["url"] == "http://old/"  # unchanged

    @pytest.mark.asyncio
    async def test_delete_source(self, db_session: AsyncSession):
        """Delete an intranet source."""
        await _setup_admin(db_session)

        source = IntranetSource(
            id="src-test-003",
            name="To Delete",
            url="http://delete/",
            source_type="json",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()

        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            token = await _login_admin(client)
            resp = await client.delete(
                "/api/v1/wechat-work-bot/intranet-sources/src-test-003",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["ok"] is True

        # Verify deleted
        from sqlalchemy import select

        result = await db_session.execute(select(IntranetSource).where(IntranetSource.id == "src-test-003"))
        assert result.scalar_one_or_none() is None


# ─── Download Proxy ─────────────────────────────────────────────


class TestDownloadProxy:
    @pytest.mark.asyncio
    async def test_invalid_token(self, db_session: AsyncSession):
        """Download with invalid token returns 401."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/wechat-work-bot/intranet/download?token=invalid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_expired_token(self, db_session: AsyncSession):
        """Download with expired token returns 401."""
        from app.services.wechat_work_bot.file_token import generate_file_token

        token = generate_file_token("src-001", "http://test/file.pdf", ttl_seconds=-10)
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/wechat-work-bot/intranet/download?token={token}")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_source_not_found(self, db_session: AsyncSession):
        """Download with valid token but missing source returns 404."""
        from app.services.wechat_work_bot.file_token import generate_file_token

        token = generate_file_token("nonexistent-source", "http://test/file.pdf", 3600)
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get(f"/api/v1/wechat-work-bot/intranet/download?token={token}")
        assert resp.status_code == 404


# ─── More handle_file Tests ─────────────────────────────────────


class TestHandleFileRegex:
    @pytest.mark.asyncio
    async def test_invalid_regex_fallback(self, db_session: AsyncSession):
        """Invalid regex falls back to substring matching."""
        from unittest.mock import patch

        from app.models.wechat_work_bot import IntranetSource

        user = User(
            id="user-regex-001",
            username="regexuser",
            email="regex@test.com",
            display_name="Regex",
            role="member",
            password_hash="hash",
        )
        db_session.add(user)
        await db_session.flush()

        source = IntranetSource(
            id="src-regex-001",
            name="Test",
            url="http://x/",
            source_type="json",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()

        mock_files = [
            {"name": "report(1).pdf", "url": "http://x/report(1).pdf", "mtime": None},
            {"name": "data.csv", "url": "http://x/data.csv", "mtime": None},
        ]

        with patch("app.services.wechat_work_bot.intranet_parser.parse_source", return_value=mock_files):
            from app.services.wechat_work_bot.handlers import CommandHandlers

            handlers = CommandHandlers(db=db_session, bot_user=None, wechat_user_id="wx-test")
            # "[" is invalid regex (unclosed bracket), should fallback to substring
            result = await handlers.handle_file(["report("], {})
            assert "report(1).pdf" in result

    @pytest.mark.asyncio
    async def test_time_sort_order(self, db_session: AsyncSession):
        """Results sorted by time descending."""
        from unittest.mock import patch

        from app.models.wechat_work_bot import IntranetSource

        user = User(
            id="user-sort-001",
            username="sortuser",
            email="sort@test.com",
            display_name="Sort",
            role="member",
            password_hash="hash",
        )
        db_session.add(user)
        await db_session.flush()

        source = IntranetSource(
            id="src-sort-001",
            name="Test",
            url="http://x/",
            source_type="json",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()

        mock_files = [
            {"name": "old.txt", "url": "http://x/old.txt", "mtime": "2024-01-01 10:00:00"},
            {"name": "new.txt", "url": "http://x/new.txt", "mtime": "2024-12-01 10:00:00"},
            {"name": "mid.txt", "url": "http://x/mid.txt", "mtime": "2024-06-01 10:00:00"},
        ]

        with patch("app.services.wechat_work_bot.intranet_parser.parse_source", return_value=mock_files):
            from app.services.wechat_work_bot.handlers import CommandHandlers

            handlers = CommandHandlers(db=db_session, bot_user=None, wechat_user_id="wx-test")
            result = await handlers.handle_file([".txt"], {})
            # Check order: new.txt first, then mid.txt, then old.txt
            lines = result.split("\n")
            file_lines = [l for l in lines if l.startswith("| ") and ".txt" in l]
            assert "new.txt" in file_lines[0]
            assert "mid.txt" in file_lines[1]
            assert "old.txt" in file_lines[2]
