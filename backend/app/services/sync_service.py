import asyncio
import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select

from app.config import settings
from app.core.crypto import decrypt_token
from app.core.dispatcher import dispatch
from app.database import async_session
from app.models.external import ExternalConnection, ExternalIssue
from app.models.issue import Issue
from app.models.tracking import IssueAssigneeLog
from app.services.external import get_client
from app.services.notifications.base import NotificationEvent
from app.utils.settings import get_frontend_url

logger = logging.getLogger("uvicorn")


class SyncService:
    def __init__(self):
        self._task: asyncio.Task | None = None

    async def start(self):
        if self._task:
            return
        self._task = asyncio.create_task(self._loop())
        logger.info(f"External sync started (every {settings.sync_interval_minutes} min)")

    async def stop(self):
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
            self._task = None

    async def _loop(self):
        while True:
            await asyncio.sleep(settings.sync_interval_minutes * 60)
            try:
                await self.sync_all()
            except Exception as e:
                logger.error(f"Sync error: {e}")

    async def sync_all(self):
        """Sync all external issue links."""
        async with async_session() as db:
            links = await db.execute(select(ExternalIssue))
            links = list(links.scalars().all())
            if not links:
                return

            updated = 0
            for link in links:
                try:
                    conn = await db.get(ExternalConnection, link.connection_id)
                    if not conn:
                        continue
                    encrypted = conn.pat_token or conn.oauth_token
                    if not encrypted:
                        continue

                    # Only sync if last sync was more than 1 minute ago
                    if link.last_synced_at:
                        try:
                            last = datetime.fromisoformat(link.last_synced_at)
                            if datetime.now() - last < timedelta(minutes=1):
                                continue
                        except ValueError:
                            pass

                    token = decrypt_token(encrypted)
                    client = get_client(conn.provider, token, conn.instance_url)
                    results = await client.search_issues(link.external_repo, link.external_id)
                    if results:
                        ri = results[0]
                        old_status = link.status
                        link.title = ri.title
                        link.status = ri.status
                        link.external_url = ri.url
                        link.link_type = ri.link_type
                        link.last_synced_at = datetime.now().isoformat()
                        updated += 1

                        # Log status change to issue activity
                        if old_status != ri.status:
                            log = IssueAssigneeLog(
                                id=str(uuid.uuid4()),
                                issue_id=link.issue_id,
                                user_id=conn.user_id,
                                role=f"external_{ri.link_type}",
                                action=f"external_{ri.link_type}_status_changed",
                                changed_by=conn.user_id,
                                created_at=datetime.now().isoformat(),
                            )
                            db.add(log)

                            # Dispatch notification
                            try:
                                flowy_issue = await db.get(Issue, link.issue_id)
                                issue_title = flowy_issue.title if flowy_issue else link.issue_id
                                frontend_url = await get_frontend_url(db)
                                await dispatch(
                                    db,
                                    NotificationEvent(
                                        event_type="external_link.updated",
                                        title=f"External {ri.link_type}: {ri.title}",
                                        summary=f"Flowy #{link.issue_id[:8]} | {link.external_repo}#{link.external_id}: {old_status} → {ri.status}",
                                        detail_url=f"{frontend_url}/issues/{link.issue_id}",
                                        actor_name="Sync",
                                        resource_type=f"external_{ri.link_type}",
                                        resource_id=link.id,
                                        extra={
                                            "flowy_issue_title": issue_title,
                                            "external_title": ri.title,
                                            "old_status": old_status,
                                            "new_status": ri.status,
                                        },
                                    ),
                                )
                                await db.commit()  # Persist notification logs
                            except Exception as e:
                                logger.warning(f"Notification dispatch failed: {e}")
                except Exception as e:
                    logger.warning(f"Sync failed for link {link.id}: {e}")
                    continue

            if updated > 0:
                await db.commit()
                logger.info(f"Synced {updated}/{len(links)} external links")


sync_service = SyncService()
