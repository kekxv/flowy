"""add issue and milestone schedule dates

Revision ID: e012
Revises: e011
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e012"
down_revision: str | None = "e011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("issues", sa.Column("start_date", sa.String(length=32), nullable=True))
    op.add_column("issues", sa.Column("due_date", sa.String(length=32), nullable=True))
    op.add_column("milestones", sa.Column("start_date", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("milestones", "start_date")
    op.drop_column("issues", "due_date")
    op.drop_column("issues", "start_date")
