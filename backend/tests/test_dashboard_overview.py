import pytest
from httpx import ASGITransport, AsyncClient

from app.models.software import SoftwareComponent, SoftwareVersion
from app.models.tracking import Milestone
from app.models.user import User
from app.models.wiki import WikiPage


@pytest.mark.asyncio
async def test_dashboard_counts_software_and_visible_wiki_pages(db_session, test_user):
    from app.database import get_db
    from app.main import app

    async def override_db():
        yield db_session

    app.dependency_overrides[get_db] = override_db
    db_session.add_all([
        SoftwareComponent(id="component-1", name="Web", identifier="web"),
        SoftwareVersion(id="version-1", component_id="component-1", version="1.0"),
        SoftwareVersion(id="version-2", component_id="component-1", version="2.0"),
        Milestone(id="milestone-1", name="Sprint", status="open", owner_id=test_user.id),
        WikiPage(id="wiki-public", owner_id=test_user.id, title="Public", slug="public", is_public=True),
        WikiPage(id="wiki-private", owner_id=test_user.id, title="Private", slug="private", is_public=False),
        User(id="other-user", username="other", email="other@example.com", display_name="Other", role="member", password_hash="unused", avatar_url=""),
        WikiPage(id="wiki-hidden", owner_id="other-user", title="Hidden", slug="hidden", is_public=False),
    ])
    await db_session.flush()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        login = await client.post("/api/v1/auth/login", json={"username_or_email": "testuser", "password": "password123"})
        response = await client.get("/api/v1/dashboard", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    app.dependency_overrides.clear()

    assert response.status_code == 200
    stats = response.json()["stats"]
    assert stats["software_components"] == 1
    assert stats["software_versions"] == 2
    assert stats["wiki_pages"] == 2
    assert stats["total_milestones"] == 1
