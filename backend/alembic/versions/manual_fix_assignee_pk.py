"""Fix issue_assignees PK to include role

Revision ID: m001
Revises: 4692ab361441
Create Date: 2026-05-23
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'm001'
down_revision: Union[str, None] = '4692ab361441'
branch_labels = None
depends_on = None

def upgrade():
    # SQLite can't alter PK, rebuild table
    op.execute("""
        CREATE TABLE issue_assignees_new (
            issue_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            assigned_at TEXT,
            PRIMARY KEY (issue_id, user_id, role),
            FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    op.execute("INSERT OR IGNORE INTO issue_assignees_new SELECT * FROM issue_assignees")
    op.execute("DROP TABLE issue_assignees")
    op.execute("ALTER TABLE issue_assignees_new RENAME TO issue_assignees")

def downgrade():
    op.execute("""
        CREATE TABLE issue_assignees_old (
            issue_id TEXT NOT NULL,
            user_id TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'member',
            assigned_at TEXT,
            PRIMARY KEY (issue_id, user_id),
            FOREIGN KEY (issue_id) REFERENCES issues(id) ON DELETE CASCADE,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
    """)
    op.execute("INSERT OR IGNORE INTO issue_assignees_old SELECT * FROM issue_assignees")
    op.execute("DROP TABLE issue_assignees")
    op.execute("ALTER TABLE issue_assignees_old RENAME TO issue_assignees")
