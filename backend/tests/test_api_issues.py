"""Tests for issue API endpoints."""

import pytest
from httpx import AsyncClient, ASGITransport

from app.main import app
from app.services.auth import hash_password
from app.models.user import User
from app.models.issue import Issue


def _build_transport(db_session):
    """Override get_db dependency."""
    from app.database import get_db
    app.dependency_overrides[get_db] = lambda: (yield db_session)
    return ASGITransport(app=app, raise_app_exceptions=True)


async def _login(client, username="testuser", password="password123"):
    """Helper to login and return auth headers."""
    resp = await client.post("/api/v1/auth/login", json={
        "username_or_email": username,
        "password": password,
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestIssueAPI:
    @pytest.mark.asyncio
    async def test_create_issue(self, db_session, test_user):
        """Create an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            resp = await client.post("/api/v1/issues", json={
                "title": "API Test Issue",
                "description": "Created via API test",
                "issue_type": "bug",
                "priority": "high",
            }, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["title"] == "API Test Issue"
        assert data["priority"] == "high"

    @pytest.mark.asyncio
    async def test_list_issues(self, db_session, test_user):
        """List issues."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            # Create an issue first
            await client.post("/api/v1/issues", json={"title": "List Test"}, headers=headers)
            # Then list
            resp = await client.get("/api/v1/issues", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["total"] >= 1
        assert len(data["data"]) >= 1

    @pytest.mark.asyncio
    async def test_get_issue_detail(self, db_session, test_user):
        """Get issue detail."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            # Create
            create_resp = await client.post("/api/v1/issues", json={"title": "Detail Test"}, headers=headers)
            issue_id = create_resp.json()["id"]
            # Get detail
            resp = await client.get(f"/api/v1/issues/{issue_id}", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["title"] == "Detail Test"

    @pytest.mark.asyncio
    async def test_get_issue_404(self, db_session, test_user):
        """Get non-existent issue returns 404."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            resp = await client.get("/api/v1/issues/nonexistent-id", headers=headers)
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_unauthenticated_access(self, db_session):
        """Unauthenticated requests return 401."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/issues")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_issue_as_reporter(self, db_session, test_user):
        """Reporter can change status to resolved."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            # Create
            create_resp = await client.post("/api/v1/issues", json={"title": "Update Test"}, headers=headers)
            issue_id = create_resp.json()["id"]
            # Reporter can only change status to resolved or cancelled
            resp = await client.put(f"/api/v1/issues/{issue_id}", json={
                "status": "resolved",
            }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"

    @pytest.mark.asyncio
    async def test_update_issue_priority(self, db_session, test_admin):
        """Admin can update priority."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")
            create_resp = await client.post("/api/v1/issues", json={"title": "Priority Test"}, headers=headers)
            issue_id = create_resp.json()["id"]
            resp = await client.put(f"/api/v1/issues/{issue_id}", json={
                "priority": "critical",
            }, headers=headers)
        assert resp.status_code == 200
        assert resp.json()["priority"] == "critical"

    @pytest.mark.asyncio
    async def test_create_comment(self, db_session, test_user):
        """Create a comment on an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            create_resp = await client.post("/api/v1/issues", json={"title": "Comment Test"}, headers=headers)
            issue_id = create_resp.json()["id"]
            resp = await client.post(f"/api/v1/issues/{issue_id}/comments", json={
                "body": "This is a test comment",
            }, headers=headers)
        assert resp.status_code == 201
        data = resp.json()
        assert data["body"] == "This is a test comment"

    @pytest.mark.asyncio
    async def test_assignee_logs_endpoint(self, db_session, test_user):
        """Get assignee activity log for an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            create_resp = await client.post("/api/v1/issues", json={"title": "Log Test"}, headers=headers)
            issue_id = create_resp.json()["id"]
            resp = await client.get(f"/api/v1/issues/{issue_id}/assignee-logs", headers=headers)
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_list_issues_unauthorized(self, db_session):
        """Cannot list issues without auth."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.get("/api/v1/issues")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_filter_issues_by_status(self, db_session, test_user):
        """Filter issues by status."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            await client.post("/api/v1/issues", json={"title": "Open Issue"}, headers=headers)
            resp = await client.get("/api/v1/issues?status=open", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["total"] >= 1

    @pytest.mark.asyncio
    async def test_search_issues(self, db_session, test_user):
        """Search issues by title."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            await client.post("/api/v1/issues", json={"title": "UniqueSearchTerm123"}, headers=headers)
            resp = await client.get("/api/v1/issues?q=UniqueSearchTerm123", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["total"] >= 1
