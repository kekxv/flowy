"""Wiki / Knowledge Base API endpoints."""

import logging
import os
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.wiki import (
    WikiCollaboratorAdd,
    WikiCollaboratorResponse,
    WikiPageCreate,
    WikiPageResponse,
    WikiPageUpdate,
)
from app.services import wiki_service

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/wiki", tags=["wiki"])

MAX_UPLOAD_SIZE = 5 * 1024 * 1024  # 5MB
ALLOWED_IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"}
ALLOWED_FILE_EXTS = {".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".md", ".csv", ".zip", ".rar"}


def _page_to_response(page) -> WikiPageResponse:
    """Convert a WikiPage model to WikiPageResponse schema."""
    collaborator_ids = [c.id for c in page.collaborators] if page.collaborators else []
    return WikiPageResponse(
        id=page.id,
        owner_id=page.owner_id,
        title=page.title,
        slug=page.slug,
        content=page.content,
        tags=page.tags,
        is_public=page.is_public,
        weight=page.weight,
        created_at=page.created_at,
        updated_at=page.updated_at,
        owner_name=page.owner.username if page.owner else "",
        owner_display_name=page.owner.display_name if page.owner else "",
        collaborator_ids=collaborator_ids,
    )


@router.get("", response_model=list[WikiPageResponse])
async def list_wiki_pages(
    q: str | None = Query(default=None, description="Search query"),
    tab: str = Query(default="all", description="Tab filter: all|mine|collab|public"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List wiki pages visible to the current user."""
    pages, _total = await wiki_service.get_visible_pages(
        db, user.id, q=q, tab=tab, limit=limit, offset=offset
    )
    return [_page_to_response(p) for p in pages]


@router.post("", response_model=WikiPageResponse, status_code=status.HTTP_201_CREATED)
async def create_wiki_page(
    data: WikiPageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Create a new wiki page (owned by current user)."""
    page = await wiki_service.create_page(
        db,
        owner_id=user.id,
        title=data.title,
        content=data.content,
        tags=data.tags,
        is_public=data.is_public,
        weight=data.weight,
    )
    # Reload with relationships
    page = await wiki_service.get_page_by_id(db, page.id)
    return _page_to_response(page)


@router.get("/{page_id}", response_model=WikiPageResponse)
async def get_wiki_page(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Get a wiki page by ID (must be visible to user)."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    return _page_to_response(page)


@router.put("/{page_id}", response_model=WikiPageResponse)
async def update_wiki_page(
    page_id: str,
    data: WikiPageUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Update a wiki page (owner or collaborator)."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if not wiki_service.can_edit(page, user.id):
        raise HTTPException(status_code=403, detail="No permission to edit this wiki page")

    page = await wiki_service.update_page(
        db,
        page,
        title=data.title,
        content=data.content,
        tags=data.tags,
        is_public=data.is_public,
        weight=data.weight,
    )
    # Reload with relationships
    page = await wiki_service.get_page_by_id(db, page.id)
    return _page_to_response(page)


@router.delete("/{page_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_wiki_page(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Delete a wiki page (owner only)."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if not wiki_service.is_owner(page, user.id):
        raise HTTPException(status_code=403, detail="Only the owner can delete this wiki page")
    await wiki_service.delete_page(db, page)


# ─── Collaborators ────────────────────────────────────────────


@router.get("/{page_id}/collaborators", response_model=list[WikiCollaboratorResponse])
async def list_collaborators(
    page_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List collaborators of a wiki page."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    collabs = await wiki_service.get_collaborators(db, page)
    return [WikiCollaboratorResponse(**c) for c in collabs]


@router.post("/{page_id}/collaborators", status_code=status.HTTP_201_CREATED)
async def add_collaborator(
    page_id: str,
    data: WikiCollaboratorAdd,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Add a collaborator to a wiki page (owner only)."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if not wiki_service.is_owner(page, user.id):
        raise HTTPException(status_code=403, detail="Only the owner can manage collaborators")

    # Verify the target user exists
    target_user = await db.get(User, data.user_id)
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    # Cannot add owner as collaborator
    if data.user_id == page.owner_id:
        raise HTTPException(status_code=400, detail="Cannot add owner as collaborator")

    await wiki_service.add_collaborator(db, page, data.user_id, data.permission)
    return {"message": "Collaborator added"}


@router.delete("/{page_id}/collaborators/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collaborator(
    page_id: str,
    user_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Remove a collaborator from a wiki page (owner only)."""
    page = await wiki_service.get_page_for_user(db, page_id, user.id)
    if not page:
        raise HTTPException(status_code=404, detail="Wiki page not found")
    if not wiki_service.is_owner(page, user.id):
        raise HTTPException(status_code=403, detail="Only the owner can manage collaborators")
    await wiki_service.remove_collaborator(db, page, user_id)


# ─── File Upload ──────────────────────────────────────────────


def _get_wiki_attachments_dir() -> str:
    """Get wiki attachments directory."""
    base = os.environ.get("UPLOAD_DIR") or os.environ.get("STATIC_DIR", "static")
    return os.path.join(base, "wiki_attachments")


@router.post("/upload")
async def upload_wiki_file(
    file: UploadFile = File(...),
    _user: User = Depends(get_current_user),
):
    """Upload a file (image or document) for wiki content. Max 5MB."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    # Check file size
    content = await file.read()
    if len(content) > MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=413, detail="File size exceeds 5MB limit")

    # Check extension
    ext = os.path.splitext(file.filename)[1].lower()
    allowed = ALLOWED_IMAGE_EXTS | ALLOWED_FILE_EXTS
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"File type not allowed. Allowed: {', '.join(sorted(allowed))}"
        )

    # Generate unique filename
    local_filename = f"{uuid.uuid4().hex[:12]}{ext}"
    attachments_dir = _get_wiki_attachments_dir()
    os.makedirs(attachments_dir, exist_ok=True)
    local_path = os.path.join(attachments_dir, local_filename)

    with open(local_path, "wb") as f:
        f.write(content)

    is_image = ext in ALLOWED_IMAGE_EXTS
    return {
        "filename": local_filename,
        "original_name": file.filename,
        "url": f"/api/v1/wiki/files/{local_filename}",
        "is_image": is_image,
        "markdown": f"![{file.filename}](/api/v1/wiki/files/{local_filename})" if is_image else f"[{file.filename}](/api/v1/wiki/files/{local_filename})",
    }


@router.get("/files/{filename}")
async def get_wiki_file(filename: str):
    """Download a wiki attachment file (public for markdown rendering)."""
    attachments_dir = _get_wiki_attachments_dir()
    filepath = os.path.join(attachments_dir, filename)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(filepath, filename=filename)
