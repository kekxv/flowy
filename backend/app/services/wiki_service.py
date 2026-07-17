"""Wiki / Knowledge Base service layer."""

import logging
import re
from datetime import datetime

from sqlalchemy import delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.user import User
from app.models.wiki import WikiPage, wiki_collaborators_table
from app.utils.tokenizer import tokenize

logger = logging.getLogger("uvicorn")


def _slugify(title: str) -> str:
    """Generate a URL-friendly slug from a title."""
    # Keep Chinese chars, alphanumeric, and hyphens
    slug = re.sub(r'[^\w一-鿿-]', '-', title.lower().strip())
    slug = re.sub(r'-+', '-', slug).strip('-')
    return slug or 'untitled'


async def _ensure_unique_slug(db: AsyncSession, owner_id: str, slug: str) -> str:
    """Ensure slug is unique within the owner's wiki pages."""
    base_slug = slug
    counter = 1
    while True:
        result = await db.execute(
            select(WikiPage.id).where(
                WikiPage.owner_id == owner_id,
                WikiPage.slug == slug,
            )
        )
        if not result.scalar_one_or_none():
            return slug
        slug = f"{base_slug}-{counter}"
        counter += 1


async def create_page(
    db: AsyncSession,
    owner_id: str,
    title: str,
    content: str = "",
    tags: str = "",
    is_public: bool = False,
    weight: int = 0,
) -> WikiPage:
    """Create a new wiki page."""
    slug = await _ensure_unique_slug(db, owner_id, _slugify(title))
    page = WikiPage(
        owner_id=owner_id,
        title=title,
        slug=slug,
        content=content,
        tags=tags,
        is_public=is_public,
        weight=weight,
    )
    db.add(page)
    await db.commit()
    await db.refresh(page)
    return page


async def get_visible_pages(
    db: AsyncSession,
    user_id: str,
    q: str | None = None,
    tab: str = "all",  # all | mine | collab | public
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[WikiPage], int]:
    """Get wiki pages visible to the user, with optional search.

    Tab filters:
    - all: own + collaborated + public
    - mine: only own pages
    - collab: only collaborated pages (not own)
    - public: only public pages (not own)
    """
    # Build base query: pages visible to user
    own_filter = WikiPage.owner_id == user_id
    collab_filter = WikiPage.id.in_(
        select(wiki_collaborators_table.c.wiki_id).where(
            wiki_collaborators_table.c.user_id == user_id
        )
    )
    public_filter = WikiPage.is_public == True  # noqa: E712

    if tab == "mine":
        visibility = own_filter
    elif tab == "collab":
        visibility = collab_filter
    elif tab == "public":
        visibility = public_filter & ~own_filter
    else:  # all
        visibility = or_(own_filter, collab_filter, public_filter)

    query = select(WikiPage).where(visibility).options(
        selectinload(WikiPage.owner),
    )
    count_query = select(func.count(WikiPage.id)).where(visibility)

    if q:
        search = f"%{q}%"
        search_filter = or_(
            WikiPage.title.ilike(search),
            WikiPage.content.ilike(search),
            WikiPage.tags.ilike(search),
        )
        query = query.where(search_filter)
        count_query = count_query.where(search_filter)

    query = query.order_by(WikiPage.id.desc()).offset(offset).limit(limit)

    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0

    result = await db.execute(query)
    pages = list(result.scalars().all())
    return pages, total


async def get_page_by_slug(
    db: AsyncSession,
    owner_id: str,
    slug: str,
) -> WikiPage | None:
    """Get a wiki page by owner_id and slug."""
    result = await db.execute(
        select(WikiPage)
        .where(WikiPage.owner_id == owner_id, WikiPage.slug == slug)
        .options(selectinload(WikiPage.owner), selectinload(WikiPage.collaborators))
    )
    return result.scalar_one_or_none()


async def get_page_by_id(
    db: AsyncSession,
    page_id: str,
) -> WikiPage | None:
    """Get a wiki page by ID."""
    result = await db.execute(
        select(WikiPage)
        .where(WikiPage.id == page_id)
        .options(selectinload(WikiPage.owner), selectinload(WikiPage.collaborators))
    )
    return result.scalar_one_or_none()


async def get_page_for_user(
    db: AsyncSession,
    page_id: str,
    user_id: str,
) -> WikiPage | None:
    """Get a wiki page if visible to the given user."""
    result = await db.execute(
        select(WikiPage)
        .where(WikiPage.id == page_id)
        .options(selectinload(WikiPage.owner), selectinload(WikiPage.collaborators))
    )
    page = result.scalar_one_or_none()
    if not page:
        return None
    if not _can_view(page, user_id):
        return None
    return page


