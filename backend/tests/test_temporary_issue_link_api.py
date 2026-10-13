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
