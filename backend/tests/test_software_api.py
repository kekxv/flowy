"""Tests for software component / version / dependency management API."""

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


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


def _build_transport(db_session: AsyncSession) -> ASGITransport:
    from app.main import app

    async def override_get_db():
        yield db_session

    from app.database import get_db

    app.dependency_overrides[get_db] = override_get_db
    return ASGITransport(app=app, raise_app_exceptions=True)


async def _login(client: AsyncClient, username: str) -> dict[str, str]:
    response = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": username, "password": "password123"},
    )
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


async def _create_component(client: AsyncClient, headers: dict, **overrides) -> dict:
    payload = {
        "name": "Web Console",
        "identifier": "flowy-frontend",
        "category": "frontend",
        "icon_key": "Web",
        "description": "The management UI",
    }
    payload.update(overrides)
    res = await client.post("/api/v1/software", json=payload, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


async def _create_version(client: AsyncClient, headers: dict, component_id: str, **overrides) -> dict:
    payload = {
        "version": "3.2.0",
        "note": "Completed kanban refactor",
        "artifact_type": "url",
        "download_url": "https://mirrors.example.com/web-v3.2.0.zip",
        "dependencies": [
            {"kind": "internal", "name": "Flowy Core API", "constraint": ">= v2.4.0"},
            {"kind": "external", "name": "Node.js", "constraint": ">= 18.x"},
        ],
    }
    payload.update(overrides)
    res = await client.post(
        f"/api/v1/software/{component_id}/versions", json=payload, headers=headers
    )
    assert res.status_code == 201, res.text
    return res.json()


@pytest.mark.asyncio
async def test_component_version_lifecycle(db_session):
    await _create_user(db_session, username="admin2", role="admin", email="a2@example.com")
    await _create_user(db_session, username="member2", email="m2@example.com")

    transport = _build_transport(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        admin_headers = await _login(client, "admin2")
        member_headers = await _login(client, "member2")

        # Initial stats are zero
        res = await client.get("/api/v1/software/stats", headers=member_headers)
        assert res.status_code == 200
        assert res.json() == {
            "component_count": 0,
            "version_count": 0,
            "artifact_count": 0,
            "dependency_count": 0,
        }

        # Member cannot create a component (admin only)
        res = await client.post(
            "/api/v1/software",
            json={"name": "X", "identifier": "x"},
            headers=member_headers,
        )
        assert res.status_code == 403

        # Admin creates a component
        comp = await _create_component(client, admin_headers)
        assert comp["name"] == "Web Console"
        assert comp["identifier"] == "flowy-frontend"
        assert comp["version_count"] == 0

        # Admin publishes a version with dependencies
        version = await _create_version(client, admin_headers, comp["id"])
        assert version["version"] == "3.2.0"
        assert version["artifact_type"] == "url"
        assert len(version["dependencies"]) == 2
        # Internal dependency resolves to the target display name if set
        internal = [d for d in version["dependencies"] if d["kind"] == "internal"][0]
        assert internal["name"] == "Flowy Core API"

        # List reflects latest version + counts
        res = await client.get("/api/v1/software", headers=member_headers)
        assert res.status_code == 200
        listing = res.json()
        assert len(listing) == 1
        assert listing[0]["latest_version"]["version"] == "3.2.0"
        assert listing[0]["version_count"] == 1
        assert listing[0]["dependency_count"] == 2

        # Stats updated
        res = await client.get("/api/v1/software/stats", headers=member_headers)
        stats = res.json()
        assert stats["component_count"] == 1
        assert stats["version_count"] == 1
        assert stats["artifact_count"] == 1  # url artifact
        assert stats["dependency_count"] == 2

        # Component detail returns all versions
        res = await client.get(f"/api/v1/software/{comp['id']}", headers=member_headers)
        assert res.status_code == 200
        detail = res.json()
        assert detail["version_count"] == 1
        assert len(detail["versions"]) == 1
        assert detail["versions"][0]["version"] == "3.2.0"

        # Update version (published_at default preserved)
        res = await client.put(
            f"/api/v1/software/versions/{version['id']}",
            json={"note": "Updated note", "dependencies": []},
            headers=admin_headers,
        )
        assert res.status_code == 200
        assert res.json()["note"] == "Updated note"
        assert res.json()["dependencies"] == []

        # Delete version then component
        res = await client.delete(
            f"/api/v1/software/versions/{version['id']}", headers=admin_headers
        )
        assert res.status_code == 204
        res = await client.delete(f"/api/v1/software/{comp['id']}", headers=admin_headers)
        assert res.status_code == 204

        res = await client.get("/api/v1/software", headers=member_headers)
        assert res.json() == []


@pytest.mark.asyncio
async def test_artifact_upload_and_category_filter(db_session):
    await _create_user(db_session, username="admin3", role="admin", email="a3@example.com")
    transport = _build_transport(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await _login(client, "admin3")

        comp = await _create_component(client, headers, category="mobile", icon_key="App")
        version = await _create_version(client, headers, comp["id"], artifact_type="none")

        # Upload a real artifact file (~2MB so file_size rounds to > 0 MB)
        payload = b"\x50\x4b\x03\x04" + b"\x00" * (2 * 1024 * 1024)
        files = {"file": ("flowy-v1.0.apk", payload, "application/octet-stream")}
        res = await client.post(
            f"/api/v1/software/versions/{version['id']}/upload",
            files=files,
            headers=headers,
        )
        assert res.status_code == 201, res.text
        data = res.json()
        assert data["original_name"] == "flowy-v1.0.apk"

        # Version now reflects file artifact
        res = await client.get(f"/api/v1/software/versions/{version['id']}", headers=headers)
        assert res.json()["artifact_type"] == "file"
        assert res.json()["file_name"] == "flowy-v1.0.apk"
        assert res.json()["file_size"] > 0

        # Download the artifact
        dl = await client.get(
            f"/api/v1/software/files/{data['filename']}", headers=headers
        )
        assert dl.status_code == 200
        assert dl.content == payload

        # Category filter returns only this component
        res = await client.get("/api/v1/software?category=mobile", headers=headers)
        assert len(res.json()) == 1
        res = await client.get("/api/v1/software?category=backend", headers=headers)
        assert res.json() == []


@pytest.mark.asyncio
async def test_soft_bot_command(db_session):
    """The /soft bot command returns version notes & download info."""
    await _create_user(db_session, username="adminsoft", role="admin", email="as@example.com")
    transport = _build_transport(db_session)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        headers = await _login(client, "adminsoft")
        comp = await _create_component(client, headers)
        await _create_version(
            client, headers, comp["id"],
            note="**修复登录问题**\n- 优化性能",
            download_url="https://mirrors.example.com/web-v3.2.0.zip",
        )

        # /soft (no args) lists every component with its latest version info
        res = await client.post(
            "/api/v1/wechat-work-bot/test-command",
            json={"command": "/soft"},
            headers=headers,
        )
        assert res.status_code == 200
        data = res.json()
        assert data["error"] is None, data["error"]
        assert "Web Console" in data["response"]
        assert "v3.2.0" in data["response"]
        assert "mirrors.example.com" in data["response"]
        # Release note stays as raw Markdown (not stripped to plain text)
        assert "**修复登录问题**" in data["response"]

        # /soft <identifier> shows the component detail (exact identifier match)
        res = await client.post(
            "/api/v1/wechat-work-bot/test-command",
            json={"command": "/soft flowy-frontend"},
            headers=headers,
        )
        data = res.json()
        assert data["error"] is None, data["error"]
        assert "Web Console" in data["response"]
        assert "3.2.0" in data["response"]
        assert "mirrors.example.com" in data["response"]

        # Duplicate names are NOT fuzzy-matched to a single hit:
        # querying by name disambiguates by identifier instead.
        await _create_component(
            client, headers, identifier="flowy-web-legacy", name="Web Console",
        )
        res = await client.post(
            "/api/v1/wechat-work-bot/test-command",
            json={"command": "/soft Web Console"},
            headers=headers,
        )
        data = res.json()
        assert data["error"] is None, data["error"]
        assert "重名" in data["response"]
        assert "flowy-frontend" in data["response"]
        assert "flowy-web-legacy" in data["response"]

        # Unknown keyword returns an error message
        res = await client.post(
            "/api/v1/wechat-work-bot/test-command",
            json={"command": "/soft 不存在的组件"},
            headers=headers,
        )
        data = res.json()
        assert data["error"] is None
        assert "未找到" in data["response"]
