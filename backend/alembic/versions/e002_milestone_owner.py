"""milestone owner

Revision ID: e002
Revises: e001
Create Date: 2026-05-25 23:00:00.000000
"""

import sqlalchemy as sa

from alembic import op

revision: str = "e002"
down_revision: str | None = "e001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("milestones") as batch:
        batch.add_column(sa.Column("owner_id", sa.String(36), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("milestones") as batch:
        batch.drop_column("owner_id")
