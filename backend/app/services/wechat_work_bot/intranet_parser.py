"""Parse intranet file listings from JSON APIs and nginx Index pages."""

import html
import logging
import re
from datetime import datetime
from urllib.parse import unquote, urljoin

import httpx

from app.core.url_security import url_belongs_to_source, validate_http_url

logger = logging.getLogger("uvicorn")


async def parse_source(
    url: str,
    source_type: str,
    auth: tuple[str, str] | None = None,
) -> list[dict]:
    """Fetch and parse a file listing from an intranet source.

    Returns list of {"name": str, "url": str} dicts.
    """
    await validate_http_url(url, allow_private=True)
    basic_auth = httpx.BasicAuth(*auth) if auth else None
    async with httpx.AsyncClient(
        timeout=10,
        follow_redirects=False,
        auth=basic_auth,
    ) as client:
        resp = await client.get(url)
        if 300 <= getattr(resp, "status_code", 200) < 400:
            raise ValueError("Intranet source redirects are not allowed")
        resp.raise_for_status()

    if source_type == "json":
        files = _parse_json(resp.text, url)
    elif source_type == "nginx":
        files = _parse_nginx(resp.text, url)
    else:
        raise ValueError(f"Unknown source type: {source_type}")
    return [item for item in files if url_belongs_to_source(item.get("url", ""), url)]


def _parse_json(body: str, base_url: str) -> list[dict]:
    """Parse JSON response into file list.

    Supports:
    - Array of objects: [{"name": "file.pdf", "url": "..."}, ...]
    - Object with files key: {"files": [{"name": "...", "url": "..."}]}
    - Flat array of strings: ["file1.pdf", "file2.zip"]
    """
    import json
    data = json.loads(body)

    # {"files": [...]}
    if isinstance(data, dict):
        items = data.get("files", data.get("data", []))
        if not isinstance(items, list):
            raise ValueError("JSON response missing 'files' or 'data' array")
        return _normalize_json_items(items, base_url)

    # [...]
    if isinstance(data, list):
        return _normalize_json_items(data, base_url)

    raise ValueError("Unsupported JSON format")


def _normalize_json_items(items: list, base_url: str) -> list[dict]:
    """Normalize a JSON array into [{name, url, mtime}] format."""
    result = []
    base = base_url.rstrip("/") + "/"

    for item in items:
        if isinstance(item, str):
            # Flat string: treat as filename
            name = item
            file_url = urljoin(base, item)
            mtime = None
            size = None
        elif isinstance(item, dict):
            name = item.get("name") or item.get("filename") or item.get("title", "")
            file_url = item.get("url") or item.get("link") or item.get("href", "")
            if file_url and not file_url.startswith(("http://", "https://")):
                file_url = urljoin(base, file_url)
            # Try multiple time field names
            mtime = _parse_time(
                item.get("mtime") or item.get("time") or item.get("modified")
                or item.get("last_modified") or item.get("updated_at")
            )
            raw_size = next(
                (item[key] for key in ("size", "file_size", "content_length") if key in item),
                None,
            )
            size = _parse_size(raw_size)
        else:
            continue

        if name:
            result.append({"name": name, "url": file_url, "mtime": mtime, "size": size})

    # Sort by mtime descending (newest first), fallback to name
    return sorted(
        result,
        key=lambda x: (x.get("mtime") or "", x["name"].lower()),
        reverse=True,
    )


# Date patterns commonly seen in nginx index pages and JSON APIs
_DATE_FORMATS = [
    "%Y-%m-%d %H:%M:%S",
    "%Y-%m-%d %H:%M",
    "%Y-%m-%dT%H:%M:%S",
    "%Y-%m-%dT%H:%M:%SZ",
    "%Y-%m-%d",
    "%d-%b-%Y %H:%M:%S",  # nginx default: 15-Jan-2024 10:30:00
]


def _parse_time(value) -> str | None:
    """Parse a time value (str, int timestamp, or datetime) into ISO format string.

    Returns None if parsing fails.
    """
    if value is None:
        return None

    if isinstance(value, (int, float)):
        try:
            return datetime.fromtimestamp(value).isoformat()
        except (ValueError, OSError):
            return None

    if isinstance(value, datetime):
        return value.isoformat()

    if not isinstance(value, str):
        return None

    value = value.strip()
    if not value:
        return None

    # Strip trailing timezone labels (GMT, UTC, etc.) for parsing
    value = re.sub(r'\s+(GMT|UTC|CST|EST|PST|JST)\s*$', '', value, flags=re.IGNORECASE)
    value = value.strip()

    # Try numeric timestamp
    if value.isdigit():
        try:
            return datetime.fromtimestamp(int(value)).isoformat()
        except (ValueError, OSError):
            pass

    # Try known formats
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(value, fmt).isoformat()
        except ValueError:
            continue

    return None


