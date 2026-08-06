"""Bot attachment file management API."""

import mimetypes
import os
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Comment
from app.models.user import User
from app.services.wechat_work_bot.attachment_names import (
    STORAGE_SUFFIX,
    decode_attachment_name,
    encode_attachment_name,
    normalize_attachment_name,
)

router = APIRouter(prefix="/bot-attachments", tags=["bot-attachments"])


def _get_attachments_dir() -> str:
    """Get attachments directory, preferring UPLOAD_DIR if set."""
    base = os.environ.get("UPLOAD_DIR") or os.environ.get("STATIC_DIR", "static")
    return os.path.join(base, "bot_attachments")


def _ensure_dir():
    os.makedirs(_get_attachments_dir(), exist_ok=True)


def _safe_filepath(filename: str) -> str:
    """Resolve *filename* inside the attachments dir, blocking path traversal."""
    attachments_dir = _get_attachments_dir()
    real_dir = os.path.realpath(attachments_dir)
    filepath = os.path.realpath(os.path.join(attachments_dir, filename))
    if not filepath.startswith(real_dir + os.sep):
        raise HTTPException(400, "Invalid filename")
    return filepath


@router.get("/{filename}")
async def download_attachment(filename: str):
    """Download a bot attachment file (public - for img tags)."""
    _ensure_dir()
    filepath = _safe_filepath(filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    original_name = decode_attachment_name(filename) or filename
    media_type = mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    return FileResponse(filepath, filename=original_name, media_type=media_type)


@router.post("/upload")
async def upload_attachment(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Upload a file for issue descriptions or comments under Wiki's configured limit."""
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    from app.api.v1.wiki import _get_upload_limit

    content = await file.read()
    max_size = await _get_upload_limit(db)
    if len(content) > max_size:
        max_mb = round(max_size / 1024 / 1024, 1)
        raise HTTPException(status_code=413, detail=f"File size exceeds {max_mb}MB limit")

    original_name = normalize_attachment_name(file.filename)
    local_filename = f"{encode_attachment_name(original_name)}{STORAGE_SUFFIX}"
    _ensure_dir()
    with open(_safe_filepath(local_filename), "wb") as attachment:
        attachment.write(content)

    guessed_type = mimetypes.guess_type(original_name)[0] or ""
    is_image = (file.content_type or "").startswith("image/") or guessed_type.startswith("image/")
    url = f"/api/v1/bot-attachments/{local_filename}"
    return {
        "filename": local_filename,
        "original_name": original_name,
        "url": url,
        "is_image": is_image,
        "markdown": f"![{original_name}]({url})" if is_image else f"[{original_name}]({url})",
    }


@router.delete("/{filename}")
async def delete_attachment(
    filename: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    """Delete a bot attachment file (admin or comment author)."""
    if not await _can_delete_attachment(filename, _user, db):
        raise HTTPException(403, "Cannot delete this attachment")
    _ensure_dir()
    filepath = _safe_filepath(filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    os.remove(filepath)
    return {"ok": True}


async def _can_delete_attachment(filename: str, user: User, db: AsyncSession) -> bool:
    """Check if user can delete the attachment: admin or comment author."""
    if user.role == "admin":
        return True
    pattern = f"attachment:{filename}"
    result = await db.execute(
        select(Comment).where(Comment.body.contains(pattern))
    )
    comment = result.scalars().first()
    return comment is not None and comment.author_id == user.id


@router.get("/")
async def list_attachments(
    _user: User = Depends(get_current_user),
):
    """List all bot attachment files (admin only)."""
    if _user.role != "admin":
        raise HTTPException(403, "Admin access required")
    _ensure_dir()
    files = []
    for f in os.listdir(_get_attachments_dir()):
        filepath = os.path.join(_get_attachments_dir(), f)
        if os.path.isfile(filepath):
            stat = os.stat(filepath)
            files.append({
                "filename": f,
                "original_filename": decode_attachment_name(f) or f,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            })
    return files
