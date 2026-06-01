import asyncio

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models.issue import Label
from app.models.tracking import Milestone
from app.models.user import User


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
async def db_session():
    """Create a fresh in-memory database for each test."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", echo=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        yield session
        await session.rollback()
        await session.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


def _make_user(**kwargs) -> dict:
    """Default user kwargs for creation."""
    import bcrypt

    defaults = {
        "username": "testuser",
        "email": "test@example.com",
        "display_name": "Test User",
        "role": "member",
        "avatar_url": "",
    }
    defaults.update(kwargs)
    if "password_hash" not in defaults:
        defaults["password_hash"] = bcrypt.hashpw(b"password123", bcrypt.gensalt()).decode()
    return defaults


@pytest.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create a basic test user."""
    user = User(id="user-001", **_make_user(username="testuser", email="test@example.com"))
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_admin(db_session: AsyncSession) -> User:
    """Create an admin test user."""
    user = User(
        id="admin-001", **_make_user(username="admin", email="admin@example.com", role="admin")
    )
    db_session.add(user)
    await db_session.flush()
    return user


@pytest.fixture
async def test_label(db_session) -> Label:
    """Create a test label."""
    label = Label(id="label-001", name="bug", color="#ff0000", description="A bug")
    db_session.add(label)
    await db_session.flush()
    return label


@pytest.fixture
async def test_milestone(db_session, test_user) -> Milestone:
    """Create a test milestone."""
    milestone = Milestone(
        id="ms-001",
        name="v1.0",
        description="First release",
        status="open",
        due_date=None,
        created_by=test_user.id,
    )
    db_session.add(milestone)
    await db_session.flush()
    return milestone


@pytest.fixture
async def test_issue(db_session, test_user):
    """Create a test issue reported by test_user."""
    from app.models.issue import Issue

    issue = Issue(
        id="issue-001",
        title="Test Bug",
        description="A test bug",
        issue_type="bug",
        status="open",
        priority="medium",
        reporter_id=test_user.id,
    )
    db_session.add(issue)
    await db_session.flush()
    return issue
