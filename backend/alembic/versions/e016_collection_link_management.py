"""Persist encrypted collection tokens and support cancellation."""
import sqlalchemy as sa

from alembic import op

revision = "e016"
down_revision = "e015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("temporary_issue_links", sa.Column("token_encrypted", sa.Text(), nullable=True))
    op.add_column("temporary_issue_links", sa.Column("revoked_at", sa.String(32), nullable=True))


def downgrade() -> None:
    op.drop_column("temporary_issue_links", "revoked_at")
    op.drop_column("temporary_issue_links", "token_encrypted")
