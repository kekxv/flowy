"""Tests for auth API endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.models.user import User


def _build_transport(db_session):
    """Override the get_db dependency to use test session."""
    from app.main import app as _app

    async def override_get_db():
        yield db_session

    _app.dependency_overrides[__import__("app.database", fromlist=["get_db"]).get_db] = (
        override_get_db
    )
    transport = ASGITransport(app=_app, raise_app_exceptions=True)
    return transport


class TestRegister:
    @pytest.mark.asyncio
    async def test_register_success(self, db_session):
        """Register creates a user and returns user data."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "newuser",
                    "email": "new@example.com",
                    "password": "password123",
                },
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@example.com"
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_register_duplicate_username(self, db_session):
        """Register with duplicate username fails."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "dupuser",
                    "email": "dup1@example.com",
                    "password": "pass123",
                },
            )
            assert resp1.status_code == 201
            resp2 = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "dupuser",
                    "email": "dup2@example.com",
                    "password": "pass123",
                },
            )
            assert resp2.status_code == 409

    @pytest.mark.asyncio
    async def test_register_duplicate_email(self, db_session):
        """Register with duplicate email fails."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp1 = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "user1",
                    "email": "same@example.com",
                    "password": "pass123",
                },
            )
            assert resp1.status_code == 201
            resp2 = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "user2",
                    "email": "same@example.com",
                    "password": "pass123",
                },
            )
            assert resp2.status_code == 409

    @pytest.mark.asyncio
    async def test_first_user_is_admin(self, db_session):
        """First registered user gets admin role."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "admin1",
                    "email": "admin1@example.com",
                    "password": "pass123",
                },
            )
        assert resp.status_code == 201
        assert resp.json()["role"] == "admin"

    @pytest.mark.asyncio
    async def test_password_hashed_in_db(self, db_session):
        """Password is not stored as plaintext."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "hashtest",
                    "email": "hash@example.com",
                    "password": "secret123",
                },
            )

        result = await db_session.execute(
            __import__("sqlalchemy", fromlist=["select"])
            .select(User)
            .where(User.username == "hashtest")
        )
        user = result.scalar_one()
        assert user.password_hash != "secret123"
        assert user.password_hash.startswith("$2")  # bcrypt prefix


class TestLogin:
    @pytest.mark.asyncio
    async def test_login_success(self, db_session, test_user):
        """Login with correct credentials returns tokens."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "testuser",
                    "password": "password123",
                },
            )
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"

    @pytest.mark.asyncio
    async def test_login_wrong_password(self, db_session, test_user):
        """Login with wrong password fails."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "testuser",
                    "password": "wrongpassword",
                },
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_nonexistent_user(self, db_session):
        """Login for non-existent user fails."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "nouser",
                    "password": "password123",
                },
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_login_by_email(self, db_session, test_user):
        """Login with email instead of username works."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "test@example.com",
                    "password": "password123",
                },
            )
        assert resp.status_code == 200


class TestGetMe:
    @pytest.mark.asyncio
    async def test_get_me_unauthorized(self, db_session):
        """GET /me without token returns 401."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/auth/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_me_authorized(self, db_session, test_user):
        """GET /me with token returns user data."""
        transport = _build_transport(db_session)

        # Login first
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "testuser",
                    "password": "password123",
                },
            )
            token = login_resp.json()["access_token"]

            resp = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        data = resp.json()
        assert data["username"] == "testuser"


class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_health_check(self, db_session):
        """GET /health returns ok."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"


class TestRefreshToken:
    @pytest.mark.asyncio
    async def test_refresh_token_flow(self, db_session, test_user):
        """Login -> refresh -> get new tokens."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # Login
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={
                    "username_or_email": "testuser",
                    "password": "password123",
                },
            )
            refresh_token = login_resp.json()["refresh_token"]

            # Refresh
            refresh_resp = await client.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": refresh_token,
                },
            )
            assert refresh_resp.status_code == 200
            data = refresh_resp.json()
            assert "access_token" in data
            assert "refresh_token" in data
            # Token is valid (may be same if test runs within same second due to minute-level expiry)

    @pytest.mark.asyncio
    async def test_refresh_invalid_token(self, db_session):
        """Refresh with invalid token fails."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/auth/refresh",
                json={
                    "refresh_token": "invalid.token.here",
                },
            )
        assert resp.status_code == 401
