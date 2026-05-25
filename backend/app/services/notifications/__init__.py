from app.services.notifications.base import NotificationChannel
from app.services.notifications.webhook import WebhookChannel
from app.services.notifications.wechat_work import WeChatWorkChannel

CHANNEL_REGISTRY: dict[str, type[NotificationChannel]] = {
    "webhook": WebhookChannel,
    "wechat_work": WeChatWorkChannel,
}


def get_channel(channel_type: str) -> NotificationChannel:
    cls = CHANNEL_REGISTRY.get(channel_type)
    if not cls:
        raise ValueError(f"Unknown channel type: {channel_type}")
    return cls()
