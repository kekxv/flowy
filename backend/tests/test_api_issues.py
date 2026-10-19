"""Tests for issue API endpoints."""

from urllib.parse import quote

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


def _build_transport(db_session):
    """Override get_db dependency."""
    from app.database import get_db

    app.dependency_overrides[get_db] = lambda: (yield db_session)
    return ASGITransport(app=app, raise_app_exceptions=True)


async def _login(client, username="testuser", password="password123"):
    """Helper to login and return auth headers."""
    resp = await client.post(
        "/api/v1/auth/login",
        json={
            "username_or_email": username,
            "password": password,
        },
    )
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


class TestIssueAPI:
    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "assignments,payload,expected",
        [
            ([("user-001", "member")], {"status": status}, 200)
            for status in (
                "open", "in_progress", "proposed", "accepted",
                "resolved", "closed", "cancelled", "rejected",
            )
        ] + [
            ([], {"status": "in_progress"}, 403),
            ([("admin-001", "member")], {"status": "in_progress"}, 403),
            ([("user-001", "member"), ("admin-001", "member")], {"status": "in_progress"}, 403),
            ([("user-001", "member"), ("admin-001", "tester")], {"status": "in_progress"}, 403),
            ([("user-001", "member"), ("user-001", "tester")], {"status": "in_progress"}, 403),
            ([("user-001", "member")], {"title": "Not allowed"}, 403),
            ([("user-001", "member")], {"status": "in_progress", "title": "Not allowed"}, 403),
            ([("user-001", "project_lead")], {"status": "in_progress"}, 200),
        ],
    )
    async def test_sole_member_status_permissions(
        self, db_session, test_user, test_admin, assignments, payload, expected
    ):
        from app.models.issue import Issue, issue_assignees

        db_session.add(Issue(
            id="sole-member-issue", title="Original title", issue_type="bug",
            reporter_id=test_admin.id,
        ))
        await db_session.flush()
        for user_id, role in assignments:
            await db_session.execute(issue_assignees.insert().values(
                issue_id="sole-member-issue", user_id=user_id, role=role,
            ))
        await db_session.commit()
        async with AsyncClient(transport=_build_transport(db_session), base_url="http://test") as client:
            headers = await _login(client)
            response = await client.put(
                "/api/v1/issues/sole-member-issue", json=payload, headers=headers,
            )
            assert response.status_code == expected
            detail = await client.get("/api/v1/issues/sole-member-issue", headers=headers)
        assert detail.json()["title"] == "Original title"
        assert detail.json()["status"] == (payload["status"] if expected == 200 else "open")

    @pytest.mark.asyncio
    async def test_issue_schedule_dates_are_saved_and_returned(self, db_session, test_user):
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            created = await client.post(
                "/api/v1/issues",
                json={"title": "Scheduled", "start_date": "2026-08-01", "due_date": "2026-08-15"},
                headers=headers,
            )
            issue_id = created.json()["id"]
            response = await client.get(f"/api/v1/issues/{issue_id}", headers=headers)

        assert response.json()["start_date"] == "2026-08-01"
        assert response.json()["due_date"] == "2026-08-15"

    @pytest.mark.asyncio
    async def test_wiki_upload_limit_endpoint_returns_configured_limit(
        self, db_session, test_user
    ):
        """The static upload-limit endpoint is not captured as a Wiki page ID."""
        from app.models.settings import AppSetting

        db_session.add(AppSetting(key="wiki_upload_max_mb", value="12"))
        await db_session.flush()
        transport = _build_transport(db_session)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            response = await client.get("/api/v1/wiki/upload-limit", headers=headers)

        assert response.status_code == 200
        assert response.json() == {"limit": 12 * 1024 * 1024, "limit_mb": 12}

    @pytest.mark.asyncio
    async def test_create_issue(self, db_session, test_user):
        """Create an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            resp = await client.post(
                "/api/v1/issues",
                json={
                    "title": "API Test Issue",
                    "description": "Created via API test",
                    "issue_type": "bug",
                    "priority": "high",
                },
                headers=headers,
            )
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
    async def test_list_issues_unassigned_filter(self, db_session, test_user):
        """The unassigned saved view only returns issues without assignees."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            await client.post("/api/v1/issues", json={"title": "Nobody owns this"}, headers=headers)
            await client.post(
                "/api/v1/issues",
                json={"title": "Owned", "assignees": [{"user_id": test_user.id, "role": "member"}]},
                headers=headers,
            )
            resp = await client.get(
                "/api/v1/issues", params={"unassigned": "true"}, headers=headers
            )
        assert resp.status_code == 200
        body = resp.json()
        titles = [item["title"] for item in body["data"]]
        assert "Nobody owns this" in titles
        assert "Owned" not in titles
        assert all(item["assignees"] == [] for item in body["data"])

    @pytest.mark.asyncio
    async def test_list_issues_overdue_filter(self, db_session, test_user):
        """The overdue saved view only returns active issues past their due date."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            await client.post(
                "/api/v1/issues",
                json={"title": "Late one", "due_date": "2020-01-01"},
                headers=headers,
            )
            await client.post(
                "/api/v1/issues",
                json={"title": "Later one", "due_date": "2999-01-01"},
                headers=headers,
            )
            resp = await client.get("/api/v1/issues", params={"overdue": "true"}, headers=headers)
        assert resp.status_code == 200
        titles = [item["title"] for item in resp.json()["data"]]
        assert "Late one" in titles
        assert "Later one" not in titles

    @pytest.mark.asyncio
    async def test_get_issue_detail(self, db_session, test_user):
        """Get issue detail."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            # Create
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Detail Test"}, headers=headers
            )
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
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Update Test"}, headers=headers
            )
            issue_id = create_resp.json()["id"]
            # Reporter can only change status to resolved or cancelled
            resp = await client.put(
                f"/api/v1/issues/{issue_id}",
                json={
                    "status": "resolved",
                },
                headers=headers,
            )
        assert resp.status_code == 200
        assert resp.json()["status"] == "resolved"

    @pytest.mark.asyncio
    async def test_update_issue_priority(self, db_session, test_admin):
        """Admin can update priority."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client, username="admin", password="password123")
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Priority Test"}, headers=headers
            )
            issue_id = create_resp.json()["id"]
            resp = await client.put(
                f"/api/v1/issues/{issue_id}",
                json={
                    "priority": "critical",
                },
                headers=headers,
            )
        assert resp.status_code == 200
        assert resp.json()["priority"] == "critical"

    @pytest.mark.asyncio
    async def test_create_comment(self, db_session, test_user):
        """Create a comment on an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Comment Test"}, headers=headers
            )
            issue_id = create_resp.json()["id"]
            resp = await client.post(
                f"/api/v1/issues/{issue_id}/comments",
                json={
                    "body": "This is a test comment",
                },
                headers=headers,
            )
        assert resp.status_code == 201
        data = resp.json()
        assert data["body"] == "This is a test comment"

    @pytest.mark.asyncio
    async def test_delete_comment_removes_base62_attachment(
        self, db_session, test_user, tmp_path, monkeypatch
    ):
        """Deleting a comment also removes its Base62-named attachment."""
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
        attachments_dir = tmp_path / "bot_attachments"
        attachments_dir.mkdir()
        attachment_path = attachments_dir / "AbC123xyz"
        attachment_path.write_bytes(b"attachment")

        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Attachment cleanup"}, headers=headers
            )
            issue_id = create_resp.json()["id"]
            comment_resp = await client.post(
                f"/api/v1/issues/{issue_id}/comments",
                json={"body": "[项目 报告.txt](attachment:AbC123xyz)"},
                headers=headers,
            )
            comment_id = comment_resp.json()["id"]
            response = await client.delete(
                f"/api/v1/issues/{issue_id}/comments/{comment_id}",
                headers=headers,
            )

        assert response.status_code == 204
        assert not attachment_path.exists()

    @pytest.mark.asyncio
    async def test_upload_comment_attachment_uses_wiki_limit_and_inserts_image_markdown(
        self, db_session, test_user, tmp_path, monkeypatch
    ):
        """Issue/comment uploads share Wiki's limit and use opaque .bin storage."""
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
        transport = _build_transport(db_session)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            response = await client.post(
                "/api/v1/bot-attachments/upload",
                files={"file": ("截图.any", b"image-data", "image/png")},
                headers=headers,
            )
            assert response.status_code == 200
            data = response.json()
            download = await client.get(data["url"])

        assert data["filename"].endswith(".bin")
        assert data["filename"].removesuffix(".bin").isalnum()
        assert data["markdown"] == f"![截图.any]({data['url']})"
        assert download.content == b"image-data"
        assert quote("截图.any") in download.headers["content-disposition"]

    @pytest.mark.asyncio
    async def test_upload_comment_attachment_rejects_file_over_wiki_limit(
        self, db_session, test_user, tmp_path, monkeypatch
    ):
        """The configurable Wiki upload limit also applies to comment attachments."""
        from app.models.settings import AppSetting

        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
        db_session.add(AppSetting(key="wiki_upload_max_mb", value="0.000001"))
        await db_session.flush()
        transport = _build_transport(db_session)

        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            response = await client.post(
                "/api/v1/bot-attachments/upload",
                files={"file": ("note.unsupported", b"too large", "application/octet-stream")},
                headers=headers,
            )

        assert response.status_code == 413

    @pytest.mark.asyncio
    async def test_assignee_logs_endpoint(self, db_session, test_user):
        """Get assignee activity log for an issue."""
        transport = _build_transport(db_session)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            headers = await _login(client)
            create_resp = await client.post(
                "/api/v1/issues", json={"title": "Log Test"}, headers=headers
            )
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
            await client.post(
                "/api/v1/issues", json={"title": "UniqueSearchTerm123"}, headers=headers
            )
            resp = await client.get("/api/v1/issues?q=UniqueSearchTerm123", headers=headers)
        assert resp.status_code == 200
        data = resp.json()
        assert data["meta"]["total"] >= 1
