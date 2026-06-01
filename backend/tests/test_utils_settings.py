"""Tests for app/utils/settings.py."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.settings import AppSetting
from app.utils.settings import get_frontend_url


class TestGetFrontendUrl:
    @pytest.mark.asyncio
    async def test_from_db(self, db_session: AsyncSession):
        """When AppSetting exists, returns its value."""
        db_session.add(AppSetting(key="frontend_url", value="http://custom.example.com"))
        await db_session.flush()

        url = await get_frontend_url(db_session)
        assert url == "http://custom.example.com"

    @pytest.mark.asyncio
    async def test_fallback_to_config(self, db_session: AsyncSession):
        """When no AppSetting, falls back to settings.frontend_url."""
        url = await get_frontend_url(db_session)
        assert url == settings.frontend_url.rstrip("/")

    @pytest.mark.asyncio
    async def test_empty_value_fallback(self, db_session: AsyncSession):
        """When AppSetting value is empty string, uses config."""
        db_session.add(AppSetting(key="frontend_url", value=""))
        await db_session.flush()

        url = await get_frontend_url(db_session)
        assert url == settings.frontend_url.rstrip("/")

    @pytest.mark.asyncio
    async def test_trailing_slash_stripped(self, db_session: AsyncSession):
        """Trailing slash is stripped from URL."""
        db_session.add(AppSetting(key="frontend_url", value="http://example.com/"))
        await db_session.flush()

        url = await get_frontend_url(db_session)
        assert url == "http://example.com"
        assert not url.endswith("/")
