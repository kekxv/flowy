"""milestone owner

Revision ID: e002
Revises: e001
Create Date: 2026-05-25 23:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e002'
down_revision: Union[str, None] = 'e001'
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("milestones") as batch:
        batch.add_column(sa.Column("owner_id", sa.String(36), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("milestones") as batch:
        batch.drop_column("owner_id")
