"""update_issue_status_check_constraint

Revision ID: 3f7c693c5206
Revises: 8fd26d6d5557
Create Date: 2026-07-28 09:21:50.465849
"""
from collections.abc import Sequence
from typing import Union

import sqlalchemy as sa

from alembic import op

revision: str = '3f7c693c5206'
down_revision: str | None = '8fd26d6d5557'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table('issues') as batch_op:
        batch_op.drop_constraint('ck_issue_status', type_='check')
        batch_op.create_check_constraint(
            'ck_issue_status',
            "status IN ('open','in_progress','resolved','closed','cancelled','proposed','accepted','rejected')"
        )


def downgrade() -> None:
    with op.batch_alter_table('issues') as batch_op:
        batch_op.drop_constraint('ck_issue_status', type_='check')
        batch_op.create_check_constraint(
            'ck_issue_status',
            "status IN ('open','in_progress','resolved','closed','cancelled')"
        )
