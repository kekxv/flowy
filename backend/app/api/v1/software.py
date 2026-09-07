"""Software component & version management API."""

import logging
import mimetypes
import os
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models.software import SoftwareComponent, SoftwareDependency, SoftwareVersion
from app.models.user import User
from app.schemas.software import (
    SoftwareComponentCreate,
    SoftwareComponentUpdate,
    SoftwareDependencyIn,
    SoftwareVersionCreate,
    SoftwareVersionUpdate,
)
from app.services.wechat_work_bot.attachment_names import (
    STORAGE_SUFFIX,
    decode_attachment_name,
    encode_attachment_name,
    normalize_attachment_name,
)

logger = logging.getLogger("uvicorn")

router = APIRouter(prefix="/software", tags=["software"])

# Longest allowed artifact upload (configurable later; keep 500MB cap max here)
MAX_UPLOAD_BYTES = 500 * 1024 * 1024


def _artifacts_dir() -> str:
    base = os.environ.get("UPLOAD_DIR") or os.environ.get("STATIC_DIR", "static")
    return os.path.join(base, "software_artifacts")


# ─── Serializers ─────────────────────────────────────────────


def _dep_dict(dep: SoftwareDependency) -> dict:
    name = dep.name
    if dep.kind == "internal" and dep.target_component is not None:
        name = dep.target_component.name or dep.name
    return {
        "id": dep.id,
        "kind": dep.kind,
        "name": name,
        "target_component_id": dep.target_component_id,
        "constraint": dep.constraint,
    }


def _version_dict(v: SoftwareVersion) -> dict:
    return {
        "id": v.id,
        "component_id": v.component_id,
        "version": v.version,
        "note": v.note,
        "artifact_type": v.artifact_type,
        "file_name": v.file_name,
        "file_size": v.file_size,
        "download_url": v.download_url,
        "stored_filename": v.stored_filename,
        "published_at": v.published_at,
        "created_at": v.created_at,
        "updated_at": v.updated_at,
        "dependencies": [_dep_dict(d) for d in v.dependencies],
    }


def _component_dict(c: SoftwareComponent, eager: bool = True, include_versions: bool = False) -> dict:
    versions = list(c.versions) if eager else []
    latest = versions[0] if versions else None
    internal_count = sum(1 for v in versions for d in v.dependencies if d.kind == "internal")
    return {
        "id": c.id,
        "name": c.name,
        "identifier": c.identifier,
        "category": c.category,
        "icon_key": c.icon_key,
        "description": c.description,
        "created_at": c.created_at,
        "updated_at": c.updated_at,
        "version_count": len(versions),
        "latest_version": _version_dict(latest) if latest else None,
        "dependency_count": sum(len(v.dependencies) for v in versions),
        "internal_dependency_count": internal_count,
        "versions": [_version_dict(v) for v in versions] if include_versions else None,
    }


# Route registration order matters: literal paths & sub-resources before /{component_id}
@router.get("/stats")
async def software_stats(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    component_count = (
        (await db.execute(select(func.count(SoftwareComponent.id)))).scalar() or 0
    )
    version_count = (
        (await db.execute(select(func.count(SoftwareVersion.id)))).scalar() or 0
    )
    # Independent file/path artifacts: versions that carry an uploaded file or external url
    artifact_count = (
        (
            await db.execute(
                select(func.count(SoftwareVersion.id)).where(
                    SoftwareVersion.artifact_type.in_(["file", "url"])
                )
            )
        ).scalar()
        or 0
    )
    dependency_count = (
        (await db.execute(select(func.count(SoftwareDependency.id)))).scalar() or 0
    )
    return {
        "component_count": component_count,
        "version_count": version_count,
        "artifact_count": artifact_count,
        "dependency_count": dependency_count,
    }


@router.get("/files/{filename}")
async def download_artifact(
    filename: str,
    _user: User = Depends(get_current_user),
):
    """Download an uploaded software artifact file."""
    artifacts_dir = _artifacts_dir()
    real_dir = os.path.realpath(artifacts_dir)
    filepath = os.path.realpath(os.path.join(artifacts_dir, filename))
    if not filepath.startswith(real_dir + os.sep):
        raise HTTPException(status_code=400, detail="Invalid filename")
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="File not found")
    original_name = decode_attachment_name(filename) or filename
    media_type = mimetypes.guess_type(original_name)[0] or "application/octet-stream"
    return FileResponse(filepath, filename=original_name, media_type=media_type)


