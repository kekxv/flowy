"""issue milestones m2m

Revision ID: 4692ab361441
Revises: a15a1fa9a7c3
Create Date: 2026-05-23 20:01:41.425415
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '4692ab361441'
down_revision: Union[str, None] = 'a15a1fa9a7c3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('issue_milestones',
    sa.Column('issue_id', sa.String(length=36), nullable=False),
    sa.Column('milestone_id', sa.String(length=36), nullable=False),
    sa.ForeignKeyConstraint(['issue_id'], ['issues.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['milestone_id'], ['milestones.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('issue_id', 'milestone_id')
    )
    with op.batch_alter_table('issues') as batch_op:
        batch_op.drop_constraint('fk_issues_milestone', type_='foreignkey')
        batch_op.drop_column('milestone_id')


def downgrade() -> None:
    with op.batch_alter_table('issues') as batch_op:
        batch_op.add_column(sa.Column('milestone_id', sa.VARCHAR(length=36), nullable=True))
        batch_op.create_foreign_key('fk_issues_milestone', 'milestones', ['milestone_id'], ['id'], ondelete='SET NULL')
    op.drop_table('issue_milestones')
