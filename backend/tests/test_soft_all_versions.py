import pytest

from app.models.software import SoftwareComponent, SoftwareVersion
from app.services.wechat_work_bot.handlers import CommandHandlers


@pytest.mark.asyncio
async def test_soft_all_flag_returns_every_version_for_a_component(db_session):
    db_session.add(SoftwareComponent(id="component-1", name="Web", identifier="web"))
    db_session.add_all([
        SoftwareVersion(id=f"version-{n}", component_id="component-1", version=f"{n}.0", published_at=f"2026-01-{n:02d}", note="release " * 30 if n == 1 else "")
        for n in range(1, 8)
    ])
    await db_session.flush()

    handlers = CommandHandlers(db_session)
    default = await handlers.handle_soft(["web"], {})
    all_versions = await handlers.handle_soft(["web", "--all"], {})

    assert "### v1.0" not in default
    assert "### v1.0" in all_versions
    assert "### v7.0" in all_versions
    assert ("release " * 30).strip() in all_versions
    assert "仅显示最新 5 个版本" not in all_versions


@pytest.mark.asyncio
async def test_soft_all_flag_without_name_returns_history_for_all_components(db_session):
    db_session.add(SoftwareComponent(id="component-1", name="Web", identifier="web"))
    db_session.add_all([
        SoftwareVersion(id="version-1", component_id="component-1", version="1.0", published_at="2026-01-01"),
        SoftwareVersion(id="version-2", component_id="component-1", version="2.0", published_at="2026-02-01"),
    ])
    await db_session.flush()

    result = await CommandHandlers(db_session).handle_soft(["--all"], {})
    assert "v1.0" in result
    assert "v2.0" in result
