"""Regression tests for download-specific proxy timeouts."""

from pathlib import Path


def test_intranet_download_uses_long_activity_timeouts():
    """Slow active downloads are not cut off by the general API 30s timeout."""
    config = (Path(__file__).resolve().parents[2] / "nginx.conf").read_text()

    assert "location = /api/v1/intranet/download {" in config
    download_location = config.split("location = /api/v1/intranet/download {", 1)[1].split(
        "\n    }", 1
    )[0]
    assert "proxy_read_timeout 3600s;" in download_location
    assert "proxy_send_timeout 3600s;" in download_location
