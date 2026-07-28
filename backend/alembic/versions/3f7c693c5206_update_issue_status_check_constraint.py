"""update_issue_status_check_constraint

Revision ID: 3f7c693c5206
Revises: 8fd26d6d5557
Create Date: 2026-07-28 09:21:50.465849
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '3f7c693c5206'
down_revision: Union[str, None] = '8fd26d6d5557'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


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
