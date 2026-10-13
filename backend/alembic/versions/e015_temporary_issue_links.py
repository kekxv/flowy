"""add one-time temporary issue links"""
import sqlalchemy as sa
from alembic import op
revision = "e015"
down_revision = "e014"
branch_labels = None
depends_on = None
def upgrade() -> None:
    op.create_table("temporary_issue_links", sa.Column("id", sa.String(36), primary_key=True), sa.Column("token_hash", sa.String(64), nullable=False), sa.Column("creator_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False), sa.Column("expires_at", sa.String(32), nullable=False), sa.Column("used_at", sa.String(32)), sa.Column("issue_id", sa.String(36), sa.ForeignKey("issues.id", ondelete="SET NULL")), sa.Column("attachment_count", sa.Integer(), nullable=False, server_default="0"), sa.Column("created_at", sa.String(32), nullable=False), sa.UniqueConstraint("token_hash"))
    op.create_index("ix_temporary_issue_links_token_hash", "temporary_issue_links", ["token_hash"])
    op.create_index("ix_temporary_issue_links_creator_id", "temporary_issue_links", ["creator_id"])
    op.create_index("ix_temporary_issue_links_expires_at", "temporary_issue_links", ["expires_at"])
    op.create_index("ix_temporary_issue_links_creator_active", "temporary_issue_links", ["creator_id", "expires_at", "used_at"])
def downgrade() -> None:
    op.drop_index("ix_temporary_issue_links_creator_active", table_name="temporary_issue_links")
    op.drop_index("ix_temporary_issue_links_expires_at", table_name="temporary_issue_links")
    op.drop_index("ix_temporary_issue_links_creator_id", table_name="temporary_issue_links")
    op.drop_index("ix_temporary_issue_links_token_hash", table_name="temporary_issue_links")
    op.drop_table("temporary_issue_links")
