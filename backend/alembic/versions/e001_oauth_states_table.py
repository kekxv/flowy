"""oauth states table

Revision ID: e001
Revises: df200ec12a76
Create Date: 2026-05-24 22:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'e001'
down_revision: Union[str, None] = 'df200ec12a76'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('oauth_states',
        sa.Column('state', sa.String(length=128), nullable=False),
        sa.Column('provider', sa.String(length=16), nullable=False),
        sa.Column('instance_url', sa.String(length=256), server_default=""),
        sa.Column('user_id', sa.String(length=36), nullable=False),
        sa.Column('redirect_uri', sa.String(length=512), nullable=False),
        sa.Column('created_at', sa.String(length=32), nullable=False),
        sa.PrimaryKeyConstraint('state')
    )


def downgrade() -> None:
    op.drop_table('oauth_states')
