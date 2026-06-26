import logging
from logging.config import fileConfig

from sqlalchemy import create_engine
from uvicorn.logging import DefaultFormatter

from alembic import context
from app.database import Base
from app.models.external import AuditLog, ExternalConnection, ExternalIssue, SyncLog  # noqa: F401
from app.models.issue import Comment, Issue, Label  # noqa: F401
from app.models.notification import (  # noqa: F401
    NotificationChannel,
    NotificationLog,
    NotificationRule,
)
from app.models.settings import AppSetting  # noqa: F401
from app.models.tracking import (  # noqa: F401
    IssueAssigneeLog,
    Milestone,
    TimeEntry,
    UserProjectRole,
)
from app.models.user import User  # noqa: F401

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# Override handler formatters to match uvicorn's colored log style
_LOG_FORMAT = "%(levelprefix)s %(asctime)s %(message)s"
_uvicorn_formatter = DefaultFormatter(fmt=_LOG_FORMAT, datefmt="%H:%M:%S", use_colors=True)
for _handler in logging.getLogger().handlers:
    _handler.setFormatter(_uvicorn_formatter)
for _logger_name in ("sqlalchemy", "alembic"):
    _logger = logging.getLogger(_logger_name)
    _logger.handlers.clear()
    _logger.addHandler(logging.getLogger().handlers[0])  # reuse the root handler
    _logger.propagate = False

target_metadata = Base.metadata

# Read DATABASE_URL from environment, fall back to the same default as app/config.py.
# Alembic runs synchronously — strip +aiosqlite so we use the plain sqlite driver.
import os

_raw_url = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./flowy.db")
DB_URL = _raw_url.replace("+aiosqlite", "")


def run_migrations_offline() -> None:
    context.configure(url=DB_URL, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = create_engine(DB_URL, connect_args={"timeout": 10})
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
