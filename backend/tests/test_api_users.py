"""Tests for users API endpoints — admin user creation and password reset."""

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


async def _login(client, username="testuser", password="password123"):
    """Helper to login and return auth headers."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": username, "password": password},
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestAdminCreateUser:
    @pytest.mark.asyncio
    async def test_create_user_as_admin(self, db_session, test_admin):
        """Admin can create a new user via POST /users."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "newuser",
                    "email": "new@example.com",
                    "password": "secret123",
                    "display_name": "New User",
                    "role": "member",
                },
                headers=headers,
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["username"] == "newuser"
        assert data["email"] == "new@example.com"
        assert data["role"] == "member"
        assert data["display_name"] == "New User"
        assert "password_hash" not in data

    @pytest.mark.asyncio
    async def test_create_user_default_role(self, db_session, test_admin):
        """Created user defaults to member role when not specified."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "member1",
                    "email": "member1@example.com",
                    "password": "secret123",
                },
                headers=headers,
            )
        assert resp.status_code == 201
        assert resp.json()["role"] == "member"

    @pytest.mark.asyncio
    async def test_create_user_as_admin_role(self, db_session, test_admin):
        """Admin can create another admin user."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "admin2",
                    "email": "admin2@example.com",
                    "password": "secret123",
                    "role": "admin",
                },
                headers=headers,
            )
        assert resp.status_code == 201
        assert resp.json()["role"] == "admin"

    @pytest.mark.asyncio
    async def test_create_user_as_non_admin(self, db_session, test_user):
        """Non-admin user cannot create users."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "hacker",
                    "email": "hacker@example.com",
                    "password": "secret123",
                },
                headers=headers,
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_create_user_unauthorized(self, db_session):
        """Unauthenticated request to create user returns 401."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "hacker",
                    "email": "hacker@example.com",
                    "password": "secret123",
                },
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_user_duplicate_username(self, db_session, test_admin):
        """Creating user with duplicate username fails with 409."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")

            resp1 = await client.post(
                "/api/v1/users",
                json={
                    "username": "dupuser",
                    "email": "dup1@example.com",
                    "password": "pass123",
                },
                headers=headers,
            )
            assert resp1.status_code == 201

            resp2 = await client.post(
                "/api/v1/users",
                json={
                    "username": "dupuser",
                    "email": "dup2@example.com",
                    "password": "pass123",
                },
                headers=headers,
            )
            assert resp2.status_code == 409

    @pytest.mark.asyncio
    async def test_create_user_duplicate_email(self, db_session, test_admin):
        """Creating user with duplicate email fails with 409."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")

            resp1 = await client.post(
                "/api/v1/users",
                json={
                    "username": "user1",
                    "email": "same@example.com",
                    "password": "pass123",
                },
                headers=headers,
            )
            assert resp1.status_code == 201

            resp2 = await client.post(
                "/api/v1/users",
                json={
                    "username": "user2",
                    "email": "same@example.com",
                    "password": "pass123",
                },
                headers=headers,
            )
            assert resp2.status_code == 409

    @pytest.mark.asyncio
    async def test_created_user_can_login(self, db_session, test_admin):
        """User created by admin can log in successfully."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")

            # Admin creates user
            resp = await client.post(
                "/api/v1/users",
                json={
                    "username": "fresh",
                    "email": "fresh@example.com",
                    "password": "mypassword",
                },
                headers=headers,
            )
            assert resp.status_code == 201

            # New user can login
            login_resp = await client.post(
                "/api/v1/auth/login",
                json={"username_or_email": "fresh", "password": "mypassword"},
            )
            assert login_resp.status_code == 200
            assert "access_token" in login_resp.json()


class TestAdminResetPassword:
    @pytest.mark.asyncio
    async def test_reset_password_as_admin(self, db_session, test_admin, test_user):
        """Admin can reset a user's password, and new password works."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")

            resp = await client.put(
                f"/api/v1/users/{test_user.id}/reset-password",
                json={"new_password": "newpass456"},
                headers=headers,
            )
        assert resp.status_code == 204

        # Old password should no longer work
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            old_login = await client.post(
                "/api/v1/auth/login",
                json={"username_or_email": "testuser", "password": "password123"},
            )
        assert old_login.status_code == 401

        # New password should work
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            new_login = await client.post(
                "/api/v1/auth/login",
                json={"username_or_email": "testuser", "password": "newpass456"},
            )
        assert new_login.status_code == 200

    @pytest.mark.asyncio
    async def test_reset_password_as_non_admin(self, db_session, test_user):
        """Non-admin cannot reset another user's password."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)

            resp = await client.put(
                f"/api/v1/users/{test_user.id}/reset-password",
                json={"new_password": "hacked"},
                headers=headers,
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_reset_password_unauthorized(self, db_session, test_user):
        """Unauthenticated password reset returns 401."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.put(
                f"/api/v1/users/{test_user.id}/reset-password",
                json={"new_password": "hacked"},
            )
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_reset_password_nonexistent_user(self, db_session, test_admin):
        """Reset password for non-existent user returns 404."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")

            resp = await client.put(
                "/api/v1/users/nonexistent-id/reset-password",
                json={"new_password": "whocares"},
                headers=headers,
            )
        assert resp.status_code == 404
