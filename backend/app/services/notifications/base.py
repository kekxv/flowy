from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime


@dataclass
class NotificationEvent:
    event_type: str
    title: str
    summary: str
    detail_url: str
    actor_name: str
    resource_type: str
    resource_id: str | None = None
    extra: dict = field(default_factory=dict)
    timestamp: str = field(default_factory=lambda: datetime.now().astimezone().isoformat())


class NotificationChannel(ABC):
    """Abstract base for notification channels (WeChat Work, Webhook, Slack, etc.)"""

    @abstractmethod
    async def validate_config(self, config: dict) -> bool:
        """Validate config is correct (e.g. webhook URL reachable)."""
        ...

    @abstractmethod
    async def send(self, event: NotificationEvent, config: dict) -> bool:
        """Send notification. Return True on success. Raise on failure."""
        ...

    @staticmethod
    def config_schema() -> dict:
        """JSON Schema describing config fields. Frontend renders form from this."""
        return {"type": "object", "required": [], "properties": {}}
