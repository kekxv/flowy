"""Bot artifact links authorize only the named file for a limited time."""

import re
from html import unescape
from urllib.parse import urljoin, urlsplit

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.api.v1.software import router
from app.database import get_db
from app.models.software import SoftwareComponent, SoftwareVersion
from app.models.temporary_bot_detail import TemporaryBotDetail
from app.services.wechat_work_bot.handlers import CommandHandlers


@pytest.mark.asyncio
async def test_soft_download_link_works_without_login_and_expires(db_session, tmp_path, monkeypatch):
    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    artifacts = tmp_path / "software_artifacts"
    artifacts.mkdir()
    (artifacts / "release.zip").write_bytes(b"release contents")
    (artifacts / "other.zip").write_bytes(b"private contents")
    db_session.add(SoftwareComponent(id="web", name="Web", identifier="web"))
    db_session.add(SoftwareVersion(
        id="v1", component_id="web", version="1.0", artifact_type="file",
        stored_filename="release.zip", file_name="release.zip",
    ))
    await db_session.flush()

    monkeypatch.setattr("app.services.wechat_work_bot.file_token.time.time", lambda: 2_000_000_000)
    result = await CommandHandlers(db_session).handle_soft(["web"], {})
    detail = (await db_session.execute(select(TemporaryBotDetail))).scalars().one()
    assert "/#/public/bot-details/" in result
    link = re.search(r"\[release.zip\]\(([^)]+)\)", detail.content).group(1)
    parsed = urlsplit(link)
    url = parsed.path + "?" + parsed.query
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(url)
        assert response.status_code == 200, response.text
        assert response.headers["content-type"].startswith("text/html")
        assert "确认下载文件" in response.text
        assert "release.zip" in response.text
        assert "16 B" in response.text
        assert "Web · v1.0" in response.text
        button = re.search(r'<a class="download" href="([^"]+)"', response.text)
        assert button is not None
        direct_url = urljoin(str(response.url), unescape(button.group(1)))
        download = await client.get(direct_url)
        assert download.status_code == 200
        assert download.content == b"release contents"
        wrong_file_download = await client.get(direct_url.replace("release.zip", "other.zip"))
        assert wrong_file_download.status_code == 401
        tampered_download = await client.get(direct_url + "x")
        assert tampered_download.status_code == 401

        other = await client.get(url.replace("release.zip", "other.zip"))
        assert other.status_code == 410
        tampered = await client.get(url + "x")
        assert tampered.status_code == 410
        unsigned = await client.get(parsed.path)
        assert unsigned.status_code != 200
        protected = await client.get("/api/v1/software/files/release.zip")
        assert protected.status_code in {401, 403}

        monkeypatch.setattr("app.services.wechat_work_bot.file_token.time.time", lambda: 2_000_003_601)
        expired = await client.get(url)
        assert expired.status_code == 410
        assert expired.headers["content-type"].startswith("text/html")
        assert "链接已过期" in expired.text
        expired_download = await client.get(direct_url)
        assert expired_download.status_code == 401


@pytest.mark.asyncio
async def test_intranet_token_cannot_authorize_software_download(tmp_path, monkeypatch):
    from app.services.wechat_work_bot.file_token import generate_file_token

    monkeypatch.setenv("UPLOAD_DIR", str(tmp_path))
    artifacts = tmp_path / "software_artifacts"
    artifacts.mkdir()
    (artifacts / "release.zip").write_bytes(b"private contents")
    token = generate_file_token("intranet-source", "release.zip")
    app = FastAPI()
    app.include_router(router, prefix="/api/v1")
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get(f"/api/v1/software/download/release.zip?token={token}")
        assert response.status_code == 401
