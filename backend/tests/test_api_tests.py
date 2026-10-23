import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_create_and_review_test_request(db_session, test_user):
    from app.database import get_db
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            created = await client.post("/api/v1/tests", json={"title": "公开申请", "catalog": "账号", "expected_effect": "可登录", "current_behavior": "登录失败"}, headers=headers)
            assert created.status_code == 201
            assert created.json()["status"] == "submitted"
            accepted = await client.post(f"/api/v1/tests/{created.json()['id']}/transition", json={"status": "queued"}, headers=headers)
            assert accepted.status_code == 200
            assert accepted.json()["status"] == "queued"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_test_stats_are_grouped_by_status(db_session, test_user):
    from app.database import get_db
    from app.services.test_service import TestService
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    await TestService().create_request(db_session, test_user, {"title": "Count this"})
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            response = await client.get("/api/v1/tests/stats", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
        assert response.json()["by_status"]["submitted"] == 1
        assert response.json()["active"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_public_test_collection_is_single_use(db_session, test_user):
    from app.database import get_db
    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            link = await client.post("/api/v1/test-collections", json={"expires_in_minutes": 60}, headers=headers)
            token = link.json()["url"].rsplit("/", 1)[-1]
            submitted = await client.post(f"/api/v1/public/test-collections/{token}/submit", json={"title": "外部测试申请", "catalog": "登录", "expected_effect": "正常登录", "current_behavior": "错误提示"})
            repeated = await client.post(f"/api/v1/public/test-collections/{token}/submit", json={"title": "重复申请"})
        assert submitted.status_code == 201
        assert submitted.json()["status"] == "submitted"
        assert repeated.status_code == 410
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_collection_links_recover_urls_and_close_after_cancel_or_expiry(db_session, test_user):
    from datetime import UTC, datetime, timedelta

    from app.database import get_db
    from app.models.test import TestCollectionLink

    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            created = (await client.post("/api/v1/test-collections", json={"expires_in_minutes": 30}, headers=headers)).json()
            listed = (await client.get("/api/v1/test-collections", headers=headers)).json()[0]
            assert listed["url"] == created["url"]
            token = created["url"].rsplit("/", 1)[-1]
            metadata = await client.get(f"/api/v1/public/test-collections/{token}")
            assert metadata.json()["server_time"]
            assert metadata.headers.get("cache-control") == "no-store"
            assert listed["used_at"] is None
            row = await db_session.get(TestCollectionLink, created["id"])
            row.expires_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
            await db_session.commit()
            assert (await client.get(f"/api/v1/public/test-collections/{token}")).status_code == 410
            assert (await client.post(f"/api/v1/public/test-collections/{token}/submit", json={"title": "expired"})).status_code == 410
            assert (await client.get("/api/v1/test-collections", headers=headers)).json()[0]["url"] is None
            created = (await client.post("/api/v1/test-collections", json={}, headers=headers)).json()
            for _ in range(2):
                assert (await client.post(f"/api/v1/test-collections/{created['id']}/cancel", headers=headers)).status_code == 204
            token = created["url"].rsplit("/", 1)[-1]
            assert (await client.get(f"/api/v1/public/test-collections/{token}")).status_code == 410
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_test_collection_upload_rechecks_expiry_after_reading_file(db_session, test_user, monkeypatch):
    from datetime import UTC, datetime, timedelta

    from app.api.v1 import tests as routes
    from app.database import get_db
    from app.models.test import TestCollectionLink

    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            created = (await client.post("/api/v1/test-collections", json={}, headers=headers)).json()
            async def expire_during_upload(db):
                row = await db.get(TestCollectionLink, created["id"])
                row.expires_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
                await db.commit()
                return 1000
            monkeypatch.setattr(routes, "_get_upload_limit", expire_during_upload)
            token = created["url"].rsplit("/", 1)[-1]
            response = await client.post(f"/api/v1/public/test-collections/{token}/attachments", files={"file": ("test.txt", b"content", "text/plain")})
            assert response.status_code == 410
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_status_actions_are_available_to_managers_and_permission_errors_return_403(db_session, test_user):
    from app.database import get_db
    from app.models.tracking import UserProjectRole
    from app.models.user import User

    tester = User(id="api-tester", username="apitester", email="api-tester@example.com", password_hash="x", display_name="API tester", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()

    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            created = (await client.post("/api/v1/tests", json={"title": "UI actions"}, headers=headers)).json()
            detail = (await client.get(f"/api/v1/tests/{created['id']}", headers=headers)).json()
            assert "cancelled" in detail["available_transitions"]
            assert detail["can_assign"] is True
            assert detail["can_submit_run"] is False
            assigned = await client.post(f"/api/v1/tests/{created['id']}/assign", json={"tester_id": tester.id}, headers=headers)
            assert assigned.status_code == 200
            started = await client.post(f"/api/v1/tests/{created['id']}/transition", json={"status": "testing"}, headers=headers)
            assert started.status_code == 200
            cancelled = await client.post(f"/api/v1/tests/{created['id']}/transition", json={"status": "cancelled", "reason": "环境变更"}, headers=headers)
            assert cancelled.status_code == 200
            assert "queued" in cancelled.json()["available_transitions"]
            from app.dependencies import get_current_user

            outsider = User(id="api-outsider", username="apioutsider", email="outsider@example.com", password_hash="x", role="member")
            db_session.add(outsider)
            await db_session.flush()
            app.dependency_overrides[get_current_user] = lambda: outsider
            denied = await client.post(f"/api/v1/tests/{created['id']}/transition", json={"status": "submitted"}, headers=headers)
            assert denied.status_code == 403
            outsider_detail = (await client.get(f"/api/v1/tests/{created['id']}", headers=headers)).json()
            assert outsider_detail["available_transitions"] == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_start_finish_api_persists_markdown_objective_and_report(db_session, test_user, tmp_path, monkeypatch):
    from app.database import get_db
    from app.models.tracking import UserProjectRole
    from app.models.user import User

    tester = User(id="flow-tester", username="flowtester", email="flow@example.com", password_hash="x", role="member")
    db_session.add(tester)
    db_session.add(UserProjectRole(user_id=tester.id, role="tester"))
    await db_session.flush()

    async def override_db():
        yield db_session
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
            headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
            objective = "## 测试目标\n" + "验证登录、权限与回归。" * 100
            created = await client.post("/api/v1/tests", json={"title": "闭环验证", "objective": objective}, headers=headers)
            assert created.status_code == 201
            assert created.json()["objective"] == objective
            request_id = created.json()["id"]
            await client.post(f"/api/v1/tests/{request_id}/assign", json={"tester_id": tester.id}, headers=headers)
            started = await client.post(f"/api/v1/tests/{request_id}/transition", json={"status": "testing"}, headers=headers)
            assert started.json()["can_submit_run"] is True
            incomplete = await client.post(f"/api/v1/tests/{request_id}/runs", json={"status": "passed", "version": "3.0"}, headers=headers)
            assert incomplete.status_code == 422
            assert (await client.get(f"/api/v1/tests/{request_id}", headers=headers)).json()["status"] == "testing"
            payload = {"status": "passed", "version": "3.0", "method": "## 自动化\n回归", "steps": "1. 登录", "result": "**通过**", "report": "## 完整报告\n|用例|结果|\n|---|---|\n|登录|通过|"}
            finished = await client.post(f"/api/v1/tests/{request_id}/runs", json=payload, headers=headers)
            assert finished.status_code == 201
            detail = (await client.get(f"/api/v1/tests/{request_id}", headers=headers)).json()
            assert detail["status"] == "passed"
            assert detail["runs"][0]["report"] == payload["report"]
            assert detail["runs"][0]["method"] == payload["method"]
            from app.models.test import TestAttachment

            for index in range(10):
                db_session.add(TestAttachment(request_id=request_id, run_id=finished.json()["id"], filename=f"previous-{index}.txt", original_name=f"previous-{index}.txt"))
            await db_session.commit()
            additional = await client.post(f"/api/v1/tests/{request_id}/runs", json={**payload, "report": "## 补充报告", "status": "failed"}, headers=headers)
            assert additional.status_code == 201
            monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
            upload = await client.post(f"/api/v1/tests/{request_id}/attachments?run_id={additional.json()['id']}", files={"file": ("second.txt", b"second report", "text/plain")}, headers=headers)
            assert upload.status_code == 201
            detail = (await client.get(f"/api/v1/tests/{request_id}", headers=headers)).json()
            assert len(detail["runs"]) == 2
            assert detail["status"] == "failed"
            assert detail["runs"][0]["report"] == "## 补充报告"
    finally:
        app.dependency_overrides.clear()
