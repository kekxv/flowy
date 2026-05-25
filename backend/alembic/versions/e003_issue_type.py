"""issue type field

Revision ID: e003
Revises: e002
Create Date: 2026-05-26 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e003'
down_revision: Union[str, None] = 'e002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("issues") as batch:
        batch.add_column(sa.Column("issue_type", sa.String(16), server_default="bug"))


def downgrade() -> None:
    with op.batch_alter_table("issues") as batch:
        batch.drop_column("issue_type")
