import mimetypes
import os
import uuid
from datetime import UTC, datetime, timedelta

from cryptography.fernet import InvalidToken
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.wiki import _get_upload_limit
from app.core.crypto import decrypt_token, encrypt_token
from app.database import get_db
from app.dependencies import get_current_user
from app.models.issue import Issue
from app.models.test import (
    TestAttachment,
    TestCollectionAttachment,
    TestCollectionLink,
    TestRequest,
    TestRun,
    TestStatusHistory,
)
from app.models.tracking import UserProjectRole
from app.models.user import User
from app.schemas.test import (
    PublicTestSubmit,
    TestAssignment,
    TestCollectionCreate,
    TestRequestCreate,
    TestRunCreate,
    TestTransition,
)
from app.services.temporary_issue_link_service import create_raw_token, hash_link_token
from app.services.test_service import TestService
from app.services.wechat_work_bot.attachment_names import (
    STORAGE_SUFFIX,
    encode_attachment_name,
    normalize_attachment_name,
)
from app.utils.settings import get_frontend_url

router = APIRouter(prefix="/tests", tags=["tests"])
collection_router = APIRouter(prefix="/test-collections", tags=["test-collections"])
public_router = APIRouter(prefix="/public/test-collections", tags=["public-test-collections"])
service = TestService()


def _attachments_dir():
    return os.path.join(os.environ.get("UPLOAD_DIR") or os.environ.get("STATIC_DIR", "static"), "bot_attachments")


def _attachment_path(filename: str):
    base = os.path.realpath(_attachments_dir())
    path = os.path.realpath(os.path.join(base, filename))
    if not path.startswith(base + os.sep):
        raise HTTPException(400, "Invalid filename")
    return path


def _user_dict(user):
    if not user:
        return None
    return {"id": user.id, "username": user.username, "display_name": user.display_name}


async def _can_manage(db, user, request):
    if user.role == "admin" or request.reporter_id == user.id:
        return True
    return bool(await db.scalar(select(UserProjectRole).where(UserProjectRole.user_id == user.id, UserProjectRole.role == "project_lead")))


async def _serialize(db, request, actor=None):
    histories = (await db.execute(select(TestStatusHistory).where(TestStatusHistory.request_id == request.id).order_by(TestStatusHistory.created_at))).scalars().all()
    attachments = (await db.execute(select(TestAttachment).where(TestAttachment.request_id == request.id, TestAttachment.run_id.is_(None)))).scalars().all()
    runs = (await db.execute(select(TestRun).where(TestRun.request_id == request.id).order_by(TestRun.created_at.desc()))).scalars().all()
    run_data = []
    for run in runs:
        files = (await db.execute(select(TestAttachment).where(TestAttachment.run_id == run.id))).scalars().all()
        run_data.append({"id": run.id, "status": run.status, "version": run.version, "method": run.method, "server_url": run.server_url, "steps": run.steps, "result": run.result, "report": run.report, "created_at": run.created_at, "tester": _user_dict(run.tester), "attachments": [_attachment_dict(f) for f in files]})
    return {**(await service.actions(db, request, actor) if actor else {}), "id": request.id, "title": request.title, "objective": request.objective, "catalog": request.objective, "expected_effect": request.expected_effect, "current_behavior": request.current_behavior, "issue_id": request.issue_id, "issue_title": request.issue.title if request.issue else None, "reporter": _user_dict(request.reporter), "tester": _user_dict(request.tester), "status": request.status, "rejection_reason": request.rejection_reason, "created_at": request.created_at, "updated_at": request.updated_at, "attachments": [_attachment_dict(f) for f in attachments], "runs": run_data, "history": [{"from_status": h.from_status, "to_status": h.to_status, "reason": h.reason, "created_at": h.created_at} for h in histories]}


def _attachment_dict(item):
    return {"id": item.id, "filename": item.filename, "name": item.original_name, "content_type": item.content_type, "size": item.size, "url": f"/api/v1/tests/attachments/{item.filename}"}


