import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app


def transport(db):
    app.dependency_overrides[get_db] = lambda: (yield db)
    return ASGITransport(app=app, raise_app_exceptions=True)
async def login(client):
    r = await client.post('/api/v1/auth/login', json={'username_or_email':'testuser','password':'password123'})
    return {'Authorization': f"Bearer {r.json()['access_token']}"}
@pytest.mark.asyncio
async def test_create_public_link_and_submit_once(db_session, test_user):
    async with AsyncClient(transport=transport(db_session), base_url='http://test') as c:
        headers = await login(c)
        created = await c.post('/api/v1/temporary-issue-links', json={'expires_in_minutes':60}, headers=headers)
        assert created.status_code == 201
        token = created.json()['token']
        assert (await c.get(f'/api/v1/public/issue-links/{token}')).status_code == 200
        submitted = await c.post(f'/api/v1/public/issue-links/{token}/submit', json={'title':'Public','description':'body','issue_type':'bug','priority':'high'})
        assert submitted.status_code == 200
        again = await c.post(f'/api/v1/public/issue-links/{token}/submit', json={'title':'Again'})
        assert again.status_code == 410
@pytest.mark.asyncio
async def test_public_submit_cannot_choose_reporter_or_assignee(db_session, test_user):
    async with AsyncClient(transport=transport(db_session), base_url='http://test') as c:
        headers = await login(c)
        token = (await c.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()['token']
        resp = await c.post(f'/api/v1/public/issue-links/{token}/submit', json={'title':'No escalation','reporter_id':'other','assignees':[{'user_id':'other','role':'project_lead'}]})
        assert resp.status_code == 200


@pytest.mark.asyncio
async def test_public_link_returns_server_time_for_expiry_checks(db_session, test_user):
    from datetime import datetime

    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        token = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()['token']
        response = await client.get(f'/api/v1/public/issue-links/{token}')
    assert response.status_code == 200
    data = response.json()
    assert datetime.fromisoformat(data['server_time']).tzinfo is not None
    assert datetime.fromisoformat(data['server_time']) < datetime.fromisoformat(data['expires_at'])


@pytest.mark.asyncio
async def test_owner_can_recover_link_url_from_list(db_session, test_user):
    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        created = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()
        links = (await client.get('/api/v1/temporary-issue-links', headers=headers)).json()
        assert links[0]['url'] == created['url']
        from sqlalchemy import select

        from app.models.temporary_issue_link import TemporaryIssueLink
        stored = await db_session.scalar(select(TemporaryIssueLink))
        assert stored.token_encrypted and created['token'] not in stored.token_encrypted


@pytest.mark.asyncio
async def test_owner_can_cancel_link_and_all_public_actions_reject_it(db_session, test_user):
    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        created = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()
        link = (await client.get('/api/v1/temporary-issue-links', headers=headers)).json()[0]
        response = await client.post(f"/api/v1/temporary-issue-links/{link['id']}/cancel", headers=headers)
        assert response.status_code == 204
        listed = (await client.get('/api/v1/temporary-issue-links', headers=headers)).json()[0]
        assert listed['revoked_at'] and not listed['active']
        assert listed['url'] is None
        path = f"/api/v1/public/issue-links/{created['token']}"
        assert (await client.get(path)).status_code == 410
        assert (await client.post(path + '/submit', json={'title': 'Cancelled'})).status_code == 410
        assert (await client.post(path + '/attachments', files={'file': ('test.txt', b'test')})).status_code == 410


@pytest.mark.asyncio
async def test_other_user_cannot_list_or_cancel_link(db_session, test_user, test_admin):
    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        created = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()
        link = (await client.get('/api/v1/temporary-issue-links', headers=headers)).json()[0]
        admin_login = await client.post('/api/v1/auth/login', json={'username_or_email': 'admin', 'password': 'password123'})
        admin_headers = {'Authorization': f"Bearer {admin_login.json()['access_token']}"}
        assert (await client.get('/api/v1/temporary-issue-links', headers=admin_headers)).json() == []
        assert (await client.post(f"/api/v1/temporary-issue-links/{link['id']}/cancel", headers=admin_headers)).status_code == 404
        assert (await client.post(f"/api/v1/temporary-issue-links/{link['id']}/cancel")).status_code == 401
        assert (await client.get(f"/api/v1/public/issue-links/{created['token']}")).status_code == 200


@pytest.mark.asyncio
async def test_legacy_link_without_encrypted_token_can_still_be_cancelled(db_session, test_user):
    from sqlalchemy import select

    from app.models.temporary_issue_link import TemporaryIssueLink

    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        created = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()
        stored = await db_session.scalar(select(TemporaryIssueLink))
        stored.token_encrypted = None
        await db_session.commit()
        link = (await client.get('/api/v1/temporary-issue-links', headers=headers)).json()[0]
        assert link['active'] and link['url'] is None
        assert (await client.get(f"/api/v1/public/issue-links/{created['token']}")).status_code == 200
        path = f"/api/v1/temporary-issue-links/{link['id']}/cancel"
        assert (await client.post(path, headers=headers)).status_code == 204
        assert (await client.post(path, headers=headers)).status_code == 204
        assert (await client.get(f"/api/v1/public/issue-links/{created['token']}")).status_code == 410


@pytest.mark.asyncio
async def test_public_upload_requires_active_token_without_login(db_session, test_user):
    from datetime import UTC, datetime, timedelta

    from sqlalchemy import select

    from app.models.temporary_issue_link import TemporaryIssueLink

    async with AsyncClient(transport=transport(db_session), base_url='http://test') as client:
        headers = await login(client)
        created = (await client.post('/api/v1/temporary-issue-links', json={}, headers=headers)).json()
        active = await client.post(
            f"/api/v1/public/issue-links/{created['token']}/attachments",
            files={'file': ('note.txt', b'public anonymous upload')},
        )
        assert active.status_code == 200
        stored = await db_session.scalar(select(TemporaryIssueLink))
        stored.expires_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()
        await db_session.commit()
        expired = await client.post(
            f"/api/v1/public/issue-links/{created['token']}/attachments",
            files={'file': ('expired.txt', b'blocked')},
        )
        assert expired.status_code == 410
        unknown = await client.post(
            '/api/v1/public/issue-links/not-a-real-token/attachments',
            files={'file': ('unknown.txt', b'blocked')},
        )
        assert unknown.status_code == 410
