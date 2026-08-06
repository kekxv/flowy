"""Reversible, capability-safe storage names for bot attachments."""

import uuid

BASE62_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
_BASE62_VALUES = {character: index for index, character in enumerate(BASE62_ALPHABET)}
_FORMAT_VERSION = 1
_CAPABILITY_BYTES = 16
STORAGE_SUFFIX = ".bin"


def normalize_attachment_name(original_name: str) -> str:
    """Return a safe display/download filename without changing normal Unicode names."""
    basename = str(original_name or "").replace("\\", "/").rsplit("/", 1)[-1]
    cleaned = "".join(
        character if ord(character) >= 32 and ord(character) != 127 else "_"
        for character in basename
    ).strip()
    return cleaned or "download"


def _base62_encode(payload: bytes) -> str:
    number = int.from_bytes(payload, "big")
    encoded: list[str] = []
    while number:
        number, remainder = divmod(number, 62)
        encoded.append(BASE62_ALPHABET[remainder])
    return "".join(reversed(encoded)) or BASE62_ALPHABET[0]


def _base62_decode(value: str) -> bytes | None:
    if not value:
        return None
    number = 0
    try:
        for character in value:
            number = number * 62 + _BASE62_VALUES[character]
    except KeyError:
        return None
    length = max(1, (number.bit_length() + 7) // 8)
    return number.to_bytes(length, "big")


def encode_attachment_name(original_name: str) -> str:
    """Encode a random capability and original filename as one Base62 path component."""
    normalized = normalize_attachment_name(original_name)
    payload = bytes([_FORMAT_VERSION]) + uuid.uuid4().bytes + normalized.encode("utf-8")
    return _base62_encode(payload)


def decode_attachment_name(storage_name: str) -> str | None:
    """Recover an original filename, returning ``None`` for legacy/invalid names."""
    storage_name = storage_name.removesuffix(STORAGE_SUFFIX)
    payload = _base62_decode(storage_name)
    prefix_length = 1 + _CAPABILITY_BYTES
    if not payload or len(payload) <= prefix_length or payload[0] != _FORMAT_VERSION:
        return None
    try:
        original_name = payload[prefix_length:].decode("utf-8")
    except UnicodeDecodeError:
        return None
    normalized = normalize_attachment_name(original_name)
    return normalized if normalized == original_name else None
