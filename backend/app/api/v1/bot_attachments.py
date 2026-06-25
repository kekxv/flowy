"""Bot attachment file management API."""

import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from app.dependencies import get_current_user
from app.models.user import User

router = APIRouter(prefix="/bot-attachments", tags=["bot-attachments"])

ATTACHMENTS_DIR = os.path.join(os.environ.get("STATIC_DIR", "static"), "bot_attachments")


def _ensure_dir():
    os.makedirs(ATTACHMENTS_DIR, exist_ok=True)


@router.get("/{filename}")
async def download_attachment(filename: str):
    """Download a bot attachment file (public - for img tags)."""
    _ensure_dir()
    filepath = os.path.join(ATTACHMENTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    return FileResponse(filepath, filename=filename)


@router.delete("/{filename}")
async def delete_attachment(
    filename: str,
    _user: User = Depends(get_current_user),
):
    """Delete a bot attachment file (admin only)."""
    if _user.role != "admin":
        raise HTTPException(403, "Admin access required")
    _ensure_dir()
    filepath = os.path.join(ATTACHMENTS_DIR, filename)
    if not os.path.exists(filepath):
        raise HTTPException(404, "File not found")
    os.remove(filepath)
    return {"ok": True}


@router.get("/")
async def list_attachments(
    _user: User = Depends(get_current_user),
):
    """List all bot attachment files (admin only)."""
    if _user.role != "admin":
        raise HTTPException(403, "Admin access required")
    _ensure_dir()
    files = []
    for f in os.listdir(ATTACHMENTS_DIR):
        filepath = os.path.join(ATTACHMENTS_DIR, f)
        if os.path.isfile(filepath):
            stat = os.stat(filepath)
            files.append({
                "filename": f,
                "size": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            })
    return files
