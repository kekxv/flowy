"""WeChat Work bot management API endpoints."""

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token, encrypt_token
from app.database import get_db
from app.dependencies import require_admin
from app.models.user import User
from app.models.wechat_work_bot import (
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
)
from app.services.wechat_work_bot import bot_service
from app.services.wechat_work_bot.bind_token import generate_bind_token as _gen_token

router = APIRouter(prefix="/wechat-work-bot", tags=["wechat-work-bot"])


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
    users = result.scalars().all()

    responses = []
    for u in users:
        flowy_user = await db.get(User, u.flowy_user_id)
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
    page_size: int = Query(50, ge=1, le=200),
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

