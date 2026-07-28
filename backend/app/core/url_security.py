"""Validation helpers for server-side HTTP requests."""

import asyncio
import ipaddress
import posixpath
import socket
from collections.abc import Collection
from urllib.parse import unquote, urlsplit

_TRUSTED_PRIVATE_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("fc00::/7"),
)


def _is_trusted_private(address: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    return any(address in network for network in _TRUSTED_PRIVATE_NETWORKS)


def _validate_address(address_text: str, *, private_allowed: bool) -> None:
    address = ipaddress.ip_address(address_text)
    if isinstance(address, ipaddress.IPv6Address) and address.ipv4_mapped:
        address = address.ipv4_mapped

    if (
        address.is_loopback
        or address.is_link_local
        or address.is_multicast
        or address.is_unspecified
        or address.is_reserved
    ):
        raise ValueError("URL resolves to a prohibited network address")

    if address.is_global:
        return
    if private_allowed and _is_trusted_private(address):
        return
    raise ValueError("Private network destinations are not allowed")


async def validate_http_url(
    url: str,
    *,
    allow_private: bool = False,
    allowed_hosts: Collection[str] = (),
) -> str:
    """Validate an HTTP(S) URL before the server makes an outbound request."""
    if not isinstance(url, str) or not url or any(ord(char) <= 32 for char in url):
        raise ValueError("URL is empty or contains whitespace/control characters")

    try:
        parsed = urlsplit(url)
        port = parsed.port
    except ValueError as exc:
        raise ValueError("Malformed URL") from exc

    if parsed.scheme.lower() not in {"http", "https"}:
        raise ValueError("Only HTTP and HTTPS URLs are allowed")
    if not parsed.hostname:
        raise ValueError("URL must include a hostname")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URL credentials are not allowed")
    if parsed.fragment:
        raise ValueError("URL fragments are not allowed")

    hostname = parsed.hostname.rstrip(".").lower()
    trusted_hosts = {host.rstrip(".").lower() for host in allowed_hosts}
    private_allowed = allow_private or hostname in trusted_hosts

    try:
        literal_address = ipaddress.ip_address(hostname)
    except ValueError:
        try:
            addresses = await asyncio.to_thread(
                socket.getaddrinfo,
                hostname,
                port or (443 if parsed.scheme.lower() == "https" else 80),
                type=socket.SOCK_STREAM,
            )
        except socket.gaierror as exc:
            raise ValueError("URL hostname could not be resolved") from exc
        resolved = {entry[4][0].split("%", 1)[0] for entry in addresses}
        if not resolved:
            raise ValueError("URL hostname did not resolve to an address")
        for address in resolved:
            _validate_address(address, private_allowed=private_allowed)
    else:
        _validate_address(str(literal_address), private_allowed=private_allowed)

    return url


def _canonical_path(path: str) -> str:
    decoded = path
    for _ in range(3):
        next_value = unquote(decoded)
        if next_value == decoded:
            break
        decoded = next_value
    decoded = decoded.replace("\\", "/")
    normalized = posixpath.normpath("/" + decoded.lstrip("/"))
    return normalized if normalized.startswith("/") else f"/{normalized}"


def _effective_port(scheme: str, port: int | None) -> int:
    if port is not None:
        return port
    return 443 if scheme == "https" else 80


def url_belongs_to_source(file_url: str, source_url: str) -> bool:
    """Return whether a file URL is canonically contained by a configured source."""
    try:
        file_parts = urlsplit(file_url)
        source_parts = urlsplit(source_url)
        file_scheme = file_parts.scheme.lower()
        source_scheme = source_parts.scheme.lower()
        if file_scheme not in {"http", "https"} or source_scheme not in {"http", "https"}:
            return False
        if not file_parts.hostname or not source_parts.hostname:
            return False
        if file_parts.username is not None or file_parts.password is not None:
            return False
        if source_parts.username is not None or source_parts.password is not None:
            return False
        if file_parts.fragment or source_parts.fragment:
            return False
        if file_scheme != source_scheme:
            return False
        if file_parts.hostname.rstrip(".").lower() != source_parts.hostname.rstrip(".").lower():
            return False
        if _effective_port(file_scheme, file_parts.port) != _effective_port(
            source_scheme, source_parts.port
        ):
            return False
    except (TypeError, ValueError):
        return False

    file_path = _canonical_path(file_parts.path)
    source_path = _canonical_path(source_parts.path).rstrip("/") or "/"
    if source_path == "/":
        return file_path.startswith("/")
    return file_path == source_path or file_path.startswith(f"{source_path}/")
