"""WeChat Work bot WebSocket long-connection client."""

import asyncio
import logging
from collections.abc import Callable, Coroutine
from typing import Any

logger = logging.getLogger("uvicorn")


class UnifiedSDKLogger:
    """SDK logger adapter that uses the app's unified log format."""

    def __init__(self, prefix: str = ""):
        self._sdk_logger = logging.getLogger("uvicorn")

    def debug(self, message: str, *args: object) -> None:
        self._sdk_logger.debug(message, *args)

    def info(self, message: str, *args: object) -> None:
        self._sdk_logger.info(message, *args)

    def warn(self, message: str, *args: object) -> None:
        self._sdk_logger.warning(message, *args)

    def error(self, message: str, *args: object) -> None:
        self._sdk_logger.error(message, *args)


class WeChatWorkBotClient:
    """WebSocket long-connection client for WeChat Work intelligent bot.

    Uses wecom-aibot-sdk-python SDK for the actual WebSocket connection.
    """

    def __init__(self, bot_id: str, secret: str):
        self.bot_id = bot_id
        self.secret = secret
        self._ws_client: Any = None
        self._running = False
        self._message_handler: Callable | None = None

    def on_message(self, handler: Callable[[dict], Coroutine]) -> None:
        """Register a message handler callback."""
        self._message_handler = handler

    @staticmethod
    def _frame_to_dict(frame: Any) -> dict:
        """Convert a WsFrame object (or any object) to a plain dict.

        The wecom-aibot-sdk dispatches WsFrame objects to event handlers,
        but the rest of the codebase expects plain dicts.
        """
        if isinstance(frame, dict):
            return frame
        # Try vars() first — works for regular objects and dataclasses.
        try:
            return vars(frame)
        except TypeError:
            pass
        # Fallback: extract known attributes from the SDK frame object.
        result: dict[str, Any] = {}
        _missing = object()
        for attr in ("cmd", "headers", "body"):
            val = getattr(frame, attr, _missing)
            if val is not _missing:
                result[attr] = val
        return result if result else {"cmd": "", "headers": {}, "body": {}}

    async def start(self) -> None:
        """Start the WebSocket connection."""
        if self._running:
            return

        try:
            from wecom_aibot_sdk import WSClient, WSClientOptions

            options = WSClientOptions(
                bot_id=self.bot_id,
                secret=self.secret,
                logger=UnifiedSDKLogger(),
            )
            self._ws_client = WSClient(options)

            if self._message_handler:
                handler = self._message_handler

                async def _on_text(frame):
                    d = self._frame_to_dict(frame)
                    if not isinstance(frame, dict):
                        d["_ws_frame"] = frame
                    await handler(d)

                async def _on_image(frame):
                    d = self._frame_to_dict(frame)
                    if not isinstance(frame, dict):
                        d["_ws_frame"] = frame
                    await handler(d)

                async def _on_mixed(frame):
                    d = self._frame_to_dict(frame)
                    if not isinstance(frame, dict):
                        d["_ws_frame"] = frame
                    await handler(d)

                async def _on_event(frame):
                    d = self._frame_to_dict(frame)
                    if not isinstance(frame, dict):
                        d["_ws_frame"] = frame
                    await handler(d)

                self._ws_client.on("message.text", _on_text)
                self._ws_client.on("message.image", _on_image)
                self._ws_client.on("message.mixed", _on_mixed)
                self._ws_client.on("aibot_event_callback", _on_event)

            self._running = True
            # SDK connect_async is async, run as background task
            asyncio.create_task(self._ws_client.connect_async())
            logger.info("WeChat Work bot client started (SDK mode)")

        except ImportError:
            logger.warning(
                "wecom-aibot-sdk-python not installed. "
                "Install with: pip install wecom-aibot-sdk-python"
            )
            self._running = False
            raise RuntimeError(
                "WeChat Work bot SDK not installed. "
                "Run: pip install wecom-aibot-sdk-python"
            )

    async def stop(self) -> None:
        """Stop the WebSocket connection."""
        self._running = False
        if self._ws_client:
            try:
                if hasattr(self._ws_client, "disconnect"):
                    self._ws_client.disconnect()
            except Exception:
                pass
            self._ws_client = None
        logger.info("WeChat Work bot client stopped")

    async def reply_text(self, frame: dict, text: str, mentioned: list[str] | None = None) -> None:
        """Reply with text via markdown format (aibot_respond_msg doesn't support plain text)."""
        if not self._ws_client:
            logger.warning("Bot client not running, cannot reply")
            return
        try:
            # Build text content with @mentions
            content = text
            if mentioned:
                mention_tags = "".join(f"@{uid} " for uid in mentioned)
                content = mention_tags + content

            # aibot_respond_msg doesn't support "text" type, use "markdown" instead
            body = {"msgtype": "markdown", "markdown": {"content": content}}
            logger.debug(f"Sending reply (markdown): {body}")
            # Use the original WsFrame for SDK calls (stored by _frame_to_dict wrappers)
            ws_frame = frame.get("_ws_frame", frame)
            await self._ws_client.reply(ws_frame, body)
        except Exception as e:
            logger.error(f"Failed to reply: {e}")
            # Fallback to HTTP response_url
            await self._reply_via_http(frame, text, mentioned, msgtype="markdown")

    async def _reply_via_http(self, frame: dict, text: str, mentioned: list[str] | None = None, msgtype: str = "markdown") -> None:
        """Fallback: reply via HTTP response_url."""
        try:
            import httpx
            body = frame.get("body", {})
            response_url = body.get("response_url", "")
            if not response_url:
                logger.error("No response_url in frame, cannot fallback to HTTP reply")
                return

            content = text
            if mentioned:
                mention_tags = "".join(f"@{uid} " for uid in mentioned)
                content = mention_tags + content

            payload = {"msgtype": msgtype, msgtype: {"content": content}}
            logger.debug(f"HTTP reply: {payload}")

            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(response_url, json=payload)
                resp_data = resp.json() if resp.text else {}
                logger.debug(f"HTTP reply status: {resp.status_code}, errcode: {resp_data.get('errcode')}")
                if resp_data.get("errcode", -1) == 0:
                    logger.info("HTTP reply succeeded!")
                else:
                    logger.error(f"HTTP reply failed: {resp_data.get('errmsg')}")
        except Exception as e:
            logger.error(f"Failed to reply via HTTP: {e}")

    async def reply_markdown(self, frame: dict, markdown: str, mentioned: list[str] | None = None) -> None:
        """Reply with markdown via aibot_send_msg (requires chatid).

        For group chats, uses chatid from frame.
        For single chats, uses from.userid as chatid.

        Args:
            frame: Original message frame
            markdown: Markdown content
            mentioned: List of userids to @mention
        """
        if not self._ws_client:
            logger.warning("Bot client not running, cannot reply")
            return
        try:
            body = frame.get("body", {})
            chattype = body.get("chattype", "single")

            # Extract chatid based on chat type
            if chattype == "group":
                chatid = body.get("chatid", "")
                if not chatid:
                    logger.error("Group chat but no chatid in frame")
                    await self.reply_text(frame, markdown, mentioned)
                    return
            else:
                # Single chat - use sender's userid
                chatid = body.get("from", {}).get("userid", "")

            if not chatid:
                logger.error("Cannot determine chatid from frame, falling back to text")
                await self.reply_text(frame, markdown, mentioned)
                return

            # Build markdown content with @mentions inline
            content = markdown
            if mentioned:
                mention_tags = "".join(f"@{uid} " for uid in mentioned)
                content = mention_tags + content

            # Try send_message first (aibot_send_msg)
            send_body = {"msgtype": "markdown", "markdown": {"content": content}}
            logger.debug(f"Sending markdown to {chatid} (chattype={chattype}): {send_body}")
            await self._ws_client.send_message(chatid, send_body)
        except Exception as e:
            logger.error(f"Failed to reply markdown via send_message: {e}")
            # Fallback to HTTP response_url
            try:
                await self._reply_via_http(frame, markdown, mentioned, msgtype="markdown")
            except Exception as e2:
                logger.error(f"Failed to reply markdown via HTTP: {e2}")

    async def reply_stream(self, frame: dict, text: str, finish: bool = True) -> None:
        """Reply with streaming text."""
        if not self._ws_client:
            logger.warning("Bot client not running, cannot reply")
            return
        try:
            from wecom_aibot_sdk import generate_req_id

            sid = generate_req_id("stream")
            # Use the original WsFrame for SDK calls (stored by _frame_to_dict wrappers)
            ws_frame = frame.get("_ws_frame", frame)
            await self._ws_client.reply_stream(ws_frame, sid, text, finish)
        except Exception as e:
            logger.error(f"Failed to reply stream: {e}")

    @property
    def is_running(self) -> bool:
        return self._running
