"""wiki_weight_column

Revision ID: 8fd26d6d5557
Revises: f0a1676a17f0
Create Date: 2026-07-13 14:12:07.589878
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = '8fd26d6d5557'
down_revision: str | None = 'f0a1676a17f0'
branch_labels: Union[str, 'Sequence[str]', None] = None
depends_on: Union[str, 'Sequence[str]', None] = None


def upgrade() -> None:
    op.add_column('wiki_pages', sa.Column('weight', sa.Integer(), server_default='0', nullable=False))


def downgrade() -> None:
    op.drop_column('wiki_pages', 'weight')
