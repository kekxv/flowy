"""WeChat Work bot management API endpoints."""

import json
import uuid
from datetime import datetime
from typing import TYPE_CHECKING
from urllib.parse import quote, unquote

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

if TYPE_CHECKING:
    import httpx

from app.core.crypto import decrypt_token, encrypt_token
from app.core.url_security import url_belongs_to_source, validate_http_url
from app.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.models.wechat_work_bot import (
    IntranetSource,
    WeChatWorkBotConfig,
    WeChatWorkBotLog,
    WeChatWorkBotUser,
)
from app.schemas.wechat_work_bot import (
    BindTokenRequest,
    BindTokenResponse,
    BotActionResponse,
    BotConfigResponse,
    BotConfigUpdate,
    BotLogResponse,
    BotStatusResponse,
    BotUserCreate,
    BotUserResponse,
    BotUserUpdate,
    IntranetPreviewResponse,
    IntranetSourceCreate,
    IntranetSourceResponse,
    IntranetSourceTestRequest,
    IntranetSourceTestResponse,
    IntranetSourceUpdate,
    TestCommandRequest,
    TestCommandResponse,
)
from app.services.wechat_work_bot import bot_service
from app.services.wechat_work_bot.bind_token import generate_bind_token as _gen_token
from app.services.wechat_work_bot.intranet_auth import get_source_credentials

router = APIRouter(prefix="/wechat-work-bot", tags=["wechat-work-bot"])
public_router = APIRouter(tags=["wechat-work-bot"])


# ─── Config ───────────────────────────────────────────────────