def _parse_size(value) -> int | None:
    """Normalize byte counts and human-readable binary units to bytes."""
    if value is None or isinstance(value, bool):
        return None
    match = re.fullmatch(
        r"(\d+(?:\.\d+)?)\s*([kmgt]?i?b?)?",
        str(value).strip(),
        re.IGNORECASE,
    )
    if not match:
        return None
    units = {
        "": 1,
        "B": 1,
        "K": 1024,
        "KB": 1024,
        "KIB": 1024,
        "M": 1024**2,
        "MB": 1024**2,
        "MIB": 1024**2,
        "G": 1024**3,
        "GB": 1024**3,
        "GIB": 1024**3,
        "T": 1024**4,
        "TB": 1024**4,
        "TIB": 1024**4,
    }
    unit = (match.group(2) or "").upper()
    multiplier = units.get(unit)
    if multiplier is None:
        return None
    return int(float(match.group(1)) * multiplier)


def _parse_nginx(html_text: str, base_url: str) -> list[dict]:
    """Parse nginx 'Index of /' HTML page into file list.

    Extracts <a href="..."> links with modification times when available.
    Skips parent directory (../), sorting entries (?C=...), and directory links (ending with /).
    Derives filenames from href (not link text) to avoid garbled display.
    """
    base = base_url.rstrip("/") + "/"

    # Match <a ...href="...">...</a> — use [^>]* to tolerate any attrs,
    # and [\s\S]*? for the body so it captures HTML entities like &gt;
    links = re.findall(
        r'<a\s+[^>]*href="([^"]+)"[^>]*>([\s\S]*?)</a>',
        html_text,
        re.IGNORECASE,
    )

    result = []
    for href, raw_text in links:
        # Skip parent directory
        if href in ("..", "../"):
            continue
        # Skip nginx sorting links (?C=N;O=D etc.)
        if href.startswith("?"):
            continue
        # Skip absolute non-http paths and mailto
        if href.startswith("/") and not href.startswith("//"):
            continue
        if href.startswith("mailto:"):
            continue
        # Skip protocol-relative
        if href.startswith("//"):
            continue

        # Skip directory entries (href ends with /)
        if href.endswith("/"):
            continue

        # Decode href: unescape HTML entities, URL-decode, then take basename as filename
        decoded_href = html.unescape(unquote(href))
        name = decoded_href.rsplit("/", 1)[-1]

        # Fallback: decode link text (strip HTML tags and entities)
        if not name:
            clean_text = re.sub(r'<[^>]+>', '', raw_text)  # strip any inner tags
            name = html.unescape(clean_text).strip().rstrip("/")

        if not name:
            continue

        # Try to extract modification time from nearby content
        mtime = _extract_nginx_time(html_text, href)
        size = _extract_nginx_size(html_text, href)

        file_url = urljoin(base, href)
        result.append({"name": name, "url": file_url, "mtime": mtime, "size": size})

    # Sort by mtime descending (newest first), fallback to name
    return sorted(
        result,
        key=lambda x: (x.get("mtime") or "", x["name"].lower()),
        reverse=True,
    )


# Patterns for extracting time from nginx HTML near a link
_NGINX_TIME_PATTERNS = [
    # ISO-like: 2024-01-15 10:30 or 2024-01-15 10:30:00
    re.compile(r'(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?)'),
    # nginx default format: 15-Jan-2024 10:30:00 GMT
    re.compile(r'(\d{2}-\w{3}-\d{4}\s+\d{2}:\d{2}(?::\d{2})?(?:\s+\w+)?)'),
]


def _extract_nginx_time(html_text: str, href: str) -> str | None:
    """Try to extract a modification time from the HTML near the given href.

    Searches the line/row containing the href for date patterns.
    """
    # Find the href position in the HTML
    pos = html_text.find(href)
    if pos == -1:
        return None

    # Look at the surrounding context (same line or next 300 chars)
    end = min(pos + len(href) + 300, len(html_text))
    # Find the line boundary
    line_end = html_text.find('\n', pos)
    if line_end == -1:
        line_end = end
    context = html_text[pos:line_end]

    for pattern in _NGINX_TIME_PATTERNS:
        m = pattern.search(context)
        if m:
            parsed = _parse_time(m.group(1))
            if parsed:
                return parsed

    return None


def _extract_nginx_size(html_text: str, href: str) -> int | None:
    """Extract a trailing size value from the link's row or preformatted line."""
    pos = html_text.find(href)
    if pos == -1:
        return None
    anchor_end = html_text.find("</a>", pos)
    if anchor_end == -1:
        return None
    line_end = html_text.find("\n", anchor_end)
    if line_end == -1:
        line_end = min(anchor_end + 300, len(html_text))
    context = html_text[anchor_end + 4 : line_end]
    plain_text = html.unescape(re.sub(r"<[^>]+>", " ", context)).strip()
    match = re.search(
        r"(?:^|\s)(\d+(?:\.\d+)?\s*(?:[kmgt](?:i?b)?|b)?)\s*$",
        plain_text,
        re.IGNORECASE,
    )
    return _parse_size(match.group(1)) if match else None