@router.get("")
async def list_components(
    category: str | None = None,
    sort: str = "updated",
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    query = (
        select(SoftwareComponent)
        .options(
            selectinload(SoftwareComponent.versions).selectinload(
                SoftwareVersion.dependencies
            ).selectinload(SoftwareDependency.target_component)
        )
    )
    if category:
        query = query.where(SoftwareComponent.category == category)
    result = await db.execute(query)
    components = list(result.scalars().unique().all())

    data = [_component_dict(c) for c in components]
    if sort == "name":
        data.sort(key=lambda c: c["name"])
    else:  # updated
        data.sort(key=lambda c: c["updated_at"] or "", reverse=True)
    return data


@router.get("/{component_id}")
async def get_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SoftwareComponent)
        .options(
            selectinload(SoftwareComponent.versions).selectinload(
                SoftwareVersion.dependencies
            ).selectinload(SoftwareDependency.target_component)
        )
        .where(SoftwareComponent.id == component_id)
    )
    c = result.scalars().unique().first()
    if not c:
        raise HTTPException(status_code=404, detail="Component not found")
    return _component_dict(c, include_versions=True)


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_component(
    data: SoftwareComponentCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    c = SoftwareComponent(
        id=str(uuid.uuid4()),
        name=data.name,
        identifier=data.identifier,
        category=data.category or "other",
        icon_key=data.icon_key,
        description=data.description,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _component_dict(c, eager=False)


@router.put("/{component_id}")
async def update_component(
    component_id: str,
    data: SoftwareComponentUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    c = await db.get(SoftwareComponent, component_id)
    if not c:
        raise HTTPException(status_code=404, detail="Component not found")
    if data.name is not None:
        c.name = data.name
    if data.identifier is not None:
        c.identifier = data.identifier
    if data.category is not None:
        c.category = data.category
    if data.icon_key is not None:
        c.icon_key = data.icon_key
    if data.description is not None:
        c.description = data.description
    await db.commit()
    await db.refresh(c)
    return _component_dict(c, eager=False)


@router.delete("/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_component(
    component_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    c = await db.get(SoftwareComponent, component_id)
    if not c:
        raise HTTPException(status_code=404, detail="Component not found")
    await db.delete(c)
    await db.commit()


# ─── Versions ────────────────────────────────────────────────


async def _replace_dependencies(db: AsyncSession, version: SoftwareVersion, deps: list[SoftwareDependencyIn]):
    # Remove existing
    existing = await db.execute(
        select(SoftwareDependency).where(SoftwareDependency.version_id == version.id)
    )
    for d in existing.scalars().all():
        await db.delete(d)
    await db.flush()
    for d in deps:
        db.add(
            SoftwareDependency(
                id=str(uuid.uuid4()),
                version_id=version.id,
                kind=d.kind or "external",
                name=d.name,
                target_component_id=d.target_component_id,
                constraint=d.constraint,
            )
        )
    await db.flush()


@router.post("/{component_id}/versions", status_code=status.HTTP_201_CREATED)
async def create_version(
    component_id: str,
    data: SoftwareVersionCreate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    c = await db.get(SoftwareComponent, component_id)
    if not c:
        raise HTTPException(status_code=404, detail="Component not found")
    published_at = data.published_at or datetime.now().isoformat()
    v = SoftwareVersion(
        id=str(uuid.uuid4()),
        component_id=component_id,
        version=data.version,
        note=data.note,
        artifact_type=data.artifact_type or "none",
        file_name=data.file_name,
        file_size=data.file_size or 0.0,
        download_url=data.download_url,
        published_at=published_at,
    )
    db.add(v)
    await db.flush()
    await _replace_dependencies(db, v, data.dependencies)
    c.updated_at = datetime.now().isoformat()
    await db.commit()
    # Re-load with dependencies for a full response
    result = await db.execute(
        select(SoftwareVersion)
        .options(
            selectinload(SoftwareVersion.dependencies).selectinload(
                SoftwareDependency.target_component
            )
        )
        .where(SoftwareVersion.id == v.id)
        .execution_options(populate_existing=True)
    )
    return _version_dict(result.scalars().unique().first())


@router.get("/versions/{version_id}")
async def get_version(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SoftwareVersion)
        .options(
            selectinload(SoftwareVersion.dependencies).selectinload(
                SoftwareDependency.target_component
            )
        )
        .where(SoftwareVersion.id == version_id)
    )
    v = result.scalars().unique().first()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    return _version_dict(v)


@router.put("/versions/{version_id}")
async def update_version(
    version_id: str,
    data: SoftwareVersionUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    result = await db.execute(
        select(SoftwareVersion)
        .options(selectinload(SoftwareVersion.dependencies))
        .where(SoftwareVersion.id == version_id)
    )
    v = result.scalars().unique().first()
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    if data.version is not None:
        v.version = data.version
    if data.note is not None:
        v.note = data.note
    if data.artifact_type is not None:
        v.artifact_type = data.artifact_type
    if data.file_name is not None:
        v.file_name = data.file_name
    if data.file_size is not None:
        v.file_size = data.file_size
    if data.download_url is not None:
        v.download_url = data.download_url
    if data.published_at is not None:
        v.published_at = data.published_at
    if data.dependencies is not None:
        await _replace_dependencies(db, v, data.dependencies)
    await db.commit()
    result = await db.execute(
        select(SoftwareVersion)
        .options(
            selectinload(SoftwareVersion.dependencies).selectinload(
                SoftwareDependency.target_component
            )
        )
        .where(SoftwareVersion.id == version_id)
        .execution_options(populate_existing=True)
    )
    return _version_dict(result.scalars().unique().first())


@router.delete("/versions/{version_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_version(
    version_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    v = await db.get(SoftwareVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    await db.delete(v)
    await db.commit()


@router.post("/versions/{version_id}/upload", status_code=status.HTTP_201_CREATED)
async def upload_artifact(
    version_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_admin),
):
    v = await db.get(SoftwareVersion, version_id)
    if not v:
        raise HTTPException(status_code=404, detail="Version not found")
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")

    content = await file.read()
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large")

    original_name = normalize_attachment_name(file.filename)
    local_filename = f"{encode_attachment_name(original_name)}{STORAGE_SUFFIX}"
    artifacts_dir = _artifacts_dir()
    os.makedirs(artifacts_dir, exist_ok=True)
    local_path = os.path.join(artifacts_dir, local_filename)
    with open(local_path, "wb") as f:
        f.write(content)

    # Remove a previous uploaded artifact for this version (best-effort)
    if v.stored_filename and v.stored_filename != local_filename:
        old_path = os.path.join(artifacts_dir, v.stored_filename)
        try:
            if os.path.exists(old_path):
                os.remove(old_path)
        except OSError:
            logger.warning("Failed to remove old artifact %s", old_path)

    v.stored_filename = local_filename
    v.file_name = original_name
    v.file_size = round(len(content) / 1024 / 1024, 2)
    v.artifact_type = "file"
    await db.commit()
    return {
        "filename": local_filename,
        "original_name": original_name,
        "size_mb": v.file_size,
        "url": f"/api/v1/software/files/{local_filename}",
    }
