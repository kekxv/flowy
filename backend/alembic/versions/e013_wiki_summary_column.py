"""add Markdown summary to wiki pages

Revision ID: e013
Revises: e012
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "e013"
down_revision: str | None = "e012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("wiki_pages", sa.Column("summary", sa.Text(), server_default="", nullable=False))


def downgrade() -> None:
    op.drop_column("wiki_pages", "summary")
