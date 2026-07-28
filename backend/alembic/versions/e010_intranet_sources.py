"""intranet_sources table

Revision ID: e010_intranet_sources
Revises: 3f7c693c5206
Create Date: 2026-07-28 14:00:00.000000
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = 'e010_intranet_sources'
down_revision: str | None = '3f7c693c5206'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'intranet_sources',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(128), nullable=False),
        sa.Column('url', sa.String(512), nullable=False),
        sa.Column('source_type', sa.String(16), nullable=False, server_default='json'),
        sa.Column('file_ttl_seconds', sa.Integer, nullable=False, server_default='3600'),
        sa.Column('created_at', sa.String(32), nullable=False),
        sa.Column('updated_at', sa.String(32), nullable=False),
        sa.CheckConstraint(
            "source_type IN ('json','nginx')",
            name='ck_intranet_source_type',
        ),
    )


def downgrade() -> None:
    op.drop_table('intranet_sources')