async def update_page(
    db: AsyncSession,
    page: WikiPage,
    title: str | None = None,
    content: str | None = None,
    tags: str | None = None,
    is_public: bool | None = None,
    weight: int | None = None,
) -> WikiPage:
    """Update a wiki page."""
    if title is not None:
        page.title = title
        # Regenerate slug if title changed
        new_slug = _slugify(title)
        if new_slug != page.slug:
            page.slug = await _ensure_unique_slug(db, page.owner_id, new_slug)
    if content is not None:
        page.content = content
    if tags is not None:
        page.tags = tags
    if is_public is not None:
        page.is_public = is_public
    if weight is not None:
        page.weight = weight
    page.updated_at = datetime.now().isoformat()
    await db.commit()
    await db.refresh(page)
    return page


async def delete_page(db: AsyncSession, page: WikiPage) -> None:
    """Delete a wiki page."""
    await db.delete(page)
    await db.commit()


# ─── Collaborator Management ────────────────────────────────


async def add_collaborator(
    db: AsyncSession,
    page: WikiPage,
    user_id: str,
    permission: str = "editor",
) -> None:
    """Add a collaborator to a wiki page."""
    # Check if already a collaborator
    result = await db.execute(
        select(wiki_collaborators_table.c.user_id).where(
            wiki_collaborators_table.c.wiki_id == page.id,
            wiki_collaborators_table.c.user_id == user_id,
        )
    )
    if result.scalar_one_or_none():
        return  # Already a collaborator

    await db.execute(
        wiki_collaborators_table.insert().values(
            wiki_id=page.id,
            user_id=user_id,
            permission=permission,
        )
    )
    await db.commit()


async def remove_collaborator(
    db: AsyncSession,
    page: WikiPage,
    user_id: str,
) -> None:
    """Remove a collaborator from a wiki page."""
    await db.execute(
        delete(wiki_collaborators_table).where(
            wiki_collaborators_table.c.wiki_id == page.id,
            wiki_collaborators_table.c.user_id == user_id,
        )
    )
    await db.commit()


async def get_collaborators(db: AsyncSession, page: WikiPage) -> list[dict]:
    """Get collaborators for a wiki page with user info."""
    result = await db.execute(
        select(
            wiki_collaborators_table.c.user_id,
            wiki_collaborators_table.c.permission,
            User.username,
            User.display_name,
        )
        .join(User, User.id == wiki_collaborators_table.c.user_id)
        .where(wiki_collaborators_table.c.wiki_id == page.id)
    )
    return [
        {
            "user_id": row.user_id,
            "username": row.username,
            "display_name": row.display_name or "",
            "permission": row.permission,
        }
        for row in result.all()
    ]


# ─── Permission Checks ──────────────────────────────────────


def _can_view(page: WikiPage, user_id: str) -> bool:
    """Check if user can view the page."""
    if page.owner_id == user_id:
        return True
    if page.is_public:
        return True
    # Check collaborator
    return any(c.id == user_id for c in page.collaborators)


def _can_edit(page: WikiPage, user_id: str) -> bool:
    """Check if user can edit the page."""
    if page.owner_id == user_id:
        return True
    return any(c.id == user_id for c in page.collaborators)


def is_owner(page: WikiPage, user_id: str) -> bool:
    return page.owner_id == user_id


def can_edit(page: WikiPage, user_id: str) -> bool:
    return _can_edit(page, user_id)


def can_view(page: WikiPage, user_id: str) -> bool:
    return _can_view(page, user_id)


# ─── Bot Search ──────────────────────────────────────────────


# Minimum score threshold — pages below this are considered irrelevant noise
# (e.g. matched only on a single digit or common character).
_MIN_SCORE = 30


def _relevance_score(page: WikiPage, tokens: list[str]) -> int:
    """Calculate relevance score for a wiki page against search tokens.

    Scoring per token (short tokens with len <= 1 score at 1/5 weight):
    - Title exact match (all tokens): 100
    - Title contains token: 50
    - Tags contain token: 30
    - Content contains token: 10

    Bonus:
    - Match ratio: matched_tokens / total_tokens * 50  (encourages multi-token hits)
    - Page weight: page.weight * 2
    """
    score = 0
    matched = 0
    title_lower = page.title.lower()
    content_lower = (page.content or "").lower()
    tags_lower = (page.tags or "").lower()

    for token in tokens:
        token_lower = token.lower()
        # Short tokens (single digit / single char) count at 1/5 weight —
        # they are too common to be useful as sole matches.
        weight = 1 if len(token) <= 1 else 5
        hit = False
        if title_lower == token_lower:
            score += 100 * weight // 5
            hit = True
        elif token_lower in title_lower:
            score += 50 * weight // 5
            hit = True
        if token_lower in tags_lower:
            score += 30 * weight // 5
            hit = True
        if token_lower in content_lower:
            score += 10 * weight // 5
            hit = True
        if hit:
            matched += 1

    # Match-ratio bonus: rewards pages that match a larger share of the query.
    if tokens:
        score += int(matched / len(tokens) * 50)

    # Weight bonus
    score += page.weight * 2
    return score


