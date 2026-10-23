"""Use Markdown test objectives and store completion reports."""
import sqlalchemy as sa

from alembic import op

revision = "e019"
down_revision = "e018"
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table("test_requests") as batch:
        batch.alter_column("catalog", new_column_name="objective", existing_type=sa.String(500), type_=sa.Text(), existing_nullable=False)
    op.add_column("test_runs", sa.Column("report", sa.Text(), nullable=False, server_default=""))
    op.execute("UPDATE test_runs SET report = result")


def downgrade():
    op.drop_column("test_runs", "report")
    with op.batch_alter_table("test_requests") as batch:
        batch.alter_column("objective", new_column_name="catalog", existing_type=sa.Text(), type_=sa.String(500), existing_nullable=False)
