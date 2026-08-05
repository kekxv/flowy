"""Regression tests for authorization and security boundary fixes."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.core.crypto import encrypt_token
from app.models.external import ExternalConnection, ExternalIssue
from app.models.issue import Issue, issue_assignees
from app.models.notification import NotificationChannel, NotificationLog
from app.models.settings import AppSetting
from app.models.wechat_work_bot import IntranetSource
from app.models.wiki import WikiPage, wiki_collaborators_table
from app.services.external.base import ExternalIssueData


def _transport(db_session):
    from app.database import get_db
    from app.main import app

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    return ASGITransport(app=app, raise_app_exceptions=True)


async def _login(client: AsyncClient, username: str, password: str = "password123") -> dict:
    response = await client.post(
        "/api/v1/auth/login",
        json={"username_or_email": username, "password": password},
    )
    assert response.status_code == 200
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


class TestRegistrationSecurity:
    @pytest.mark.asyncio
    async def test_open_registration_creates_member_after_bootstrap(self, db_session, test_admin):
        db_session.add(AppSetting(key="registration_enabled", value="true"))
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/auth/register",
                json={
                    "username": "newmember",
                    "email": "newmember@example.com",
                    "password": "password123",
                },
            )

        assert response.status_code == 201
        assert response.json()["role"] == "member"


class TestSettingsSecurity:
    @pytest.mark.asyncio
    async def test_member_cannot_read_system_settings(self, db_session, test_user):
        db_session.add(AppSetting(key="github_client_secret", value="top-secret"))
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.get("/api/v1/system/settings", headers=headers)

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_settings_response_never_contains_secret_values(
        self, db_session, test_admin
    ):
        db_session.add_all(
            [
                AppSetting(key="frontend_url", value="http://flowy.internal"),
                AppSetting(key="github_client_secret", value="top-secret"),
            ]
        )
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            response = await client.get("/api/v1/system/settings", headers=headers)

        assert response.status_code == 200
        assert response.json()["frontend_url"] == "http://flowy.internal"
        assert "github_client_secret" not in response.json()
        assert "top-secret" not in response.text


class TestSecretValidation:
    @pytest.mark.parametrize(
        ("field", "value"),
        [
            ("jwt_secret", "change-me-to-another-secret"),
            ("jwt_secret", "dev-jwt-secret-change-in-production"),
            ("app_secret_key", "change-me-to-random-secret"),
            ("app_secret_key", "dev-secret-change-in-production"),
            ("encryption_key", ""),
        ],
    )
    def test_default_or_missing_security_secret_is_rejected(self, field, value):
        config = {
            "jwt_secret": "secure-jwt-secret-for-tests-123456",
            "app_secret_key": "secure-app-secret-for-tests-123456",
            "encryption_key": "MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
        }
        config[field] = value
        settings = Settings(_env_file=None, **config)

        with pytest.raises(ValueError, match=field.upper()):
            settings.validate_security_secrets()

    def test_http_urls_do_not_make_security_secrets_invalid(self):
        settings = Settings(
            _env_file=None,
            jwt_secret="secure-jwt-secret-for-tests-123456",
            app_secret_key="secure-app-secret-for-tests-123456",
            encryption_key="MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA=",
            frontend_url="http://flowy.internal",
        )

        settings.validate_security_secrets()

    def test_invalid_encryption_key_is_rejected(self):
        settings = Settings(
            _env_file=None,
            jwt_secret="secure-jwt-secret-for-tests-123456",
            app_secret_key="secure-app-secret-for-tests-123456",
            encryption_key="not-a-fernet-key",
        )

        with pytest.raises(ValueError, match="ENCRYPTION_KEY"):
            settings.validate_security_secrets()


class TestIssueAuthorization:
    @pytest.mark.asyncio
    async def test_member_cannot_self_assign_project_lead_on_foreign_issue(
        self, db_session, test_user, test_admin
    ):
        issue = Issue(
            id="foreign-issue",
            title="Admin issue",
            description="",
            issue_type="bug",
            status="open",
            priority="medium",
            reporter_id=test_admin.id,
        )
        db_session.add(issue)
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.put(
                f"/api/v1/issues/{issue.id}",
                json={
                    "assignees": [
                        {"user_id": test_user.id, "role": "project_lead"},
                    ]
                },
                headers=headers,
            )

        assert response.status_code == 403


class TestExternalConnectionAuthorization:
    async def _make_lead_and_foreign_connection(self, db_session, test_user, test_admin):
        issue = Issue(
            id="lead-issue",
            title="Lead issue",
            description="",
            issue_type="bug",
            status="open",
            priority="medium",
            reporter_id=test_user.id,
        )
        connection = ExternalConnection(
            id="foreign-connection",
            user_id=test_admin.id,
            provider="gitea",
            pat_token="encrypted-placeholder",
            instance_url="http://gitea.internal",
            remote_username="admin",
            remote_user_id="admin",
        )
        db_session.add_all([issue, connection])
        await db_session.flush()
        await db_session.execute(
            issue_assignees.insert().values(
                issue_id=issue.id,
                user_id=test_user.id,
                role="project_lead",
            )
        )
        await db_session.flush()
        return issue, connection

    @pytest.mark.asyncio
    async def test_lead_cannot_link_another_users_connection(
        self, db_session, test_user, test_admin
    ):
        issue, connection = await self._make_lead_and_foreign_connection(
            db_session, test_user, test_admin
        )

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                f"/api/v1/external/connections/issues/{issue.id}/external-links",
                json={
                    "connection_id": connection.id,
                    "external_repo": "secret/repo",
                    "external_id": "7",
                    "external_url": "http://gitea.internal/secret/repo/issues/7",
                },
                headers=headers,
            )

        assert response.status_code == 404


    @pytest.mark.asyncio
    async def test_manual_sync_does_not_sync_other_users_connections(
        self, db_session, test_user, test_admin, monkeypatch
    ):
        owned_issue = Issue(
            id="owned-sync-issue",
            title="Owned",
            description="",
            issue_type="bug",
            status="open",
            priority="medium",
            reporter_id=test_user.id,
        )
        foreign_issue = Issue(
            id="foreign-sync-issue",
            title="Foreign",
            description="",
            issue_type="bug",
            status="open",
            priority="medium",
            reporter_id=test_admin.id,
        )
        owned_connection = ExternalConnection(
            id="owned-sync-connection",
            user_id=test_user.id,
            provider="gitea",
            pat_token=encrypt_token("owned-token"),
            instance_url="",
            remote_username="member",
            remote_user_id="member",
        )
        foreign_connection = ExternalConnection(
            id="foreign-sync-connection",
            user_id=test_admin.id,
            provider="gitea",
            pat_token=encrypt_token("foreign-token"),
            instance_url="",
            remote_username="admin",
            remote_user_id="admin",
        )
        owned_link = ExternalIssue(
            id="owned-sync-link",
            issue_id=owned_issue.id,
            connection_id=owned_connection.id,
            external_id="1",
            external_url="http://gitea.internal/o/r/issues/1",
            external_repo="o/r",
            status="open",
        )
        foreign_link = ExternalIssue(
            id="foreign-sync-link",
            issue_id=foreign_issue.id,
            connection_id=foreign_connection.id,
            external_id="2",
            external_url="http://gitea.internal/f/r/issues/2",
            external_repo="f/r",
            status="open",
        )
        db_session.add_all(
            [
                owned_issue,
                foreign_issue,
                owned_connection,
                foreign_connection,
                owned_link,
                foreign_link,
            ]
        )
        await db_session.commit()

        class FakeClient:
            async def search_issues(self, repo, query):
                return [
                    ExternalIssueData(
                        external_id=query,
                        title=f"Updated {repo}",
                        status="closed",
                        description="",
                        url=f"http://gitea.internal/{repo}/issues/{query}",
                    )
                ]

        class TestSessionContext:
            async def __aenter__(self):
                return db_session

            async def __aexit__(self, *_args):
                return False

        monkeypatch.setattr("app.services.sync_service.get_client", lambda *_args: FakeClient())
        monkeypatch.setattr(
            "app.services.sync_service.async_session", lambda: TestSessionContext()
        )

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                f"/api/v1/sync/connections/{owned_connection.id}", headers=headers
            )

        assert response.status_code == 200
        await db_session.refresh(owned_link)
        await db_session.refresh(foreign_link)
        assert owned_link.status == "closed"
        assert foreign_link.status == "open"

    @pytest.mark.asyncio
    async def test_sync_skips_legacy_unapproved_connection(
        self, db_session, test_user, monkeypatch
    ):
        issue = Issue(
            id="legacy-sync-issue",
            title="Legacy sync",
            description="",
            issue_type="bug",
            status="open",
            priority="medium",
            reporter_id=test_user.id,
        )
        connection = ExternalConnection(
            id="legacy-sync-connection",
            user_id=test_user.id,
            provider="gitea",
            pat_token=encrypt_token("legacy-token"),
            instance_url="http://127.0.0.1",
            remote_username="testuser",
            remote_user_id="testuser",
        )
        link = ExternalIssue(
            id="legacy-sync-link",
            issue_id=issue.id,
            connection_id=connection.id,
            external_id="1",
            external_url="http://127.0.0.1/repo/issues/1",
            external_repo="owner/repo",
            status="open",
        )
        db_session.add_all([issue, connection, link])
        await db_session.commit()

        class FakeClient:
            async def search_issues(self, _repo, _query):
                return [
                    ExternalIssueData(
                        external_id="1",
                        title="Internal secret",
                        status="closed",
                        description="",
                        url="http://127.0.0.1/repo/issues/1",
                    )
                ]

        class TestSessionContext:
            async def __aenter__(self):
                return db_session

            async def __aexit__(self, *_args):
                return False

        monkeypatch.setattr("app.services.sync_service.get_client", lambda *_args: FakeClient())
        monkeypatch.setattr(
            "app.services.sync_service.async_session", lambda: TestSessionContext()
        )

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                f"/api/v1/sync/connections/{connection.id}", headers=headers
            )

        assert response.status_code == 200
        await db_session.refresh(link)
        assert link.status == "open"

    @pytest.mark.asyncio
    async def test_lead_cannot_refresh_link_using_another_users_connection(
        self, db_session, test_user, test_admin, monkeypatch
    ):
        issue, connection = await self._make_lead_and_foreign_connection(
            db_session, test_user, test_admin
        )
        link = ExternalIssue(
            id="foreign-link",
            issue_id=issue.id,
            connection_id=connection.id,
            external_id="7",
            external_url="http://gitea.internal/secret/repo/issues/7",
            external_repo="secret/repo",
        )
        db_session.add(link)
        await db_session.flush()

        def fail_if_connection_is_used(*_args, **_kwargs):
            raise AssertionError("foreign connection credential was used")

        monkeypatch.setattr("app.api.v1.connections._get_valid_token", fail_if_connection_is_used)

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                f"/api/v1/external/connections/issues/{issue.id}/external-links/{link.id}/refresh",
                headers=headers,
            )

        assert response.status_code == 404


class TestOutboundDestinationSecurity:
    @pytest.mark.asyncio
    async def test_member_cannot_create_notification_destination(self, db_session, test_user):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/notifications/channels",
                json={
                    "name": "Internal webhook",
                    "channel_type": "webhook",
                    "config": {"url": "http://192.168.10.20/hooks"},
                },
                headers=headers,
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_cannot_create_loopback_notification_destination(
        self, db_session, test_admin
    ):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            response = await client.post(
                "/api/v1/notifications/channels",
                json={
                    "name": "Loopback webhook",
                    "channel_type": "webhook",
                    "config": {"url": "http://127.0.0.1/admin"},
                },
                headers=headers,
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_admin_can_create_private_http_notification_destination(
        self, db_session, test_admin
    ):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            response = await client.post(
                "/api/v1/notifications/channels",
                json={
                    "name": "Internal webhook",
                    "channel_type": "webhook",
                    "config": {"url": "http://192.168.10.20/hooks"},
                },
                headers=headers,
            )

        assert response.status_code == 201

    @pytest.mark.asyncio
    async def test_pat_rejects_gitea_instance_not_configured_by_admin(
        self, db_session, test_user, monkeypatch
    ):
        db_session.add(AppSetting(key="gitea_instance_url", value="http://10.20.0.8"))
        await db_session.flush()

        class FakeClient:
            async def get_current_username(self):
                return "testuser"

        monkeypatch.setattr(
            "app.services.connection_service.get_client", lambda *_args: FakeClient()
        )

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/external/connections/pat",
                json={
                    "provider": "gitea",
                    "token": "secret-token",
                    "instance_url": "http://10.20.0.9",
                },
                headers=headers,
            )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_pat_allows_admin_configured_private_http_gitea(
        self, db_session, test_user, monkeypatch
    ):
        configured_url = "http://10.20.0.8"
        db_session.add(AppSetting(key="gitea_instance_url", value=configured_url))
        await db_session.flush()

        class FakeClient:
            async def get_current_username(self):
                return "testuser"

        monkeypatch.setattr(
            "app.services.connection_service.get_client", lambda *_args: FakeClient()
        )

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/external/connections/pat",
                json={
                    "provider": "gitea",
                    "token": "secret-token",
                    "instance_url": configured_url,
                },
                headers=headers,
            )

        assert response.status_code == 201
        assert response.json()["instance_url"] == configured_url

    @pytest.mark.asyncio
    async def test_oauth_rejects_unconfigured_custom_gitea_instance(
        self, db_session, test_user
    ):
        db_session.add_all(
            [
                AppSetting(key="gitea_client_id", value="client-id"),
                AppSetting(key="gitea_client_secret", value="client-secret"),
            ]
        )
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/external/connections/oauth/init",
                json={
                    "provider": "gitea",
                    "instance_url": "http://10.20.0.9",
                    "frontend_url": "http://flowy.internal",
                },
                headers=headers,
            )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_legacy_unapproved_gitea_connection_is_blocked_before_use(
        self, db_session, test_user, monkeypatch
    ):
        connection = ExternalConnection(
            id="legacy-unapproved-connection",
            user_id=test_user.id,
            provider="gitea",
            pat_token=encrypt_token("legacy-token"),
            instance_url="http://127.0.0.1",
            remote_username="testuser",
            remote_user_id="testuser",
        )
        db_session.add(connection)
        await db_session.flush()

        def unexpected_client(*_args, **_kwargs):
            raise AssertionError("unapproved legacy instance reached provider client")

        monkeypatch.setattr("app.api.v1.connections.get_client", unexpected_client)

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.get(
                f"/api/v1/external/connections/{connection.id}/repos",
                headers=headers,
            )

        assert response.status_code == 400

    @pytest.mark.asyncio
    async def test_admin_cannot_create_loopback_intranet_source(self, db_session, test_admin):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            response = await client.post(
                "/api/v1/wechat-work-bot/intranet-sources",
                json={
                    "name": "Loopback files",
                    "url": "http://127.0.0.1/private",
                    "source_type": "nginx",
                },
                headers=headers,
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    @pytest.mark.parametrize("encoded_parent", ["..", "%2e%2e"])
    async def test_intranet_download_rejects_parent_path_escape(
        self, db_session, monkeypatch, encoded_parent
    ):
        from app.services.wechat_work_bot.file_token import generate_file_token

        source = IntranetSource(
            id="source-download",
            name="Internal files",
            url="http://10.20.0.8/base",
            source_type="nginx",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()
        token = generate_file_token(
            source.id,
            f"http://10.20.0.8/base/{encoded_parent}/secret.txt",
        )

        class UnexpectedHttpClient:
            def __init__(self, *_args, **_kwargs):
                raise AssertionError("escaped file URL reached the HTTP client")

        monkeypatch.setattr("httpx.AsyncClient", UnexpectedHttpClient)

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/wechat-work-bot/intranet/download",
                params={"token": token},
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_intranet_download_does_not_follow_redirects(
        self, db_session, monkeypatch
    ):
        from app.services.wechat_work_bot.file_token import generate_file_token

        source = IntranetSource(
            id="source-redirect",
            name="Internal files",
            url="http://10.20.0.8/base",
            source_type="nginx",
            file_ttl_seconds=3600,
        )
        db_session.add(source)
        await db_session.flush()
        token = generate_file_token(source.id, "http://10.20.0.8/base/file.txt")

        class RedirectResponse:
            status_code = 302
            content = b"redirected secret"
            headers = {
                "location": "http://169.254.169.254/latest/meta-data",
                "content-type": "text/plain",
            }

            def raise_for_status(self):
                return None

            async def aiter_bytes(self):
                yield self.content

        class ResponseContext:
            async def __aenter__(self):
                return RedirectResponse()

            async def __aexit__(self, *_args):
                return False

        class FakeHttpClient:
            def __init__(self, *_args, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def get(self, _url):
                return RedirectResponse()

            def stream(self, _method, _url):
                return ResponseContext()

        monkeypatch.setattr("httpx.AsyncClient", FakeHttpClient)

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/wechat-work-bot/intranet/download", params={"token": token}
            )

        assert response.status_code == 502

    @pytest.mark.asyncio
    async def test_intranet_download_sends_source_basic_auth(
        self, db_session, monkeypatch
    ):
        from httpx import BasicAuth, Request

        from app.services.wechat_work_bot.file_token import generate_file_token

        source = IntranetSource(
            id="source-authenticated-download",
            name="Protected files",
            url="http://10.20.0.8/base",
            source_type="nginx",
            file_ttl_seconds=3600,
            auth_username="reader",
            auth_password_encrypted=encrypt_token("source-secret"),
        )
        db_session.add(source)
        await db_session.flush()
        token = generate_file_token(
            source.id,
            "http://10.20.0.8/base/file.txt",
            filename="原始报告.txt",
            size=4,
        )
        captured_auth = None

        class FileResponse:
            status_code = 200
            headers = {"content-type": "text/plain", "content-length": "4"}

            def raise_for_status(self):
                return None

            async def aiter_bytes(self):
                yield b"data"

        class ResponseContext:
            async def __aenter__(self):
                return FileResponse()

            async def __aexit__(self, *_args):
                return False

        class FakeHttpClient:
            def __init__(self, *_args, auth=None, **_kwargs):
                nonlocal captured_auth
                captured_auth = auth

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            def stream(self, _method, _url):
                return ResponseContext()

        monkeypatch.setattr("httpx.AsyncClient", FakeHttpClient)

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            response = await client.get(
                "/api/v1/intranet/download",
                params={"token": token},
            )

        assert response.status_code == 200
        assert response.content == b"data"
        assert response.headers["content-disposition"] == (
            "attachment; filename*=UTF-8''%E5%8E%9F%E5%A7%8B%E6%8A%A5%E5%91%8A.txt"
        )
        assert isinstance(captured_auth, BasicAuth)
        request = next(captured_auth.auth_flow(Request("GET", source.url)))
        assert request.headers["Authorization"] == "Basic cmVhZGVyOnNvdXJjZS1zZWNyZXQ="



class TestAuthorizationScoping:
    @pytest.mark.asyncio
    async def test_admin_can_view_and_edit_private_wiki_page(
        self, db_session, test_user, test_admin
    ):
        """An admin can update a private page they do not own or collaborate on."""
        page = WikiPage(
            id="admin-edit-private-wiki-page",
            owner_id=test_user.id,
            title="Private page",
            slug="private-page",
            content="original",
            is_public=False,
        )
        db_session.add(page)
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            list_response = await client.get("/api/v1/wiki", headers=headers)
            get_response = await client.get(f"/api/v1/wiki/{page.id}", headers=headers)
            update_response = await client.put(
                f"/api/v1/wiki/{page.id}",
                json={"content": "updated by admin"},
                headers=headers,
            )

        assert list_response.status_code == 200
        assert page.id in {item["id"] for item in list_response.json()["data"]}
        assert get_response.status_code == 200
        assert update_response.status_code == 200
        assert update_response.json()["content"] == "updated by admin"
        await db_session.refresh(page)
        assert page.content == "updated by admin"

    @pytest.mark.asyncio
    async def test_viewer_collaborator_cannot_edit_wiki_page(
        self, db_session, test_user, test_admin
    ):
        page = WikiPage(
            id="private-wiki-page",
            owner_id=test_admin.id,
            title="Private page",
            slug="private-page",
            content="original",
            is_public=False,
        )
        db_session.add(page)
        await db_session.flush()
        await db_session.execute(
            wiki_collaborators_table.insert().values(
                wiki_id=page.id,
                user_id=test_user.id,
                permission="viewer",
            )
        )
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.put(
                f"/api/v1/wiki/{page.id}",
                json={"content": "changed"},
                headers=headers,
            )

        assert response.status_code == 403
        await db_session.refresh(page)
        assert page.content == "original"

    @pytest.mark.asyncio
    async def test_member_cannot_assign_own_project_roles(self, db_session, test_user):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.put(
                "/api/v1/auth/me/project-roles",
                json={"roles": ["project_lead"]},
                headers=headers,
            )

        assert response.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_cannot_assign_unknown_project_role(
        self, db_session, test_user, test_admin
    ):
        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "admin")
            response = await client.put(
                f"/api/v1/users/{test_user.id}/project-roles",
                json={"roles": ["superuser"]},
                headers=headers,
            )

        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_notification_rule_rejects_another_users_channel(
        self, db_session, test_user, test_admin
    ):
        foreign_channel = NotificationChannel(
            id="foreign-channel",
            name="Admin channel",
            channel_type="webhook",
            config='{"url":"http://10.20.0.8/hooks"}',
            created_by=test_admin.id,
        )
        db_session.add(foreign_channel)
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/notifications/rules",
                json={
                    "channel_id": foreign_channel.id,
                    "event_type": "issue.created",
                    "name": "Foreign rule",
                },
                headers=headers,
            )

        assert response.status_code == 404

    @pytest.mark.asyncio
    async def test_notification_logs_only_include_owned_channels(
        self, db_session, test_user, test_admin
    ):
        owned_channel = NotificationChannel(
            id="owned-channel",
            name="Member channel",
            channel_type="webhook",
            config='{"url":"http://10.20.0.8/hooks"}',
            created_by=test_user.id,
        )
        foreign_channel = NotificationChannel(
            id="admin-channel",
            name="Admin channel",
            channel_type="webhook",
            config='{"url":"http://10.20.0.9/hooks"}',
            created_by=test_admin.id,
        )
        owned_log = NotificationLog(
            id="owned-log",
            channel_id=owned_channel.id,
            event_type="issue.created",
            status="success",
        )
        foreign_log = NotificationLog(
            id="foreign-log",
            channel_id=foreign_channel.id,
            event_type="issue.created",
            status="success",
        )
        db_session.add_all([owned_channel, foreign_channel, owned_log, foreign_log])
        await db_session.flush()

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.get("/api/v1/notifications/logs", headers=headers)

        assert response.status_code == 200
        assert {row["id"] for row in response.json()["data"]} == {owned_log.id}
        assert response.json()["meta"]["total"] == 1

    @pytest.mark.asyncio
    async def test_wiki_upload_uses_full_uuid_capability_name(
        self, db_session, test_user, tmp_path, monkeypatch
    ):
        monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))

        async with AsyncClient(transport=_transport(db_session), base_url="http://test") as client:
            headers = await _login(client, "testuser")
            response = await client.post(
                "/api/v1/wiki/upload",
                files={"file": ("diagram.png", b"image-data", "image/png")},
                headers=headers,
            )

        assert response.status_code == 200
        assert len(response.json()["filename"].removesuffix(".png")) == 32
