"""comment threading status

Revision ID: 00990fcb887b
Revises: m001
Create Date: 2026-05-23 22:20:53.075357
"""

import sqlalchemy as sa

from alembic import op

revision: str = "00990fcb887b"
down_revision: str | None = "m001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("issue_comments") as batch_op:
        batch_op.add_column(sa.Column("parent_id", sa.String(length=36), nullable=True))
        batch_op.add_column(
            sa.Column("status", sa.String(length=16), nullable=False, server_default="valid")
        )
        batch_op.add_column(sa.Column("status_changed_by", sa.String(length=36), nullable=True))
        batch_op.create_foreign_key(
            "fk_comment_parent", "issue_comments", ["parent_id"], ["id"], ondelete="CASCADE"
        )
        batch_op.create_foreign_key(
            "fk_comment_status_changer", "users", ["status_changed_by"], ["id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("issue_comments") as batch_op:
        batch_op.drop_constraint("fk_comment_status_changer", type_="foreignkey")
        batch_op.drop_constraint("fk_comment_parent", type_="foreignkey")
        batch_op.drop_column("status_changed_by")
        batch_op.drop_column("status")
        batch_op.drop_column("parent_id")
