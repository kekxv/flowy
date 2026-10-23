"""Add test request management tables."""

import sqlalchemy as sa

from alembic import op

revision = "e017"
down_revision = "e016"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "test_collection_links",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column(
            "creator_id",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("expires_at", sa.String(32), nullable=False),
        sa.Column("used_at", sa.String(32)),
        sa.Column("revoked_at", sa.String(32)),
        sa.Column("attachment_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_test_collection_links_token_hash", "test_collection_links", ["token_hash"])
    op.create_index("ix_test_collection_links_creator_id", "test_collection_links", ["creator_id"])
    op.create_table(
        "test_collection_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "collection_id",
            sa.String(36),
            sa.ForeignKey("test_collection_links.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column(
            "content_type",
            sa.String(255),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index(
        "ix_test_collection_attachments_collection_id",
        "test_collection_attachments",
        ["collection_id"],
    )
    op.create_table(
        "test_requests",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("catalog", sa.String(500), nullable=False, server_default=""),
        sa.Column("expected_effect", sa.Text(), nullable=False, server_default=""),
        sa.Column("current_behavior", sa.Text(), nullable=False, server_default=""),
        sa.Column("issue_id", sa.String(36), sa.ForeignKey("issues.id", ondelete="SET NULL")),
        sa.Column("reporter_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("tester_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(16), nullable=False, server_default="submitted"),
        sa.Column("rejection_reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.Column("updated_at", sa.String(32), nullable=False),
        sa.CheckConstraint(
            "status IN ('submitted','queued','testing','passed','failed','cancelled','rejected')",
            name="ck_test_request_status",
        ),
    )
    op.create_index("ix_test_requests_status", "test_requests", ["status"])
    op.create_table(
        "test_runs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "request_id",
            sa.String(36),
            sa.ForeignKey("test_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("tester_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("version", sa.String(256), nullable=False, server_default=""),
        sa.Column("method", sa.Text(), nullable=False, server_default=""),
        sa.Column("server_url", sa.String(1000), nullable=False, server_default=""),
        sa.Column("steps", sa.Text(), nullable=False, server_default=""),
        sa.Column("result", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(32), nullable=False),
        sa.CheckConstraint("status IN ('passed','failed')", name="ck_test_run_status"),
    )
    op.create_index("ix_test_runs_request_id", "test_runs", ["request_id"])
    op.create_table(
        "test_attachments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "request_id",
            sa.String(36),
            sa.ForeignKey("test_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("run_id", sa.String(36), sa.ForeignKey("test_runs.id", ondelete="CASCADE")),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("original_name", sa.String(255), nullable=False),
        sa.Column(
            "content_type",
            sa.String(255),
            nullable=False,
            server_default="application/octet-stream",
        ),
        sa.Column("size", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_test_attachments_request_id", "test_attachments", ["request_id"])
    op.create_table(
        "test_status_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "request_id",
            sa.String(36),
            sa.ForeignKey("test_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_status", sa.String(16), nullable=False),
        sa.Column("to_status", sa.String(16), nullable=False),
        sa.Column("changed_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(32), nullable=False),
    )
    op.create_index("ix_test_status_history_request_id", "test_status_history", ["request_id"])


def downgrade():
    op.drop_table("test_status_history")
    op.drop_table("test_attachments")
    op.drop_index("ix_test_runs_request_id", table_name="test_runs")
    op.drop_table("test_runs")
    op.drop_index("ix_test_requests_status", table_name="test_requests")
    op.drop_table("test_requests")
    op.drop_index(
        "ix_test_collection_attachments_collection_id", table_name="test_collection_attachments"
    )
    op.drop_table("test_collection_attachments")
    op.drop_index("ix_test_collection_links_creator_id", table_name="test_collection_links")
    op.drop_index("ix_test_collection_links_token_hash", table_name="test_collection_links")
    op.drop_table("test_collection_links")
