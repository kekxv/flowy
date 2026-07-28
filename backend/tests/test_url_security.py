import base64
import json
import socket

import pytest

from app.core.url_security import url_belongs_to_source, validate_http_url
from app.services.notifications.base import NotificationEvent
from app.services.notifications.webhook import WebhookChannel
from app.services.notifications.wechat_work import WeChatWorkChannel
from app.services.wechat_work_bot.bind_token import generate_bind_token, verify_bind_token
from app.services.wechat_work_bot.file_token import generate_file_token, verify_file_token
from app.services.wechat_work_bot.intranet_parser import parse_source


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://127.0.0.1/private",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/private",
        "http://[fe80::1]/private",
        "http://user:password@example.com/private",
        "http://example.com/path#fragment",
    ],
)
async def test_outbound_url_rejects_dangerous_destinations(url):
    with pytest.raises(ValueError):
        await validate_http_url(url, allow_private=False)


@pytest.mark.asyncio
async def test_trusted_private_http_url_is_allowed():
    url = "http://10.20.0.8/hooks"

    assert await validate_http_url(url, allow_private=True) == url


@pytest.mark.asyncio
async def test_untrusted_private_http_url_is_rejected():
    with pytest.raises(ValueError):
        await validate_http_url("http://10.20.0.8/hooks", allow_private=False)


@pytest.mark.asyncio
async def test_hostname_resolving_to_loopback_is_rejected(monkeypatch):
    def resolve_loopback(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 80))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve_loopback)

    with pytest.raises(ValueError):
        await validate_http_url("http://internal.example/files", allow_private=True)


@pytest.mark.asyncio
async def test_hostname_resolving_to_private_http_is_allowed_for_trusted_source(monkeypatch):
    def resolve_private(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.10.20", 80))]

    monkeypatch.setattr(socket, "getaddrinfo", resolve_private)
    url = "http://files.internal/base"

    assert await validate_http_url(url, allow_private=True) == url


@pytest.mark.parametrize(
    ("file_url", "source_url", "belongs"),
    [
        ("http://files.local/base/file.pdf", "http://files.local/base", True),
        ("http://files.local/base", "http://files.local/base", True),
        ("http://files.local/base/../secret", "http://files.local/base", False),
        ("http://files.local/base/%2e%2e/secret", "http://files.local/base", False),
        ("http://files.local/baseball/secret", "http://files.local/base", False),
        ("https://files.local/base/file.pdf", "http://files.local/base", False),
        ("http://files.local:8080/base/file.pdf", "http://files.local/base", False),
        ("http://other.local/base/file.pdf", "http://files.local/base", False),
    ],
)
def test_file_url_must_be_canonically_contained_by_source(file_url, source_url, belongs):
    assert url_belongs_to_source(file_url, source_url) is belongs


def _decode_token(token: str) -> tuple[str, str]:
    padded = token + "=" * (-len(token) % 4)
    raw = base64.urlsafe_b64decode(padded).decode()
    return raw.rsplit(".", 1)


def test_file_token_uses_full_sha256_hmac(monkeypatch):
    monkeypatch.setattr("app.services.wechat_work_bot.file_token.settings.app_secret_key", "s" * 32)

    token = generate_file_token("source-1", "http://files.local/base/a.pdf")
    _payload, signature = _decode_token(token)

    assert len(signature) == 64
    assert verify_file_token(token) == {
        "sid": "source-1",
        "url": "http://files.local/base/a.pdf",
    }


def test_file_token_rejects_signature_tampering(monkeypatch):
    monkeypatch.setattr("app.services.wechat_work_bot.file_token.settings.app_secret_key", "s" * 32)
    token = generate_file_token("source-1", "http://files.local/base/a.pdf")
    payload, signature = _decode_token(token)
    replacement = "0" if signature[-1] != "0" else "1"
    tampered = base64.urlsafe_b64encode(f"{payload}.{signature[:-1]}{replacement}".encode()).decode()

    assert verify_file_token(tampered) is None


def test_bind_token_uses_full_sha256_hmac(monkeypatch):
    monkeypatch.setattr("app.services.wechat_work_bot.bind_token.settings.app_secret_key", "s" * 32)

    token = generate_bind_token("user-1", "viewer")
    payload, signature = _decode_token(token)

    assert json.loads(payload)["uid"] == "user-1"
    assert len(signature) == 64
    assert verify_bind_token(token) == {"uid": "user-1", "role": "viewer"}


def _notification_event() -> NotificationEvent:
    return NotificationEvent(
        event_type="issue.created",
        title="Test",
        summary="Test",
        detail_url="http://flowy.internal/issues/1",
        actor_name="tester",
        resource_type="issue",
        resource_id="1",
    )


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("channel", "config"),
    [
        (WebhookChannel(), {"url": "http://127.0.0.1/admin"}),
        (WeChatWorkChannel(), {"webhook_url": "http://169.254.169.254/latest/meta-data"}),
    ],
)
async def test_stored_notification_destination_is_revalidated_before_send(
    monkeypatch, channel, config
):
    class UnexpectedHttpClient:
        def __init__(self, *_args, **_kwargs):
            raise AssertionError("unsafe destination reached the HTTP client")

    monkeypatch.setattr("httpx.AsyncClient", UnexpectedHttpClient)

    with pytest.raises(ValueError):
        await channel.send(_notification_event(), config)


@pytest.mark.asyncio
async def test_intranet_parser_rejects_loopback_before_fetch(monkeypatch):
    class UnexpectedHttpClient:
        def __init__(self, *_args, **_kwargs):
            raise AssertionError("loopback source reached the HTTP client")

    monkeypatch.setattr("httpx.AsyncClient", UnexpectedHttpClient)

    with pytest.raises(ValueError):
        await parse_source("http://127.0.0.1/files", "json")


@pytest.mark.asyncio
async def test_intranet_parser_discards_urls_outside_configured_source(monkeypatch):
    def resolve_private(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("192.168.10.20", 80))]

    class FakeResponse:
        text = json.dumps(
            [
                {"name": "safe.pdf", "url": "http://files.internal/base/safe.pdf"},
                {"name": "secret", "url": "http://other.internal/private"},
            ]
        )

        def raise_for_status(self):
            return None

    class FakeHttpClient:
        def __init__(self, *_args, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return False

        async def get(self, _url):
            return FakeResponse()

    monkeypatch.setattr(socket, "getaddrinfo", resolve_private)
    monkeypatch.setattr("httpx.AsyncClient", FakeHttpClient)

    files = await parse_source("http://files.internal/base", "json")

    assert files == [
        {"name": "safe.pdf", "url": "http://files.internal/base/safe.pdf", "mtime": None}
    ]
