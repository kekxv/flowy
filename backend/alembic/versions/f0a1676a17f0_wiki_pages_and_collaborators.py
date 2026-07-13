"""wiki_pages_and_collaborators

Revision ID: f0a1676a17f0
Revises: e009
Create Date: 2026-07-13 12:37:46.329561
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = 'f0a1676a17f0'
down_revision: str | None = 'e009'
branch_labels: Union[str, 'Sequence[str]', None] = None
depends_on: Union[str, 'Sequence[str]', None] = None


def upgrade() -> None:
    op.create_table('wiki_pages',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('owner_id', sa.String(length=36), nullable=False),
    sa.Column('title', sa.String(length=500), nullable=False),
    sa.Column('slug', sa.String(length=500), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('tags', sa.String(length=1000), nullable=False),
    sa.Column('is_public', sa.Boolean(), nullable=False),
    sa.Column('created_at', sa.String(length=32), nullable=False),
    sa.Column('updated_at', sa.String(length=32), nullable=False),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('owner_id', 'slug', name='uq_wiki_owner_slug')
    )
    op.create_index(op.f('ix_wiki_pages_owner_id'), 'wiki_pages', ['owner_id'], unique=False)
    op.create_table('wiki_collaborators',
    sa.Column('wiki_id', sa.String(length=36), nullable=False),
    sa.Column('user_id', sa.String(length=36), nullable=False),
    sa.Column('permission', sa.String(length=16), nullable=False),
    sa.Column('added_at', sa.String(length=32), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['wiki_id'], ['wiki_pages.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('wiki_id', 'user_id')
    )


def downgrade() -> None:
    op.drop_table('wiki_collaborators')
    op.drop_index(op.f('ix_wiki_pages_owner_id'), table_name='wiki_pages')
    op.drop_table('wiki_pages')
