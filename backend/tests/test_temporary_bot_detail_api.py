"""Exercise the public capability URL boundary with real database records."""
from datetime import UTC, datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.database import get_db
from app.main import app
from app.services.temporary_bot_detail_service import TemporaryBotDetailService


@pytest.mark.asyncio
async def test_public_detail_requires_exact_live_token_and_never_exposes_storage_fields(db_session, test_user):
    detail, token = await TemporaryBotDetailService().create(db_session, test_user.id, 'Title', 'Summary', 'Body')

    async def override_db():
        yield db_session

    previous = dict(app.dependency_overrides)
    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url='http://test') as client:
            prefix = '/api/v1/public/bot-details/'
            response = await client.get(prefix + token)
            assert response.status_code == 200
            assert response.headers['cache-control'] == 'no-store'
            assert set(response.json()) == {'title', 'summary', 'content', 'expires_at', 'server_time'}
            for invalid in [detail.id, detail.token_hash, token[:-1], token + 'x', "' OR 1=1 --", 'x' * 10000]:
                assert (await client.get(prefix + invalid)).status_code == 410
            assert (await client.post(prefix + token, json={'content': 'injected'})).status_code == 405
            assert (await client.delete(prefix + token)).status_code == 405
            assert (await client.get(prefix + token)).json()['content'] == 'Body'
            detail.expires_at = (datetime.now(UTC) - timedelta(seconds=1)).isoformat()
            await db_session.commit()
            assert (await client.get(prefix + token)).status_code == 410
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous)
