"""Add temporary read-only bot detail links."""

import sqlalchemy as sa

from alembic import op

revision = "e020"
down_revision = "e019"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "temporary_bot_details",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_encrypted", sa.Text(), nullable=True),
        sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False, server_default=""),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("expires_at", sa.String(32), nullable=False),
        sa.Column("created_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_temporary_bot_details_token_hash", "temporary_bot_details", ["token_hash"], unique=True)
    op.create_index("ix_temporary_bot_details_creator_id", "temporary_bot_details", ["creator_id"])
    op.create_index("ix_temporary_bot_details_expires_at", "temporary_bot_details", ["expires_at"])
    op.create_index("ix_temporary_bot_details_active", "temporary_bot_details", ["token_hash", "expires_at"])


def downgrade():
    op.drop_table("temporary_bot_details")
