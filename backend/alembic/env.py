from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.database import Base
from app.models.external import AuditLog, ExternalConnection, ExternalIssue, SyncLog  # noqa: F401
from app.models.issue import Comment, Issue, Label  # noqa: F401
from app.models.notification import NotificationChannel, NotificationLog, NotificationRule  # noqa: F401
from app.models.settings import AppSetting  # noqa: F401
from app.models.tracking import IssueAssigneeLog, Milestone, TimeEntry, UserProjectRole  # noqa: F401
from app.models.user import User  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Use synchronous SQLite driver for migrations
DB_URL = "sqlite:///./flowy.db"


def run_migrations_offline() -> None:
    context.configure(url=DB_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DB_URL)
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
