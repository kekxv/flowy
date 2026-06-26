"""Command parsing and intent matching for WeChat Work bot."""

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.services.wechat_work_bot.message_parser import MessageContext

logger = logging.getLogger("uvicorn")


@dataclass
class ParsedCommand:
    """Result of parsing a message into a command."""

    command: str = ""
    args: list[str] = field(default_factory=list)
    raw_text: str = ""
    quote_context: dict[str, Any] = field(default_factory=dict)


# Command definitions: command -> (handler_name, minimum_roles)
COMMANDS: dict[str, dict[str, Any]] = {
    # General
    "help": {"handler": "handle_help", "roles": ["viewer", "helper", "admin"], "aliases": ["帮助", "指令", "菜单"]},
    "list": {"handler": "handle_list", "roles": ["viewer", "helper", "admin"], "aliases": ["列表", "问题列表", "所有问题", "查看问题"]},
    "stats": {"handler": "handle_stats", "roles": ["viewer", "helper", "admin"], "aliases": ["统计", "概况", "问题统计", "数据分析", "汇总"]},
    # Issue management
    "create": {"handler": "handle_create", "roles": ["helper", "admin"], "aliases": ["创建", "新建", "报 bug", "提需求"]},
    "update": {"handler": "handle_update", "roles": ["helper", "admin"], "aliases": ["更新", "修改", "编辑"]},
    "close": {"handler": "handle_close", "roles": ["helper", "admin"], "aliases": ["关闭", "标记完成"]},
    "resolve": {"handler": "handle_resolve", "roles": ["helper", "admin"], "aliases": ["解决", "完成", "处理完成", "解决问题"]},
    "assign": {"handler": "handle_assign", "roles": ["helper", "admin"], "aliases": ["指派", "分配", "指定负责人"]},
    "priority": {"handler": "handle_priority", "roles": ["helper", "admin"], "aliases": ["优先级", "调整优先级", "改优先级", "设置优先级"]},
    "comment": {"handler": "handle_comment", "roles": ["viewer", "helper", "admin"], "aliases": ["评论", "留言", "回复", "添加评论"]},
    # Milestone
    "milestone": {"handler": "handle_milestone", "roles": ["helper", "admin"], "aliases": ["里程碑", "版本", "迭代"]},
    # User management (admin only)
    "add_user": {"handler": "handle_add_user", "roles": ["admin"], "aliases": ["添加用户", "加人"]},
    "remove_user": {"handler": "handle_remove_user", "roles": ["admin"], "aliases": ["移除用户", "删除用户"]},
    "set_role": {"handler": "handle_set_role", "roles": ["admin"], "aliases": ["设置角色", "改角色"]},
    "list_users": {"handler": "handle_list_users", "roles": ["admin"], "aliases": ["用户列表", "列出用户"]},
    # Binding (available to all, even unregistered)
    "bind": {"handler": "handle_bind", "roles": ["viewer", "helper", "admin"], "aliases": ["绑定"], "allow_unregistered": True},
}

# Alias → canonical command lookup (built once)
ALIAS_MAP: dict[str, str] = {}
for _cmd, _def in COMMANDS.items():
    for _alias in _def.get("aliases", []):
        ALIAS_MAP[_alias] = _cmd

# Role hierarchy for permission checks
ROLE_LEVEL: dict[str, int] = {
    "viewer": 0,
    "helper": 1,
    "admin": 2,
}

# AI keyword matching: keyword -> command
AI_KEYWORDS: dict[str, list[str]] = {
    "create": ["创建", "新建", "报bug", "报一个bug", "提bug", "提交bug", "提需求", "需求", "功能需求", "新增", "建一个"],
    "list": ["列表", "问题列表", "有哪些问题", "看看问题", "列出问题", "所有问题", "查看问题"],
    "stats": ["统计", "汇总", "问题统计", "数据分析", "概况"],
    "close": ["关闭", "修复"],
    "resolve": ["解决", "已完成", "处理完", "完成", "解决问题"],
    "update": ["更新", "修改", "更改", "变更"],
    "help": ["帮助", "怎么用", "使用说明", "指令"],
    "milestone": ["里程碑", "版本", "sprint"],
    "comment": ["评论", "留言", "回复问题"],
    "priority": ["优先级", "改优先级", "调整优先级"],
}