async def fuzzy_search(
    db: AsyncSession,
    keyword: str,
    user_id: str,
    related_user_ids: list[str] | None = None,
    limit: int = 10,
) -> list[WikiPage]:
    """Fuzzy search wiki pages, ranked by relevance.

    Searches both related users' wiki and public wiki.
    Returns pages sorted by relevance score (title match > tags > content).
    """
    if not keyword or not keyword.strip():
        return []

    # Segment keyword with jieba (filters stop words and punctuation)
    tokens = tokenize(keyword)
    if not tokens:
        return []

    # Build visibility filter: related users' pages + public pages
    own_filter = WikiPage.owner_id == user_id
    related_filter = WikiPage.owner_id.in_(related_user_ids) if related_user_ids else None
    public_filter = WikiPage.is_public == True  # noqa: E712
    collab_filter = WikiPage.id.in_(
        select(wiki_collaborators_table.c.wiki_id).where(
            wiki_collaborators_table.c.user_id == user_id
        )
    )

    visibility_conditions = [own_filter, public_filter, collab_filter]
    if related_filter is not None:
        visibility_conditions.append(related_filter)
    visibility = or_(*visibility_conditions)

    # Build search filter: any token matches any field
    token_filters = []
    for token in tokens:
        pattern = f"%{token}%"
        token_filters.append(
            or_(
                WikiPage.title.ilike(pattern),
                WikiPage.content.ilike(pattern),
                WikiPage.tags.ilike(pattern),
            )
        )
    # At least one token must match
    search_filter = or_(*token_filters)

    # Fetch all matching pages
    result = await db.execute(
        select(WikiPage)
        .where(visibility, search_filter)
        .options(selectinload(WikiPage.owner))
        .order_by(WikiPage.weight.desc(), WikiPage.updated_at.desc())
        .limit(50)  # Fetch more to re-rank
    )
    pages = list(result.scalars().all())

    # Score and sort by relevance, filter out low-quality matches
    scored = [(p, _relevance_score(p, tokens)) for p in pages]
    scored.sort(key=lambda x: x[1], reverse=True)
    filtered = [(p, s) for p, s in scored if s >= _MIN_SCORE]

    if not filtered:
        return []

    # If the runner-up is less than half the top score, the top result is a
    # clear winner — return only it. Otherwise return the normal list so the
    # user can pick from multiple candidates.
    if len(filtered) >= 2 and filtered[1][1] < filtered[0][1] / 2:
        return [filtered[0][0]]

    return [p for p, _ in filtered[:limit]]


async def search_for_bot(
    db: AsyncSession,
    keyword: str,
    bot_user_id: str | None,
    related_user_ids: list[str] | None = None,
) -> dict:
    """Search wiki for bot with priority: related users' wiki > public wiki.

    Segments *keyword* with jieba and matches any token in title/content/tags.
    Returns dict with keys:
    - related: list of pages from related users
    - public: list of public pages
    """
    tokens = tokenize(keyword)
    if not tokens:
        return {"related": [], "public": []}

    # Build filter: any token matches any field
    token_filters = []
    for token in tokens:
        pattern = f"%{token}%"
        token_filters.append(
            or_(
                WikiPage.title.ilike(pattern),
                WikiPage.content.ilike(pattern),
                WikiPage.tags.ilike(pattern),
            )
        )
    search_filter = or_(*token_filters)

    related_pages: list[WikiPage] = []
    public_pages: list[WikiPage] = []

    # 1. Search related users' wiki (both public and private)
    if related_user_ids:
        result = await db.execute(
            select(WikiPage)
            .where(
                search_filter,
                WikiPage.owner_id.in_(related_user_ids),
            )
            .options(selectinload(WikiPage.owner))
            .order_by(WikiPage.updated_at.desc())
            .limit(10)
        )
        related_pages = list(result.scalars().all())

    # 2. Search public wiki (exclude related user pages to avoid duplicates)
    public_query = select(WikiPage).where(
        search_filter,
        WikiPage.is_public == True,  # noqa: E712
    ).options(selectinload(WikiPage.owner))

    if related_user_ids:
        public_query = public_query.where(~WikiPage.owner_id.in_(related_user_ids))

    result = await db.execute(
        public_query.order_by(WikiPage.updated_at.desc()).limit(10)
    )
    public_pages = list(result.scalars().all())

    return {
        "related": related_pages,
        "public": public_pages,
    }


async def get_recent_pages_for_bot(
    db: AsyncSession,
    user_id: str,
    limit: int = 10,
) -> list[WikiPage]:
    """Get recent wiki pages visible to the user (for bot listing)."""
    own_filter = WikiPage.owner_id == user_id
    collab_filter = WikiPage.id.in_(
        select(wiki_collaborators_table.c.wiki_id).where(
            wiki_collaborators_table.c.user_id == user_id
        )
    )
    public_filter = WikiPage.is_public == True  # noqa: E712

    result = await db.execute(
        select(WikiPage)
        .where(or_(own_filter, collab_filter, public_filter))
        .options(selectinload(WikiPage.owner))
        .order_by(WikiPage.updated_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())
