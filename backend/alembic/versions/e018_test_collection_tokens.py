"""Store encrypted test collection tokens for link management."""
import sqlalchemy as sa

from alembic import op

revision = "e018"
down_revision = "e017"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("test_collection_links", sa.Column("token_encrypted", sa.Text(), nullable=True))


def downgrade():
    op.drop_column("test_collection_links", "token_encrypted")