@router.get("")
async def list_tests(status_filter: str | None = None, q: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(TestRequest).order_by(TestRequest.updated_at.desc())
    if status_filter:
        query = query.where(TestRequest.status == status_filter)
    if q:
        query = query.where(TestRequest.title.contains(q))
    rows = (await db.execute(query.limit(200))).scalars().all()
    return [await _serialize(db, row) for row in rows]


@router.get("/testers")
async def list_testers(db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    result = await db.execute(select(User).join(UserProjectRole, UserProjectRole.user_id == User.id).where(UserProjectRole.role == "tester", User.is_active.is_(True)).order_by(User.display_name))
    return [_user_dict(user) for user in result.scalars().unique().all()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_test(body: TestRequestCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if body.issue_id and not await db.get(Issue, body.issue_id):
        raise HTTPException(404, "Linked issue not found")
    request = await service.create_request(db, user, body.model_dump())
    return await _serialize(db, request, user)


@router.get("/stats")
async def test_stats(db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    return await service.stats(db)


@router.get("/{request_id}")
async def get_test(request_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request = await db.get(TestRequest, request_id)
    if not request:
        raise HTTPException(404, "Test request not found")
    return await _serialize(db, request, user)


@router.post("/{request_id}/assign")
async def assign_test(request_id: str, body: TestAssignment, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request = await db.get(TestRequest, request_id)
    if not request:
        raise HTTPException(404, "Test request not found")
    if not await _can_manage(db, user, request):
        raise HTTPException(403, "Not allowed to assign this request")
    try:
        await service.assign(db, request, user, body.tester_id)
    except (ValueError, PermissionError) as exc:
        raise HTTPException(400 if isinstance(exc, ValueError) else 403, str(exc)) from exc
    return await _serialize(db, request, user)


@router.post("/{request_id}/transition")
async def transition_test(request_id: str, body: TestTransition, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request = await db.get(TestRequest, request_id)
    if not request:
        raise HTTPException(404, "Test request not found")
    try:
        await service.transition(db, request, user, body.status, body.reason)
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return await _serialize(db, request, user)


@router.post("/{request_id}/runs", status_code=status.HTTP_201_CREATED)
async def add_test_run(request_id: str, body: TestRunCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request = await db.get(TestRequest, request_id)
    if not request:
        raise HTTPException(404, "Test request not found")
    try:
        run = await service.submit_run(db, request, user, body.model_dump())
    except PermissionError as exc:
        raise HTTPException(403, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    return {"id": run.id, "status": run.status, "version": run.version}


@router.post("/{request_id}/attachments", status_code=201)
async def upload_test_attachment(request_id: str, file: UploadFile = File(...), run_id: str | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    request = await db.get(TestRequest, request_id)
    if not request:
        raise HTTPException(404, "Test request not found")
    allowed = await _can_manage(db, user, request) or request.tester_id == user.id
    if not allowed:
        raise HTTPException(403, "Not allowed to upload attachments")
    if not file.filename:
        raise HTTPException(400, "No filename provided")
    content = await file.read()
    max_size = await _get_upload_limit(db)
    if len(content) > max_size:
        raise HTTPException(413, "File size exceeds upload limit")
    run = await db.get(TestRun, run_id) if run_id else None
    if run_id and (not run or run.request_id != request_id):
        raise HTTPException(404, "Test run not found")
    scope = TestAttachment.run_id == run_id if run_id else TestAttachment.run_id.is_(None)
    if len((await db.execute(select(TestAttachment.id).where(TestAttachment.request_id == request_id, scope))).all()) >= 10:
        raise HTTPException(413, "Attachment limit reached")
    original = normalize_attachment_name(file.filename)
    filename = f"{encode_attachment_name(original)}{STORAGE_SUFFIX}"
    os.makedirs(_attachments_dir(), exist_ok=True)
    with open(_attachment_path(filename), "wb") as output:
        output.write(content)
    item = TestAttachment(request_id=request_id, run_id=run_id, filename=filename, original_name=original, content_type=file.content_type or mimetypes.guess_type(original)[0] or "application/octet-stream", size=len(content))
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return _attachment_dict(item)


@router.get("/attachments/{filename}")
async def get_test_attachment(filename: str, db: AsyncSession = Depends(get_db), _user: User = Depends(get_current_user)):
    item = await db.scalar(select(TestAttachment).where(TestAttachment.filename == filename))
    if not item:
        raise HTTPException(404, "Attachment not found")
    path = _attachment_path(filename)
    if not os.path.isfile(path):
        raise HTTPException(404, "Attachment file not found")
    return FileResponse(path, filename=item.original_name, media_type=item.content_type)


@collection_router.post("")
async def create_collection(body: TestCollectionCreate, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    now = datetime.now(UTC)
    raw = create_raw_token()
    row = TestCollectionLink(token_encrypted=encrypt_token(raw), token_hash=hash_link_token(raw), creator_id=user.id, expires_at=(now + timedelta(minutes=body.expires_in_minutes)).isoformat())
    db.add(row)
    await db.commit()
    frontend_url = (await get_frontend_url(db)).rstrip("/")
    response.headers["Cache-Control"] = "no-store"
    return {"id": row.id, "url": f"{frontend_url}/#/public/test-collections/{raw}", "expires_at": row.expires_at}


@collection_router.get("")
async def list_collections(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(select(TestCollectionLink).where(TestCollectionLink.creator_id == user.id).order_by(TestCollectionLink.created_at.desc()).limit(50))).scalars().all()
    response.headers["Cache-Control"] = "no-store"
    frontend_url = (await get_frontend_url(db)).rstrip("/")
    result = []
    for row in rows:
        active = row.used_at is None and row.revoked_at is None and row.expires_at > datetime.now(UTC).isoformat()
        url = None
        if active and row.token_encrypted:
            try:
                url = f"{frontend_url}/#/public/test-collections/{decrypt_token(row.token_encrypted)}"
            except (ValueError, RuntimeError, InvalidToken):
                # An old encryption key may no longer decrypt this saved link.
                pass
        result.append({"id": row.id, "expires_at": row.expires_at, "active": active, "created_at": row.created_at, "used_at": row.used_at, "revoked_at": row.revoked_at, "url": url})
    return result


@collection_router.post("/{link_id}/cancel", status_code=204)
async def cancel_collection(link_id: str, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = await db.scalar(select(TestCollectionLink).where(TestCollectionLink.id == link_id, TestCollectionLink.creator_id == user.id))
    if not row:
        raise HTTPException(404, "Collection link not found")
    if row.revoked_at:
        return
    if row.used_at or row.expires_at <= datetime.now(UTC).isoformat():
        raise HTTPException(409, "Collection link is closed")
    now = datetime.now(UTC).isoformat()
    result = await db.execute(update(TestCollectionLink).where(TestCollectionLink.id == row.id, TestCollectionLink.used_at.is_(None), TestCollectionLink.revoked_at.is_(None), TestCollectionLink.expires_at > now).values(revoked_at=now, token_encrypted=None))
    if result.rowcount != 1:
        raise HTTPException(409, "Collection link is closed")
    await db.commit()


async def _get_active_collection(db, token):
    return await db.scalar(select(TestCollectionLink).where(TestCollectionLink.token_hash == hash_link_token(token), TestCollectionLink.used_at.is_(None), TestCollectionLink.revoked_at.is_(None), TestCollectionLink.expires_at > datetime.now(UTC).isoformat()))


@public_router.get("/{token}")
async def get_public_collection(token: str, response: Response, db: AsyncSession = Depends(get_db)):
    row = await _get_active_collection(db, token)
    if not row:
        raise HTTPException(410, "Collection link expired or already used")
    response.headers["Cache-Control"] = "no-store"
    return {"expires_at": row.expires_at, "server_time": datetime.now(UTC).isoformat(), "max_file_size": await _get_upload_limit(db)}


@public_router.post("/{token}/attachments", status_code=201)
async def upload_public_test_attachment(token: str, file: UploadFile = File(...), db: AsyncSession = Depends(get_db)):
    row = await _get_active_collection(db, token)
    if not row:
        raise HTTPException(410, "Collection link expired or already used")
    content = await file.read()
    if len(content) > await _get_upload_limit(db):
        raise HTTPException(413, "File size exceeds upload limit")
    reserved = await db.execute(update(TestCollectionLink).where(
        TestCollectionLink.id == row.id,
        TestCollectionLink.used_at.is_(None),
        TestCollectionLink.revoked_at.is_(None),
        TestCollectionLink.expires_at > datetime.now(UTC).isoformat(),
        TestCollectionLink.attachment_count < 5,
    ).values(attachment_count=TestCollectionLink.attachment_count + 1))
    if reserved.rowcount != 1:
        if not await _get_active_collection(db, token):
            raise HTTPException(410, "Collection link expired or already used")
        raise HTTPException(413, "Attachment limit reached")
    name = normalize_attachment_name(file.filename or "attachment")
    filename = f"{encode_attachment_name(name)}{STORAGE_SUFFIX}"
    os.makedirs(_attachments_dir(), exist_ok=True)
    with open(_attachment_path(filename), "wb") as output:
        output.write(content)
    item = TestCollectionAttachment(collection_id=row.id, filename=filename, original_name=name, content_type=file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream", size=len(content))
    db.add(item)
    await db.commit()
    return {"filename": filename, "name": name, "url": f"/api/v1/public/test-collections/attachments/{filename}", "content_type": file.content_type or mimetypes.guess_type(name)[0] or "application/octet-stream", "size": len(content)}


@public_router.post("/{token}/submit", status_code=201)
async def submit_public_test(token: str, body: PublicTestSubmit, db: AsyncSession = Depends(get_db)):
    row = await _get_active_collection(db, token)
    if not row:
        raise HTTPException(410, "Collection link expired or already used")
    if body.issue_id and not await db.get(Issue, body.issue_id):
        raise HTTPException(404, "Linked issue not found")
    consumed = await db.execute(update(TestCollectionLink).where(TestCollectionLink.id == row.id, TestCollectionLink.used_at.is_(None), TestCollectionLink.revoked_at.is_(None), TestCollectionLink.expires_at > datetime.now(UTC).isoformat()).values(token_encrypted=None, used_at=datetime.now(UTC).isoformat()))
    if consumed.rowcount != 1:
        raise HTTPException(410, "Collection link already used")
    request = TestRequest(id=str(uuid.uuid4()), title=body.title, objective=body.objective, expected_effect=body.expected_effect, current_behavior=body.current_behavior, issue_id=body.issue_id, reporter_id=row.creator_id)
    db.add(request)
    await db.flush()
    attachments = (await db.execute(select(TestCollectionAttachment).where(TestCollectionAttachment.collection_id == row.id))).scalars().all()
    for attachment in attachments:
        db.add(TestAttachment(request_id=request.id, filename=attachment.filename, original_name=attachment.original_name, content_type=attachment.content_type, size=attachment.size))
    await db.commit()
    return {"id": request.id, "status": request.status}


@public_router.get("/attachments/{filename}")
async def get_public_test_attachment(filename: str, db: AsyncSession = Depends(get_db)):
    item = await db.scalar(select(TestCollectionAttachment).where(TestCollectionAttachment.filename == filename))
    if not item:
        raise HTTPException(404, "Attachment not found")
    path = _attachment_path(filename)
    if not os.path.isfile(path):
        raise HTTPException(404, "Attachment file not found")
    return FileResponse(path, filename=item.original_name, media_type=item.content_type)
