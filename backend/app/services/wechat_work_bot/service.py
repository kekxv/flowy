"""WeChat Work bot main service orchestrator."""

import json
import logging
import time
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token
from app.database import async_session
from app.models.wechat_work_bot import (
    WeChatWorkBotConfig,
    WeChatWorkBotLog,
    WeChatWorkBotUser,
)
from app.services.wechat_work_bot.client import WeChatWorkBotClient
from app.services.wechat_work_bot.command_parser import (
    COMMANDS,
    CommandParser,
    check_permission,
)
from app.services.wechat_work_bot.handlers import CommandHandlers
from app.services.wechat_work_bot.message_parser import MessageParser

logger = logging.getLogger("uvicorn")


class WeChatWorkBotService:
    """Manages the WeChat Work bot lifecycle and message processing."""

    def __init__(self):
        self._client: WeChatWorkBotClient | None = None
        self._running = False
        self._started_at: float = 0
        self._bot_id: str = ""
        self._ai_enabled: bool = False
        self._ai_config: dict | None = None
        # Pending assignments: wechat_user_id -> {assignee_name, issues: [(id, title), ...]}
        self._pending_assignments: dict[str, dict] = {}

    async def start(self, bot_id: str, secret: str, ai_enabled: bool = False, ai_config: dict | None = None) -> None:
        """Start the bot with given credentials."""
        if self._running:
            await self.stop()

        self._bot_id = bot_id
        self._ai_enabled = ai_enabled
        self._ai_config = ai_config
        self._client = WeChatWorkBotClient(bot_id, secret)
        self._client.on_message(self.handle_message)

        try:
            await self._client.start()
            self._running = True
            self._started_at = time.time()
            logger.info(f"WeChat Work bot started (bot_id={bot_id[:8]}...)")
        except Exception as e:
            logger.error(f"Failed to start bot: {e}")
            self._running = False
            raise

    async def stop(self) -> None:
        """Stop the bot."""
        if self._client:
            await self._client.stop()
            self._client = None
        self._running = False
        self._started_at = 0
        logger.info("WeChat Work bot stopped")

    @property
    def is_running(self) -> bool:
        return self._running

    @property
    def uptime_seconds(self) -> float:
        if self._started_at:
            return time.time() - self._started_at
        return 0

    async def handle_message(self, frame: dict) -> None:
        """Process an incoming message from WeChat Work."""
        # Debug: log full frame structure
        logger.debug(f"Full frame keys: {list(frame.keys())}")
        if "headers" in frame:
            logger.debug(f"Frame headers: {frame['headers']}")

        msg_parser = MessageParser()
        cmd_parser = CommandParser(ai_enabled=self._ai_enabled, ai_config=self._ai_config)

        # 1. Extract message context (including quoted content)
        msg_ctx = msg_parser.extract_context(frame)

        # Allow text, quoted content, or image messages
        frame_body = frame.get("body", {}) if isinstance(frame, dict) else {}
        msgtype = frame_body.get("msgtype", "")
        if not msg_ctx.text and not msg_ctx.quoted_content and msgtype not in ("image", "mixed"):
            return

        wechat_user_id = msg_ctx.from_userid
        if not wechat_user_id:
            logger.warning("Received message without userid")
            return

        chattype = msg_ctx.chattype
        logger.debug(f"Message from {wechat_user_id} (chattype={chattype}): {msg_ctx.text[:50]}...")

        # 2. Look up bot user mapping
        async with async_session() as db:
            bot_user = await self._get_bot_user(db, wechat_user_id)

            # 2.5. Check for pending assignment numeric reply
            if wechat_user_id in self._pending_assignments:
                pending = self._pending_assignments[wechat_user_id]
                text = msg_ctx.text.strip()
                if text.isdigit():
                    idx = int(text) - 1
                    issues = pending.get("issues", [])
                    if 0 <= idx < len(issues):
                        issue_id = issues[idx][0]
                        assignee_name = pending.get("assignee_name", "")
                        # Complete the assignment
                        handlers = CommandHandlers(db, bot_user, wechat_user_id)
                        try:
                            response = await handlers._complete_assign(issue_id, assignee_name)
                            if self._client:
                                await self._client.reply_markdown(frame, response)
                            await self._log_command(
                                db, wechat_user_id, bot_user.id if bot_user else None,
                                "assign", [str(idx + 1)], response, "success", None
                            )
                        except Exception as e:
                            logger.exception(f"Failed to complete assignment")
                            if self._client:
                                await self._client.reply_text(frame, f"❌ 指派失败: {e}")
                        finally:
                            del self._pending_assignments[wechat_user_id]
                        return
                    else:
                        if self._client:
                            await self._client.reply_text(frame, f"❌ 无效序号，请输入 1-{len(issues)}")
                        return

            # 3. Parse command
            parsed = await cmd_parser.parse(msg_ctx)

            if not parsed:
                # No command matched — send help hint if auto_reply
                if self._client and msg_ctx.text.strip():
                    await self._client.reply_text(
                        frame,
                        "💡 发送 /help 查看可用指令\n或 @我 并输入指令来操作 Flowy",
                    )
                return

            command_name = parsed.command
            cmd_def = COMMANDS.get(command_name, {})

            # 4. Check if user is registered (bind is exempt)
            if not bot_user and not cmd_def.get("allow_unregistered"):
                if self._client:
                    await self._client.reply_text(
                        frame,
                        "️ 您还没有权限使用此机器人，请联系管理员添加。\n"
                        "或使用管理员生成的绑定指令: `/bind <token>`",
                    )
                await self._log_command(
                    db, wechat_user_id, None, command_name, parsed.args,
                    "⚠️ 无权限", "failed", "User not registered"
                )
                return

            # 5. Check permission (bind is exempt)
            if bot_user and not check_permission(bot_user.role, command_name):
                if self._client:
                    await self._client.reply_text(
                        frame, f"⚠️ 您的角色 ({bot_user.role}) 没有权限执行 /{command_name}"
                    )
                await self._log_command(
                    db, wechat_user_id, bot_user.id, command_name, parsed.args,
                    "⚠️ 权限不足", "failed", "Insufficient permissions"
                )
                return

            # 6. Execute handler
            handlers = CommandHandlers(db, bot_user, wechat_user_id)
            handler_name = cmd_def.get("handler", "")
            handler_func = getattr(handlers, handler_name, None)

            if not handler_func:
                if self._client:
                    await self._client.reply_text(frame, f"❌ 指令处理器不存在: {handler_name}")
                return

            # Extract @mentions from incoming message
            mentioned = self._extract_mentions(frame)

            # Attach bot client to frame for handlers that need it (e.g., image download)
            frame["_bot_client"] = self._client

            try:
                response = await handler_func(parsed.args, parsed.quote_context, frame)
                if self._client:
                    await self._client.reply_markdown(frame, response, mentioned)
                await self._log_command(
                    db, wechat_user_id, bot_user.id, command_name,
                    parsed.args, response, "success", None
                )
            except Exception as e:
                logger.exception(f"Handler error for /{command_name}")
                error_msg = f"❌ 执行出错: {e}"
                if self._client:
                    await self._client.reply_text(frame, error_msg, mentioned)
                await self._log_command(
                    db, wechat_user_id, bot_user.id, command_name,
                    parsed.args, error_msg, "failed", str(e)
                )

    def _extract_mentions(self, frame: dict) -> list[str]:
        """Extract @mentioned userids from incoming message frame."""
        body = frame.get("body", {})
        mentioned: list[str] = []
        # SDK may include mentioned_list in the message
        if "mentioned_list" in body:
            ml = body["mentioned_list"]
            if isinstance(ml, list):
                mentioned.extend(str(m) for m in ml)
        return mentioned

    async def _get_bot_user(
        self, db: AsyncSession, wechat_user_id: str
    ) -> WeChatWorkBotUser | None:
        query = select(WeChatWorkBotUser).where(
            WeChatWorkBotUser.wechat_user_id == wechat_user_id
        )
        result = await db.execute(query)
        return result.scalar_one_or_none()

    async def _log_command(
        self,
        db: AsyncSession,
        wechat_user_id: str,
        flowy_user_id: str | None,
        command: str,
        args: list[str],
        response: str,
        status: str,
        error: str | None,
    ) -> None:
        log_entry = WeChatWorkBotLog(
            id=str(uuid.uuid4()),
            wechat_user_id=wechat_user_id,
            flowy_user_id=flowy_user_id,
            command=command,
            args=json.dumps(args, ensure_ascii=False),
            response=response[:2000],  # truncate long responses
            status=status,
            error=error,
            created_at=datetime.now().isoformat(),
        )
        db.add(log_entry)
        try:
            await db.commit()
        except Exception:
            logger.exception("Failed to log bot command")
            await db.rollback()

    async def load_config_and_start(self) -> bool:
        """Load config from DB and start the bot if configured. Returns True if started."""
        async with async_session() as db:
            config = await db.get(WeChatWorkBotConfig, "config")
            if not config:
                logger.info("No bot config found in database")
                return False

            cfg = config.config_dict
            bot_id = cfg.get("bot_id", "")
            secret_encrypted = cfg.get("secret", "")

            if not bot_id or not secret_encrypted:
                logger.info(f"Bot config incomplete: bot_id={bool(bot_id)}, secret={bool(secret_encrypted)}")
                return False

            try:
                secret = decrypt_token(secret_encrypted)
            except Exception as e:
                logger.error(f"Failed to decrypt bot secret: {e}")
                return False

            ai_enabled = cfg.get("ai_enabled", False)
            ai_config = None
            if ai_enabled:
                ai_api_key_encrypted = cfg.get("ai_api_key", "")
                ai_api_key = ""
                if ai_api_key_encrypted:
                    try:
                        ai_api_key = decrypt_token(ai_api_key_encrypted)
                    except Exception as e:
                        logger.error(f"Failed to decrypt AI API key: {e}")
                ai_config = {
                    "ai_base_url": cfg.get("ai_base_url", "https://api.openai.com/v1"),
                    "ai_api_key": ai_api_key,
                    "ai_model": cfg.get("ai_model", "gpt-4o-mini"),
                }
                logger.info(f"AI enabled: model={ai_config['ai_model']}, base_url={ai_config['ai_base_url']}")

            try:
                await self.start(bot_id, secret, ai_enabled, ai_config)
                return True
            except Exception as e:
                logger.error(f"Failed to start bot from config: {e}")
                return False


# Global singleton
bot_service = WeChatWorkBotService()
