import mimetypes
import os
from datetime import UTC, datetime, timezone

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.wiki import _get_upload_limit
from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models.temporary_issue_link import TemporaryIssueLink
from app.models.user import User
from app.schemas.temporary_issue_link import PublicIssueSubmit, TemporaryIssueLinkCreate
from app.services.temporary_issue_link_service import TemporaryIssueLinkService
from app.services.wechat_work_bot.attachment_names import (
    STORAGE_SUFFIX,
    encode_attachment_name,
    normalize_attachment_name,
)

router = APIRouter(prefix="/temporary-issue-links", tags=["temporary-issue-links"])
public_router = APIRouter(prefix="/public/issue-links", tags=["public-issue-links"])
service = TemporaryIssueLinkService()
def _no_store(response: Response): response.headers["Cache-Control"] = "no-store"
@router.post("", status_code=status.HTTP_201_CREATED)
async def create_link(body: TemporaryIssueLinkCreate, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    try: link, raw = await service.create(db, user.id, body.expires_in_minutes)
    except ValueError as exc: raise HTTPException(400, str(exc)) from exc
    _no_store(response)
    return {"token": raw, "url": f"{settings.frontend_url.rstrip('/')}/#/public/issue-links/{raw}", "expires_at": link.expires_at}
@router.get("")
async def list_links(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    _no_store(response)
    rows = (await db.execute(select(TemporaryIssueLink).where(TemporaryIssueLink.creator_id == user.id).order_by(TemporaryIssueLink.created_at.desc()).limit(100))).scalars().all()
    now = datetime.now(UTC).isoformat()
    return [{"id": r.id, "expires_at": r.expires_at, "used_at": r.used_at, "issue_id": r.issue_id, "created_at": r.created_at, "active": r.used_at is None and r.expires_at > now} for r in rows]
@public_router.get("/{token}")
async def get_public_link(token: str, response: Response, db: AsyncSession = Depends(get_db)):
    link = await service.get_active(db, token)
    if not link: raise HTTPException(410, "This link is expired or already used")
    creator = await db.get(User, link.creator_id)
    _no_store(response)
    return {"expires_at": link.expires_at, "server_time": datetime.now(UTC).isoformat(), "creator_name": (creator.display_name or creator.username) if creator else ""}
@public_router.post("/{token}/attachments")
async def upload_public_attachment(token: str, response: Response, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    link = await service.get_active(db, token)
    if not link: raise HTTPException(410, "This link is expired or already used")
    if not file.filename: raise HTTPException(400, "No filename provided")
    content = await file.read()
    max_size = await _get_upload_limit(db)
    if len(content) > max_size: raise HTTPException(413, "File size exceeds upload limit")
    ext = os.path.splitext(file.filename)[1].lower()
    if ext in {".exe", ".bat", ".cmd", ".com", ".scr", ".msi", ".dll", ".sh", ".php", ".js", ".html", ".htm"}: raise HTTPException(415, "Executable files are not allowed")
    link = await service.reserve_attachment(db, token)
    if not link: raise HTTPException(410, "This link is expired, already used, or has reached its attachment limit")
    from app.api.v1.bot_attachments import _ensure_dir, _safe_filepath
    original = normalize_attachment_name(file.filename)
    local = f"{encode_attachment_name(original)}{STORAGE_SUFFIX}"
    _ensure_dir()
    with open(_safe_filepath(local), "wb") as handle: handle.write(content)
    guessed = mimetypes.guess_type(original)[0] or file.content_type or "application/octet-stream"
    url = f"/api/v1/bot-attachments/{local}"
    _no_store(response)
    return {"filename": local, "original_name": original, "url": url, "markdown": f"![{original}]({url})" if guessed.startswith("image/") else f"[{original}]({url})"}
@public_router.post("/{token}/submit")
async def submit_public_link(token: str, body: PublicIssueSubmit, response: Response, db: AsyncSession = Depends(get_db)):
    try: issue = await service.consume_and_create_issue(db, token, body.model_dump())
    except ValueError as exc: raise HTTPException(410, str(exc)) from exc
    _no_store(response)
    return {"id": issue.id, "title": issue.title, "status": issue.status}
