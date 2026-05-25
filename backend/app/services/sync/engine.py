import json
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token
from app.models.external import ExternalConnection, ExternalIssue, SyncLog
from app.models.issue import Issue
from app.services.external import get_client
from app.services.sync.mapper import external_status_to_flowy, flowy_status_to_external


async def run_sync(db: AsyncSession, connection_id: str) -> SyncLog:
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or not conn.pat_token:
        raise ValueError("Connection not found or no token")

    sync_log = SyncLog(
        id=str(uuid.uuid4()),
        connection_id=connection_id,
        direction="bidirectional",
        status="running",
        started_at=datetime.now().isoformat(),
    )
    db.add(sync_log)
    await db.commit()

    token = decrypt_token(conn.pat_token)
    client = get_client(conn.provider, token, conn.instance_url)
    errors = []
    issues_processed = 0
    issues_created = 0
    issues_updated = 0

    try:
        # Find all ExternalIssue records for this connection
        result = await db.execute(
            select(ExternalIssue).where(ExternalIssue.connection_id == connection_id)
        )
        ext_issues = list(result.scalars().all())

        for ext in ext_issues:
            try:
                local_issue = await db.get(Issue, ext.issue_id)
                if not local_issue:
                    continue

                remote = await client.get_issue(
                    ext.external_repo, int(ext.external_id)
                )
                issues_processed += 1

                local_updated = datetime.fromisoformat(local_issue.updated_at)
                remote_updated = datetime.fromisoformat(remote.updated_at.replace("Z", "+00:00"))
                last_synced = (
                    datetime.fromisoformat(ext.last_synced_at.replace("Z", "+00:00"))
                    if ext.last_synced_at
                    else datetime.min.replace(tzinfo=local_updated.tzinfo)
                )

                if remote_updated > last_synced and local_updated > last_synced:
                    # Conflict: prefer remote
                    local_issue.title = remote.title
                    local_issue.status = external_status_to_flowy(remote.status, conn.provider)
                    local_issue.updated_at = datetime.now().isoformat()
                    issues_updated += 1
                elif remote_updated > last_synced:
                    local_issue.title = remote.title
                    local_issue.status = external_status_to_flowy(remote.status, conn.provider)
                    issues_updated += 1
                elif local_updated > last_synced:
                    # Push local changes to remote
                    await client.update_issue(
                        ext.external_repo,
                        int(ext.external_id),
                        title=local_issue.title,
                        state=flowy_status_to_external(local_issue.status, conn.provider),
                    )
                    issues_updated += 1

                ext.title = remote.title
                ext.status = remote.status
                ext.last_synced_at = datetime.now().isoformat()
                ext.updated_at = datetime.now().isoformat()

            except Exception as e:
                errors.append(
                    f"Error syncing ext issue #{ext.external_id} in {ext.external_repo}: {e}"
                )

        conn.last_synced_at = datetime.now().isoformat()
        sync_log.completed_at = datetime.now().isoformat()
        sync_log.issues_processed = issues_processed
        sync_log.issues_created = issues_created
        sync_log.issues_updated = issues_updated
        sync_log.status = "partial" if errors else "success"
        if errors:
            sync_log.errors = json.dumps(errors)

    except Exception as e:
        sync_log.status = "failed"
        sync_log.completed_at = datetime.now().isoformat()
        sync_log.errors = json.dumps([str(e)])

    await db.commit()
    return sync_log


async def get_sync_logs(
    db: AsyncSession, connection_id: str
) -> list[SyncLog]:
    result = await db.execute(
        select(SyncLog)
        .where(SyncLog.connection_id == connection_id)
        .order_by(SyncLog.started_at.desc())
        .limit(20)
    )
    return list(result.scalars().all())
