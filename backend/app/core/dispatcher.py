import asyncio
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationChannel as NotificationChannelModel
from app.models.notification import NotificationLog, NotificationRule
from app.services.notifications import get_channel
from app.services.notifications.base import NotificationEvent

logger = logging.getLogger(__name__)


async def dispatch(db: AsyncSession, event: NotificationEvent) -> None:
    """Dispatch an event to all matching notification rules. Non-blocking per-channel.

    Note: This function does NOT commit the session. The caller is responsible
    for committing after all database operations are complete.
    """

    # Find matching rules (event_type can be comma-separated for multi-event rules)
    result = await db.execute(
        select(NotificationRule).where(NotificationRule.is_active == True)  # noqa: E712
    )
    all_rules = list(result.scalars().all())
    rules = [r for r in all_rules if event.event_type in r.event_type.split(",")]

    if rules:
        logger.debug("Dispatching event %s to %d rule(s)", event.event_type, len(rules))

    async def send_to_channel(rule: NotificationRule) -> None:
        try:
            channel_model = await db.get(NotificationChannelModel, rule.channel_id)
            if not channel_model or not channel_model.is_active:
                return

            channel_impl = get_channel(channel_model.channel_type)
            config = channel_model.config_dict
            await channel_impl.send(event, config)

            log = NotificationLog(
                id=str(uuid.uuid4()),
                channel_id=channel_model.id,
                rule_id=rule.id,
                event_type=event.event_type,
                status="success",
                message=f"Sent to {channel_model.name}",
            )
            db.add(log)
        except Exception as e:
            log = NotificationLog(
                id=str(uuid.uuid4()),
                channel_id=rule.channel_id,
                rule_id=rule.id,
                event_type=event.event_type,
                status="failed",
                error=str(e),
            )
            db.add(log)

    await asyncio.gather(*[send_to_channel(rule) for rule in rules])
    # Removed: await db.commit() — caller is responsible for committing