@router.get("/config", response_model=BotConfigResponse)
async def get_config(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    config = await db.get(WeChatWorkBotConfig, "config")
    cfg = config.config_dict if config else {}
    return BotConfigResponse(
        bot_id=cfg.get("bot_id", ""),
        ai_enabled=cfg.get("ai_enabled", False),
        auto_reply=cfg.get("auto_reply", True),
        is_running=bot_service.is_running,
        ai_base_url=cfg.get("ai_base_url", ""),
        ai_model=cfg.get("ai_model", ""),
    )


@router.put("/config", response_model=BotConfigResponse)
async def update_config(
    body: BotConfigUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    config = await db.get(WeChatWorkBotConfig, "config")
    now = datetime.now().isoformat()

    cfg: dict = {}
    if config:
        cfg = config.config_dict

    if body.bot_id:
        cfg["bot_id"] = body.bot_id
    if body.secret:
        cfg["secret"] = encrypt_token(body.secret)
    cfg["ai_enabled"] = body.ai_enabled
    cfg["auto_reply"] = body.auto_reply
    if body.ai_base_url:
        cfg["ai_base_url"] = body.ai_base_url
    if body.ai_api_key:
        cfg["ai_api_key"] = encrypt_token(body.ai_api_key)
    if body.ai_model:
        cfg["ai_model"] = body.ai_model

    if config:
        config.value = json.dumps(cfg, ensure_ascii=False)
        config.updated_at = now
    else:
        config = WeChatWorkBotConfig(
            key="config",
            value=json.dumps(cfg, ensure_ascii=False),
            created_at=now,
            updated_at=now,
        )
        db.add(config)

    await db.commit()

    return BotConfigResponse(
        bot_id=cfg.get("bot_id", ""),
        ai_enabled=cfg.get("ai_enabled", False),
        auto_reply=cfg.get("auto_reply", True),
        is_running=bot_service.is_running,
        ai_base_url=cfg.get("ai_base_url", ""),
        ai_model=cfg.get("ai_model", ""),
    )


# ─── Control ──────────────────────────────────────────────────


@router.post("/start", response_model=BotActionResponse)
async def start_bot(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    if bot_service.is_running:
        return BotActionResponse(ok=True, message="机器人已在运行中")

    started = await bot_service.load_config_and_start()
    if started:
        return BotActionResponse(ok=True, message="机器人已启动")
    return BotActionResponse(ok=False, message="启动失败：请检查配置（bot_id 和 secret）")


@router.post("/stop", response_model=BotActionResponse)
async def stop_bot(
    _user: User = Depends(require_admin),
):
    if not bot_service.is_running:
        return BotActionResponse(ok=True, message="机器人未在运行")
    await bot_service.stop()
    return BotActionResponse(ok=True, message="机器人已停止")


@router.get("/status", response_model=BotStatusResponse)
async def get_status(
    _user: User = Depends(require_admin),
):
    return BotStatusResponse(
        is_running=bot_service.is_running,
        bot_id=bot_service._bot_id,
        uptime_seconds=bot_service.uptime_seconds,
    )


# ─── User Management ──────────────────────────────────────────


@router.get("/users", response_model=list[BotUserResponse])
async def list_users(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    query = select(WeChatWorkBotUser).order_by(WeChatWorkBotUser.created_at.desc())
    result = await db.execute(query)
    users = list(result.scalars().all())

    # Batch-load linked Flowy users to avoid N+1
    flowy_user_ids = {u.flowy_user_id for u in users if u.flowy_user_id}
    flowy_users_map: dict[str, User] = {}
    if flowy_user_ids:
        flowy_result = await db.execute(select(User).where(User.id.in_(list(flowy_user_ids))))
        flowy_users_map = {u.id: u for u in flowy_result.scalars().all()}

    responses = []
    for u in users:
        flowy_user = flowy_users_map.get(u.flowy_user_id) if u.flowy_user_id else None
        responses.append(
            BotUserResponse(
                id=u.id,
                wechat_user_id=u.wechat_user_id,
                display_name=u.display_name,
                flowy_user_id=u.flowy_user_id,
                role=u.role,
                flowy_user_name=flowy_user.display_name or flowy_user.username if flowy_user else "",
                created_at=u.created_at,
            )
        )
    return responses


@router.post("/users", response_model=BotUserResponse)
async def create_user(
    body: BotUserCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    # Check duplicate
    existing = await db.execute(
        select(WeChatWorkBotUser).where(
            WeChatWorkBotUser.wechat_user_id == body.wechat_user_id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(400, "该微信用户已存在")

    # Verify flowy user exists (if provided)
    flowy_user = None
    if body.flowy_user_id:
        flowy_user = await db.get(User, body.flowy_user_id)
        if not flowy_user:
            raise HTTPException(400, "Flowy 用户不存在")

    now = datetime.now().isoformat()
    bot_user = WeChatWorkBotUser(
        id=str(uuid.uuid4()),
        wechat_user_id=body.wechat_user_id,
        display_name=body.display_name,
        flowy_user_id=body.flowy_user_id,
        role=body.role,
        created_at=now,
        updated_at=now,
    )
    db.add(bot_user)
    await db.commit()
    await db.refresh(bot_user)

    return BotUserResponse(
        id=bot_user.id,
        wechat_user_id=bot_user.wechat_user_id,
        display_name=bot_user.display_name,
        flowy_user_id=bot_user.flowy_user_id,
        role=bot_user.role,
        flowy_user_name=flowy_user.display_name or flowy_user.username if flowy_user else "",
        created_at=bot_user.created_at,
    )


@router.put("/users/{user_id}", response_model=BotUserResponse)
async def update_user(
    user_id: str,
    body: BotUserUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    bot_user = await db.get(WeChatWorkBotUser, user_id)
    if not bot_user:
        raise HTTPException(404, "用户不存在")

    if body.display_name is not None:
        bot_user.display_name = body.display_name
    if body.flowy_user_id is not None:
        bot_user.flowy_user_id = body.flowy_user_id
    bot_user.role = body.role
    bot_user.updated_at = datetime.now().isoformat()
    await db.commit()
    await db.refresh(bot_user)

    flowy_user = await db.get(User, bot_user.flowy_user_id)
    return BotUserResponse(
        id=bot_user.id,
        wechat_user_id=bot_user.wechat_user_id,
        display_name=bot_user.display_name,
        flowy_user_id=bot_user.flowy_user_id,
        role=bot_user.role,
        flowy_user_name=flowy_user.display_name or flowy_user.username if flowy_user else "",
        created_at=bot_user.created_at,
    )


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    bot_user = await db.get(WeChatWorkBotUser, user_id)
    if not bot_user:
        raise HTTPException(404, "用户不存在")

    await db.delete(bot_user)
    await db.commit()
    return {"ok": True}


# ─── Logs ─────────────────────────────────────────────────────


@router.get("/logs", response_model=list[BotLogResponse])
async def list_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    offset = (page - 1) * page_size
    query = (
        select(WeChatWorkBotLog)
        .order_by(WeChatWorkBotLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    result = await db.execute(query)
    logs = result.scalars().all()

    return [
        BotLogResponse(
            id=log.id,
            wechat_user_id=log.wechat_user_id,
            flowy_user_id=log.flowy_user_id,
            command=log.command,
            args=log.args,
            response=log.response,
            status=log.status,
            error=log.error,
            created_at=log.created_at,
        )
        for log in logs
    ]


# ─── Bind Token ───────────────────────────────────────────────


@router.post("/bind-token", response_model=BindTokenResponse)
async def generate_bind_token(
    body: BindTokenRequest,
    _user: User = Depends(require_admin),
):
    """Generate a quick-binding token for a Flowy user."""
    if body.role not in ("admin", "helper", "viewer"):
        raise HTTPException(400, "Role must be admin/helper/viewer")

    token = _gen_token(body.flowy_user_id, body.role)
    return BindTokenResponse(
        token=token,
        command=f"/bind {token}",
        expires_in_seconds=600,
    )


# ─── Command Test ──────────────────────────────────────────────


@router.post("/test-command", response_model=TestCommandResponse)
async def test_command(
    body: TestCommandRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Simulate a bot command and return the response (no real WeChat message)."""
    from app.services.wechat_work_bot.command_parser import (
        COMMANDS,
        CommandParser,
        check_permission,
    )
    from app.services.wechat_work_bot.handlers import CommandHandlers
    from app.services.wechat_work_bot.message_parser import MessageContext

    text = body.command.strip()
    if not text:
        return TestCommandResponse(error="命令不能为空")

    # Create a synthetic message context
    msg_ctx = MessageContext(
        text=text,
        from_userid="admin-test",
        chattype="single",
    )

    parser = CommandParser()
    parsed = await parser.parse(msg_ctx)

    if not parsed:
        return TestCommandResponse(error=f"无法识别的命令: {text}")

    cmd_def = COMMANDS.get(parsed.command, {})

    # Create a synthetic admin-level bot user for testing
    from app.models.wechat_work_bot import WeChatWorkBotUser
    test_bot_user = WeChatWorkBotUser(
        id="test-admin",
        wechat_user_id="admin-test",
        flowy_user_id=_user.id,
        role="admin",
    )

    handlers = CommandHandlers(db, test_bot_user, "admin-test")
    handler_name = cmd_def.get("handler", "")
    handler_func = getattr(handlers, handler_name, None)

    if not handler_func:
        return TestCommandResponse(error=f"指令处理器不存在: {handler_name}")

    try:
        response = await handler_func(parsed.args, parsed.quote_context, {})
        return TestCommandResponse(response=response)
    except Exception as e:
        return TestCommandResponse(error=f"执行出错: {e}")


# ─── Intranet Sources ──────────────────────────────────────────


def _source_response(source: IntranetSource) -> IntranetSourceResponse:
    return IntranetSourceResponse(
        id=source.id,
        name=source.name,
        url=source.url,
        source_type=source.source_type,
        file_ttl_seconds=source.file_ttl_seconds,
        auth_username=source.auth_username or "",
        has_auth=bool(source.auth_username and source.auth_password_encrypted),
        created_at=source.created_at,
        updated_at=source.updated_at,
    )


@router.get("/intranet-sources", response_model=list[IntranetSourceResponse])
async def list_intranet_sources(
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    query = select(IntranetSource).order_by(IntranetSource.created_at.desc())
    result = await db.execute(query)
    sources = result.scalars().all()
    return [_source_response(source) for source in sources]


@router.post("/intranet-sources/test", response_model=IntranetSourceTestResponse)
async def test_intranet_source(
    body: IntranetSourceTestRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Test an unsaved source configuration without persisting it."""
    from app.services.wechat_work_bot.intranet_parser import parse_source

    try:
        await validate_http_url(body.url, allow_private=True)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc

    auth: tuple[str, str] | None = None
    if body.use_basic_auth:
        password = body.auth_password
        if not password:
            source = await db.get(IntranetSource, body.source_id)
            if not source:
                raise HTTPException(404, "文件源不存在")
            try:
                stored_auth = get_source_credentials(source)
            except Exception as exc:
                raise HTTPException(502, "读取文件源认证信息失败") from exc
            if not stored_auth:
                raise HTTPException(422, "该文件源没有可复用的认证密码")
            password = stored_auth[1]
        auth = (body.auth_username.strip(), password)

    try:
        files = await parse_source(body.url, body.source_type, auth=auth)
    except Exception as exc:
        raise HTTPException(502, "测试连接失败，请检查地址、类型或认证信息") from exc

    total = len(files)
    return IntranetSourceTestResponse(
        ok=True,
        message=f"连接成功，共获取 {total} 个文件",
        total=total,
    )


@router.post("/intranet-sources", response_model=IntranetSourceResponse)
async def create_intranet_source(
    body: IntranetSourceCreate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    try:
        await validate_http_url(body.url, allow_private=True)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    now = datetime.now().isoformat()
    source = IntranetSource(
        id=str(uuid.uuid4()),
        name=body.name,
        url=body.url,
        source_type=body.source_type,
        file_ttl_seconds=body.file_ttl_seconds,
        auth_username=body.auth_username.strip() or None,
        auth_password_encrypted=(encrypt_token(body.auth_password) if body.auth_password else None),
        created_at=now,
        updated_at=now,
    )
    db.add(source)
    await db.commit()
    await db.refresh(source)
    return _source_response(source)


@router.put("/intranet-sources/{source_id}", response_model=IntranetSourceResponse)
async def update_intranet_source(
    source_id: str,
    body: IntranetSourceUpdate,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    source = await db.get(IntranetSource, source_id)
    if not source:
        raise HTTPException(404, "文件源不存在")

    if body.name is not None:
        source.name = body.name
    if body.url is not None:
        try:
            await validate_http_url(body.url, allow_private=True)
        except ValueError as exc:
            raise HTTPException(422, str(exc)) from exc
        source.url = body.url
    if body.source_type is not None:
        source.source_type = body.source_type
    if body.file_ttl_seconds is not None:
        source.file_ttl_seconds = body.file_ttl_seconds
    if body.clear_auth:
        source.auth_username = None
        source.auth_password_encrypted = None
    else:
        if body.auth_username is not None:
            username = body.auth_username.strip()
            if not username:
                raise HTTPException(422, "清除认证请使用 clear_auth")
            source.auth_username = username
        if body.auth_password:
            if not source.auth_username:
                raise HTTPException(422, "Basic Auth 用户名不能为空")
            source.auth_password_encrypted = encrypt_token(body.auth_password)
        if bool(source.auth_username) != bool(source.auth_password_encrypted):
            raise HTTPException(422, "Basic Auth 用户名和密码必须同时配置")
    source.updated_at = datetime.now().isoformat()

    await db.commit()
    await db.refresh(source)
    return _source_response(source)


@router.delete("/intranet-sources/{source_id}")
async def delete_intranet_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    source = await db.get(IntranetSource, source_id)
    if not source:
        raise HTTPException(404, "文件源不存在")
    await db.delete(source)
    await db.commit()
    return {"ok": True}


@router.post("/intranet-sources/{source_id}/preview", response_model=IntranetPreviewResponse)
async def preview_intranet_source(
    source_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_admin),
):
    """Parse a source and return the file list for preview."""
    from app.services.wechat_work_bot.intranet_parser import parse_source

    source = await db.get(IntranetSource, source_id)
    if not source:
        raise HTTPException(404, "文件源不存在")

    try:
        files = await parse_source(
            source.url,
            source.source_type,
            auth=get_source_credentials(source),
        )
        return IntranetPreviewResponse(files=files[:30], total=len(files))
    except Exception as e:
        raise HTTPException(502, f"获取文件列表失败: {e}")


# ─── Intranet File Download Proxy ──────────────────────────────


async def _validate_download_token(
    token: str, db: AsyncSession
) -> tuple[str, str, IntranetSource]:
    """Validate download token and return (source_id, file_url, source)."""
    from app.services.wechat_work_bot.file_token import verify_file_token

    payload = verify_file_token(token)
    if not payload:
        raise HTTPException(401, "下载链接无效或已过期")

    source_id = payload["sid"]
    file_url = payload["url"]

    source = await db.get(IntranetSource, source_id)
    if not source:
        raise HTTPException(404, "文件源不存在或已被删除")

    try:
        await validate_http_url(source.url, allow_private=True)
        await validate_http_url(file_url, allow_private=True)
    except ValueError as exc:
        raise HTTPException(403, f"文件地址不安全: {exc}") from exc
    if not url_belongs_to_source(file_url, source.url):
        raise HTTPException(403, "文件地址不在配置的源范围内")

    return source_id, file_url, source


def _get_source_auth(source: IntranetSource) -> "httpx.BasicAuth | None":
    """Get Basic Auth from source credentials."""
    import httpx

    credentials = get_source_credentials(source)
    return httpx.BasicAuth(*credentials) if credentials else None


def _extract_filename(file_url: str) -> str:
    """Extract filename from URL and URL-decode it."""
    raw = file_url.rsplit("/", 1)[-1].split("?")[0] or "download"
    return unquote(raw)


def _content_disposition(filename: str) -> str:
    """Build Content-Disposition header with RFC 5987 UTF-8 support."""
    ascii_safe = filename.isascii() and '"' not in filename and "\\" not in filename
    if ascii_safe:
        return f'attachment; filename="{filename}"'
    encoded = quote(filename, safe="")
    return f"attachment; filename*=UTF-8''{encoded}"


@public_router.head("/intranet/download")
@router.head("/intranet/download")
async def head_intranet_file(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Get file metadata without downloading. Returns headers like Content-Length, Content-Type."""
    import httpx

    _, file_url, source = await _validate_download_token(token, db)
    basic_auth = _get_source_auth(source)

    try:
        async with httpx.AsyncClient(
            timeout=30,
            follow_redirects=False,
            auth=basic_auth,
        ) as client:
            resp = await client.head(file_url)
            if 300 <= resp.status_code < 400:
                raise HTTPException(502, "内网文件重定向已被拒绝")
            if resp.status_code >= 400:
                raise HTTPException(502, f"内网文件探测失败: HTTP {resp.status_code}")

            filename = _extract_filename(file_url)
            headers = {
                "Content-Disposition": _content_disposition(filename),
                "Accept-Ranges": "bytes",
            }
            # Forward relevant headers from upstream
            for key in ("content-length", "content-type", "last-modified", "etag"):
                if key in resp.headers:
                    headers[key.title()] = resp.headers[key]

            return Response(headers=headers)
    except HTTPException:
        raise
    except httpx.HTTPStatusError as e:
        raise HTTPException(502, f"内网文件探测失败: HTTP {e.response.status_code}")
    except Exception as e:
        raise HTTPException(502, f"内网文件探测失败: {e}")


@public_router.get("/intranet/download")
@router.get("/intranet/download")
async def download_intranet_file(
    token: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Proxy download for intranet files with true streaming (no memory buffering)."""
    import httpx

    _, file_url, source = await _validate_download_token(token, db)
    basic_auth = _get_source_auth(source)
    filename = _extract_filename(file_url)

    client = httpx.AsyncClient(
        timeout=httpx.Timeout(connect=30, read=300, write=30, pool=30),
        follow_redirects=False,
        auth=basic_auth,
    )
    response_holder = {"response": None, "client": client}

    async def stream_content():
        try:
            # Start stream and validate before yielding
            stream_ctx = client.stream("GET", file_url)
            resp = await stream_ctx.__aenter__()
            response_holder["response"] = resp
            response_holder["stream_ctx"] = stream_ctx

            # Validate status before any data is sent
            if 300 <= resp.status_code < 400:
                raise HTTPException(502, "内网文件重定向已被拒绝")
            if resp.status_code >= 400:
                raise HTTPException(502, f"内网文件获取失败: HTTP {resp.status_code}")

            # Now stream the content
            try:
                async for chunk in resp.aiter_bytes(chunk_size=65536):
                    yield chunk
            except TypeError:
                # Fallback for mocks that don't support chunk_size
                async for chunk in resp.aiter_bytes():
                    yield chunk
        finally:
            # Clean up
            if "stream_ctx" in response_holder:
                await response_holder["stream_ctx"].__aexit__(None, None, None)
            if hasattr(client, "aclose"):
                await client.aclose()

    # Validate will happen on first yield - but we need to check before returning StreamingResponse
    # So we do a quick validation by starting the stream
    try:
        stream_iter = stream_content().__aiter__()
        # Try to get first chunk to trigger validation
        first_chunk = await stream_iter.__anext__()

        # If we get here, validation passed - now create the actual stream
        async def validated_stream():
            try:
                yield first_chunk
                async for chunk in stream_iter:
                    yield chunk
            finally:
                # Cleanup happens in stream_content's finally block
                pass

        headers = {
            "Content-Disposition": _content_disposition(filename),
            "Accept-Ranges": "bytes",
        }

        return StreamingResponse(
            validated_stream(),
            media_type="application/octet-stream",
            headers=headers,
        )
    except HTTPException:
        # Clean up on validation failure
        if hasattr(client, "aclose"):
            await client.aclose()
        raise
    except httpx.HTTPStatusError as e:
        if hasattr(client, "aclose"):
            await client.aclose()
        raise HTTPException(502, f"内网文件获取失败: HTTP {e.response.status_code}")
    except Exception as e:
        if hasattr(client, "aclose"):
            await client.aclose()
        raise HTTPException(502, f"内网文件获取失败: {e}")