class CommandParser:
    """Parses user messages into commands with context."""

    def __init__(self, ai_enabled: bool = False, ai_config: dict | None = None):
        self.ai_enabled = ai_enabled
        self._ai_config = ai_config

    async def parse(self, msg: MessageContext) -> ParsedCommand | None:
        """Parse a MessageContext into a ParsedCommand.

        Returns None if no valid command could be extracted.
        """
        text = msg.text

        # Build quote context
        quote_context: dict[str, Any] = {
            "quoted_content": msg.quoted_content,
            "extracted_issue_ids": msg.extracted_issue_ids,
            "extracted_usernames": msg.extracted_usernames,
            "extracted_numbers": msg.extracted_numbers,
            "mentioned_list": msg.mentioned_list,
            "chattype": msg.chattype,
            "raw_quote": msg.raw_quote,
        }

        # 1. Try /command format
        parsed = self._parse_slash_command(text, quote_context)
        if parsed:
            return parsed

        # 2. Try basic keyword matching (always enabled)
        parsed = self._ai_match(text, quote_context)
        if parsed:
            return parsed

        # 3. Try LLM matching (if AI enabled and configured)
        if self.ai_enabled and self._ai_config:
            parsed = await self._llm_match(text, quote_context)
            if parsed:
                return parsed

        return None

    def _parse_slash_command(
        self, text: str, quote_context: dict[str, Any]
    ) -> ParsedCommand | None:
        """Parse /command arg1 arg2 format (supports English and Chinese aliases)."""
        text = text.strip()
        if not text.startswith("/"):
            return None

        # Split into command and args
        parts = text.split(None, 1)
        cmd_name = parts[0][1:]  # Remove /

        # Try direct match (case-insensitive for English)
        canonical = cmd_name.lower() if cmd_name.isascii() else cmd_name

        # Try alias lookup
        if canonical not in COMMANDS:
            canonical = ALIAS_MAP.get(cmd_name, ALIAS_MAP.get(canonical))

        if not canonical or canonical not in COMMANDS:
            return None

        raw_args = parts[1] if len(parts) > 1 else ""
        args = raw_args.split() if raw_args else []

        # Handle multi-line content: first line is args, rest is body/description
        if "\n" in raw_args:
            lines = raw_args.split("\n", 1)
            args = lines[0].split()
            quote_context["multiline_body"] = lines[1].strip()

        return ParsedCommand(
            command=canonical,
            args=args,
            raw_text=text,
            quote_context=quote_context,
        )

    def _ai_match(self, text: str, quote_context: dict[str, Any]) -> ParsedCommand | None:
        """Simple keyword-based intent matching (no external LLM needed).

        Uses exact/complete match to avoid false positives.
        E.g., "统计" matches "统计" or "帮我统计", but NOT "我的统计数据".
        """
        text_lower = text.lower().strip()

        for command, keywords in AI_KEYWORDS.items():
            for kw in keywords:
                # Check for exact match or complete word/phrase match
                if self._is_complete_match(text_lower, kw):
                    # Extract args from the remaining text after keyword
                    remaining = text_lower.replace(kw, "").strip()
                    args = remaining.split() if remaining else []

                    # Special handling: "关闭问题123" -> close 123
                    if command == "close":
                        ids = re.findall(r"(\d+)", text)
                        if ids and not args:
                            args = ids

                    return ParsedCommand(
                        command=command,
                        args=args,
                        raw_text=text,
                        quote_context=quote_context,
                    )

        return None

    async def _llm_match(self, text: str, quote_context: dict[str, Any]) -> ParsedCommand | None:
        """Use LLM tool calling for intent matching when keyword matching fails."""
        if not self._ai_config:
            return None

        try:
            # Build tools definitions for function calling
            tools = []
            for cmd, info in COMMANDS.items():
                # Only include commands that the user's role can access
                aliases = info.get("aliases", [])
                desc = f"指令: /{cmd}"
                if aliases:
                    desc += f" (别名: {', '.join(aliases)})"
                tools.append({
                    "type": "function",
                    "function": {
                        "name": cmd,
                        "description": desc,
                        "parameters": {
                            "type": "object",
                            "properties": {
                                "args": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "指令参数列表",
                                },
                            },
                            "required": ["args"],
                        },
                    },
                })

            # Add a "none" tool for unrecognized input
            tools.append({
                "type": "function",
                "function": {
                    "name": "none",
                    "description": "无法识别的输入，不是任何已知指令",
                    "parameters": {
                        "type": "object",
                        "properties": {},
                    },
                },
            })

            headers = {
                "Authorization": f"Bearer {self._ai_config.get('ai_api_key', '')}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": self._ai_config.get("ai_model", "gpt-4o-mini"),
                "messages": [{"role": "user", "content": text}],
                "tools": tools,
                "tool_choice": "required",
                "temperature": 0,
            }

            async with httpx.AsyncClient(timeout=15) as client:
                resp = await client.post(
                    f"{self._ai_config.get('ai_base_url', 'https://api.openai.com/v1')}/chat/completions",
                    headers=headers,
                    json=payload,
                )
                data = resp.json()

                # Log response details
                choice = data.get("choices", [{}])[0]
                message = choice.get("message", {})

                # Thinking content (if any)
                thinking = message.get("reasoning_content") or message.get("thinking")
                if thinking:
                    logger.debug(f"LLM thinking: {thinking[:200]}...")

                # Text content
                content = message.get("content", "")
                if content:
                    logger.debug(f"LLM content: {content[:300]}")

                # Tool calls
                tool_calls = message.get("tool_calls", [])
                if tool_calls:
                    for tc in tool_calls:
                        func = tc.get("function", {})
                        logger.debug(f"LLM tool call: {func.get('name')}({func.get('arguments', '')[:200]})")

                # Extract tool call
                choice = data.get("choices", [{}])[0]
                message = choice.get("message", {})
                tool_calls = message.get("tool_calls", [])

                if not tool_calls:
                    return None

                call = tool_calls[0].get("function", {})
                cmd_name = call.get("name", "")

                if cmd_name and cmd_name != "none" and cmd_name in COMMANDS:
                    args_data = json.loads(call.get("arguments", "{}"))
                    args = args_data.get("args", [])
                    return ParsedCommand(
                        command=cmd_name,
                        args=args,
                        raw_text=text,
                        quote_context=quote_context,
                    )

        except Exception as e:
            import logging
            import traceback
            logging.getLogger("uvicorn").error(f"LLM tool call failed: {e}")
            logging.getLogger("uvicorn").error(traceback.format_exc())

        return None

    def _is_complete_match(self, text: str, keyword: str) -> bool:
        """Check if keyword is a complete match in text (not partial substring).

        Rules:
        - Exact match always works
        - Keyword at END of text always works (e.g., "帮我统计" matches "统计")
        - Keyword at START needs boundary after (e.g., "统计 xxx" matches, but "统计数据" doesn't)
        - Keyword in MIDDLE needs boundaries on both sides
        - For longer keywords (3+ chars), allow more flexible matching
        """
        # Exact match
        if text == keyword:
            return True

        # For longer keywords (3+ chars), use substring match
        if len(keyword) >= 3:
            return keyword in text

        # Keyword at END of text - always match
        # This handles "帮我统计", "请关闭", etc.
        if text.endswith(keyword):
            # But check it's not a compound word (keyword followed by more chars)
            # Since it's at the end, there are no following chars, so it's safe
            return True

        # Keyword at START - needs boundary after
        if text.startswith(keyword):
            next_char = text[len(keyword):len(keyword)+1]
            # Boundary: space, punctuation, or end of string
            if not next_char or next_char in ' /，。！？、\t\n':
                return True

        # Keyword in MIDDLE - needs boundaries on both sides
        boundaries = ' /，。！？、\t\n'
        idx = text.find(keyword)
        while idx != -1:
            prev_char = text[idx-1:idx] if idx > 0 else ''
            next_char = text[idx+len(keyword):idx+len(keyword)+1]
            if (not prev_char or prev_char in boundaries) and \
               (not next_char or next_char in boundaries):
                return True
            idx = text.find(keyword, idx + 1)

        return False


def check_permission(user_role: str, command_name: str) -> bool:
    """Check if a user role has permission to execute a command."""
    cmd_def = COMMANDS.get(command_name)
    if not cmd_def:
        return False
    allowed_roles = cmd_def["roles"]
    user_level = ROLE_LEVEL.get(user_role, -1)
    return any(ROLE_LEVEL.get(r, -1) <= user_level for r in allowed_roles)
