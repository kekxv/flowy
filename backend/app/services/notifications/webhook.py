import httpx

from app.services.notifications.base import NotificationChannel, NotificationEvent


class WebhookChannel(NotificationChannel):
    """Generic webhook: POST JSON to a URL."""

    @staticmethod
    def config_schema() -> dict:
        return {
            "type": "object",
            "required": ["url"],
            "properties": {
                "url": {
                    "type": "string",
                    "title": "Webhook URL",
                    "description": "URL to POST notification payload",
                },
                "secret": {
                    "type": "string",
                    "title": "Secret (optional)",
                    "description": "Header X-Signature value for verification",
                },
            },
        }

    async def validate_config(self, config: dict) -> bool:
        url = config.get("url", "")
        if not url:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json={"test": True})
                return resp.status_code < 500
        except Exception:
            return False

    async def send(self, event: NotificationEvent, config: dict) -> bool:
        url = config["url"]
        payload = {
            "event": event.event_type,
            "title": event.title,
            "summary": event.summary,
            "detail_url": event.detail_url,
            "actor": event.actor_name,
            "timestamp": event.timestamp,
            "resource_type": event.resource_type,
            "resource_id": event.resource_id,
            "extra": event.extra,
        }
        headers = {"Content-Type": "application/json"}
        if config.get("secret"):
            headers["X-Signature"] = config["secret"]

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
        return True
