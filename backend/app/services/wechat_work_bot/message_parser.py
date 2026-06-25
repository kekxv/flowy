"""Message context extraction and quoted content parsing."""

import re
from dataclasses import dataclass, field


@dataclass
class MessageContext:
    """Parsed message context from WeChat Work bot frame."""

    text: str = ""
    quoted_content: str = ""
    quoted_msgid: str = ""
    from_userid: str = ""
    chattype: str = "single"
    msgid: str = ""
    # @mentioned userids from the message
    mentioned_list: list[str] = field(default_factory=list)
    # Raw quote data (for image/media handling)
    raw_quote: dict = field(default_factory=dict)
    # Structured data extracted from quoted content
    extracted_issue_ids: list[int] = field(default_factory=list)
    extracted_usernames: list[str] = field(default_factory=list)
    extracted_numbers: list[int] = field(default_factory=list)


class MessageParser:
    """Extracts message context from SDK frames, including quoted content."""

    def extract_context(self, frame: dict) -> MessageContext:
        """Parse a WeChat Work SDK frame into a MessageContext."""
        body = frame.get("body", {})

        # Text content - clean invisible Unicode characters
        text_content = body.get("text", {}).get("content", "")
        # Debug: log raw text content
        import logging
        logging.getLogger("uvicorn").debug(f"Raw text content: {repr(text_content)}")
        # Remove invisible Unicode characters (U+2060 Word Joiner, U+FEFF BOM, etc.)
        text_content = self._clean_invisible_chars(text_content)
        # Strip @mentions from the beginning (e.g., "@机器人 /list" → "/list")
        text_content = self._strip_bot_mention(text_content)
        logging.getLogger("uvicorn").debug(f"Cleaned text content: {repr(text_content)}")

        # Quoted content — WeChat Work SDK wraps it as {"msgtype": "text", "text": {"content": "..."}}
        quoted_content = ""
        quoted_msgid = ""
        raw_quote: dict = {}

        # Check for quote/reference in the message structure
        if "quote" in body:
            quote = body["quote"]
            raw_quote = quote
            # SDK wraps quote content: {"msgtype": "text", "text": {"content": "..."}}
            quoted_content = quote.get("text", {}).get("content", "") or quote.get("content", "")
            quoted_msgid = quote.get("msgid", "")
        elif "ref" in body:
            ref = body["ref"]
            raw_quote = ref
            quoted_content = ref.get("text", {}).get("content", "") or ref.get("content", "")
            quoted_msgid = ref.get("msgid", "")
        elif "quoted_content" in body:
            quoted_content = body.get("quoted_content", "")
            quoted_msgid = body.get("quoted_msgid", "")

        # Extract structured info from quoted content
        extracted_issue_ids: list[int] = []
        extracted_usernames: list[str] = []
        extracted_numbers: list[int] = []

        if quoted_content:
            extracted_issue_ids = self._extract_issue_ids(quoted_content)
            extracted_usernames = self._extract_usernames(quoted_content)
            extracted_numbers = self._extract_numbers(quoted_content)

        # Extract @mentioned list from message body
        mentioned_list: list[str] = []
        if "mentioned_list" in body:
            ml = body["mentioned_list"]
            if isinstance(ml, list):
                mentioned_list = [str(m) for m in ml]

        return MessageContext(
            text=text_content.strip(),
            quoted_content=quoted_content.strip(),
            quoted_msgid=quoted_msgid,
            from_userid=body.get("from", {}).get("userid", ""),
            chattype=body.get("chattype", "single"),
            msgid=body.get("msgid", ""),
            mentioned_list=mentioned_list,
            raw_quote=raw_quote,
            extracted_issue_ids=extracted_issue_ids,
            extracted_usernames=extracted_usernames,
            extracted_numbers=extracted_numbers,
        )

    def _clean_invisible_chars(self, text: str) -> str:
        """Remove invisible Unicode characters that WeChat Work adds."""
        # Remove common invisible characters
        invisible_chars = [
            '⁠',  # Word Joiner
            '﻿',  # BOM / Zero Width No-Break Space
            '​',  # Zero Width Space
            '‌',  # Zero Width Non-Joiner
            '‍',  # Zero Width Joiner
            '⁡',  # Function Application
            '⁢',  # Invisible Times
            '⁣',  # Invisible Separator
            '⁤',  # Invisible Plus
            '᠎',  # Mongolian Vowel Separator
            '­',  # Soft Hyphen
        ]
        for char in invisible_chars:
            text = text.replace(char, '')
        return text

    def _strip_bot_mention(self, text: str) -> str:
        """Strip @bot mention from text (at start or end)."""
        text = text.strip()
        # @bot at start: "@bot /cmd" → "/cmd"
        match = re.match(r'^@\S+\s+(.*)', text, re.DOTALL)
        if match:
            return match.group(1).strip()
        # @bot at end: "/cmd @bot" → "/cmd"
        match = re.match(r'(.*?)\s+@\S+$', text, re.DOTALL)
        if match:
            return match.group(1).strip()
        return text

    def _extract_issue_ids(self, text: str) -> list[int]:
        """Extract issue IDs from text. Matches #123 or ISSUE-123 patterns."""
        ids: list[int] = []
        # #123 pattern
        for match in re.finditer(r"#(\d+)", text):
            ids.append(int(match.group(1)))
        # ISSUE-123 pattern
        for match in re.finditer(r"ISSUE-(\d+)", text, re.IGNORECASE):
            ids.append(int(match.group(1)))
        return list(dict.fromkeys(ids))  # deduplicate preserving order

    def _extract_usernames(self, text: str) -> list[str]:
        """Extract @-mentioned usernames from text."""
        names: list[str] = []
        for match in re.finditer(r"@(\S+)", text):
            names.append(match.group(1))
        return names

    def _extract_numbers(self, text: str) -> list[int]:
        """Extract standalone numbers from text (potential IDs)."""
        nums: list[int] = []
        for match in re.finditer(r"\b(\d+)\b", text):
            nums.append(int(match.group(1)))
        return nums
