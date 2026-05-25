import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_token, decrypt_token
from app.models.external import ExternalConnection
from app.services.external import get_client


async def create_pat_connection(
    db: AsyncSession,
    user_id: str,
    provider: str,
    token: str,
    instance_url: str = "",
) -> ExternalConnection:
    client = get_client(provider, token, instance_url)
    username = await client.get_current_username()

    conn = ExternalConnection(
        id=str(uuid.uuid4()),
        user_id=user_id,
        provider=provider,
        pat_token=encrypt_token(token),
        instance_url=instance_url,
        remote_username=username,
        remote_user_id=username,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    return conn


async def test_connection(db: AsyncSession, connection_id: str) -> bool:
    conn = await db.get(ExternalConnection, connection_id)
    if not conn:
        return False
    encrypted = conn.pat_token or conn.oauth_token
    if not encrypted:
        return False
    token = decrypt_token(encrypted)
    client = get_client(conn.provider, token, conn.instance_url)
    return await client.test_connection()


async def get_user_connections(
    db: AsyncSession, user_id: str
) -> list[ExternalConnection]:
    result = await db.execute(
        select(ExternalConnection).where(ExternalConnection.user_id == user_id)
    )
    return list(result.scalars().all())


async def delete_connection(db: AsyncSession, connection: ExternalConnection) -> None:
    await db.delete(connection)
    await db.commit()
