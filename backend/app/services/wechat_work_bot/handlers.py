"""Command handlers for WeChat Work bot."""

import io
import json
import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import (
    Comment,
    Issue,
    Label,
    issue_assignees,
    issue_labels_table,
    issue_milestones_table,
)
from app.models.tracking import Milestone
from app.models.user import User
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.services.wechat_work_bot.bind_token import verify_bind_token

logger = logging.getLogger("uvicorn")


class CommandHandlers:
    """Handles all bot commands. Each handler returns a markdown string."""

    def __init__(
        self,
        db: AsyncSession,
        bot_user: WeChatWorkBotUser | None = None,
        wechat_user_id: str = "",
        client: object | None = None,
        frame: dict | None = None,
    ):
        self.db = db
        self.bot_user = bot_user
        self.wechat_user_id = wechat_user_id
        self.client = client
        self.frame = frame

    # ─── General ──────────────────────────────────────────────

    @staticmethod
    def _normalize_quoted_text(text: str) -> str:
        """Convert plain-text newlines to Markdown paragraph breaks.

        WeChat Work quoted messages are typically plain text with single \\n.
        If the text doesn't contain Markdown syntax, convert \\n → \\n\\n so
        it renders as proper paragraphs.
        """
        if not text:
            return text

        # Quick markers that suggest the text is already Markdown.
        _md_patterns = (
            r'**', r'__',      # bold
            r'* ', r'- ',       # unordered list
            r'# ', r'## ',      # headings
            r'[',               # links / images
            r'|',               # tables
            r'```',             # code fences
            r'> ',              # block quotes
        )
        if any(p in text for p in _md_patterns):
            return text

        # Plain text: double up single newlines for Markdown paragraphs.
        import re
        # Normalize: collapse 3+ newlines, then double single newlines.
        text = re.sub(r'\n{3,}', '\n\n', text)
        text = text.replace('\n', '\n\n')
        return text

    async def _get_assigned_issue_ids(self) -> list[str] | None:
        """Get issue IDs assigned to the current user.

        Returns None if user info is not available (show all issues).
        Returns empty list if no issues are assigned.
        """
        if not self.bot_user:
            return None  # Unregistered user, show all

        flowy_user_id = self.bot_user.flowy_user_id
        wechat_user_id = self.wechat_user_id

        # Query issue_assignees for this user
        conditions = []
        if flowy_user_id:
            conditions.append(issue_assignees.c.user_id == flowy_user_id)
        if wechat_user_id:
            conditions.append(issue_assignees.c.wechat_user_id == wechat_user_id)

        if not conditions:
            return None

        from sqlalchemy import or_
        query = select(issue_assignees.c.issue_id).where(or_(*conditions))
        result = await self.db.execute(query)
        return [row[0] for row in result.all()]

    async def _resolve_issue(self, query_text: str) -> "Issue | str":
        """Resolve an issue by ID prefix or title fuzzy match.

        Returns the Issue object on success, or an error message string:
        - "not_found": no match at all
        - A formatted string when multiple title matches exist
        """
        # Try ID prefix match first
        result = await self.db.execute(
            select(Issue).where(Issue.id.startswith(query_text))
        )
        issue = result.scalar_one_or_none()
        if issue:
            return issue

        # Try title fuzzy match
        result = await self.db.execute(
            select(Issue)
            .where(Issue.title.like(f"%{query_text}%"))
            .order_by(Issue.updated_at.desc())
            .limit(10)
        )
        issues = result.scalars().all()
        if len(issues) == 1:
            return issues[0]
        elif len(issues) > 1:
            lines = ["🔍 找到多个匹配的问题 (请更精确地指定):\n"]
            for i in issues[:5]:
                lines.append(f"- #{i.id[:8]} {i.title}")
            if len(issues) > 5:
                lines.append(f"- _...还有 {len(issues) - 5} 条_")
            return "\n".join(lines)
        return "not_found"

    async def handle_help(self, args: list[str], quote: dict, frame: dict = None) -> str:
        chattype = quote.get("chattype", "single")
        chat_hint = "💬 群聊模式" if chattype == "group" else "💬 私聊模式"

        return rf"""##  Flowy 机器人指令
> {chat_hint}

### 🔍 查询类
| 指令 | 说明 |
| --- | --- |
| `/list` `/列表` [status] | 问题列表 |
| `/stats` `/统计` | 问题统计 |
| `/wiki` `/知识库` [关键词] | 搜索知识库 |

### ✏️ 操作类
| 指令 | 说明 |
| --- | --- |
| `/create` `/创建` [类型] <标题> [描述] | 创建问题/需求 |
| `/update` `/修改` <id> <字段> <值> | 更新问题 |
| `/close` `/关闭` <id> [原因] | 关闭问题 |
| `/resolve` `/解决` <id> [说明] | 解决问题 |
| `/assign` `/指派` <id> <用户名> | 指派问题 |
| `/priority` `/优先级` <id> <级别> | 调整优先级 |
| `/comment` `/评论` <id> [内容] | 评论问题 |
| `/wiki add` `<标题> \| <内容>` | 快速添加知识库页面 |

### 🎯 里程碑
| 指令 | 说明 |
| --- | --- |
| `/milestone` `/里程碑` <操作> | 里程碑管理 |

### 👥 人员管理 (管理员)
| 指令 | 说明 |
| --- | --- |
| `/add_user` `/添加用户` <id> [角色] | 添加用户 |
| `/remove_user` `/移除用户` <id> | 移除用户 |
| `/set_role` `/设置角色` <id> <角色> | 设置角色 |
| `/list_users` `/用户列表` | 列出用户 |

### 🔗 账号绑定
| 指令 | 说明 |
| --- | --- |
| `/bind` `/绑定` <token> | 绑定 Flowy 账号 |

### 💡 使用提示
- 引用消息后发送指令，自动提取内容
- `/assign @某人` 可快速指派
- 优先级支持：紧急/高/中/低
"""

    async def handle_list(self, args: list[str], quote: dict, frame: dict = None) -> str:
        from datetime import datetime as dt
        from datetime import timedelta

        show_all = args and args[0].lower() == "all"
        assigned_issue_ids = await self._get_assigned_issue_ids()
        assigned_set = set(assigned_issue_ids) if assigned_issue_ids else set()

        # Time filter: only show resolved/closed issues from last 30 days
        # open/in_progress issues are not time-limited
        days_limit = 30
        cutoff_date = (dt.now() - timedelta(days=days_limit)).isoformat()

        base_filter = Issue.status != "cancelled"
        if not show_all:
            # Include open/in_progress (no time limit) + recent resolved/closed
            time_filter = (
                (Issue.status.in_(["open", "proposed", "in_progress", "accepted"])) |
                (Issue.updated_at >= cutoff_date)
            )
            base_filter = base_filter & time_filter

        query = select(Issue).where(base_filter)
        query = query.order_by(Issue.created_at.desc()).limit(50)
        result = await self.db.execute(query)
        all_issues = result.scalars().all()

        if not all_issues:
            return " 没有找到匹配的问题"

        assigned_set_local = assigned_set

        status_text = {
            "open": "[待处理]", "proposed": "[提议]", "in_progress": "[进行中]",
            "accepted": "[已接受]", "resolved": "[已解决]", "closed": "[已关闭]",
            "cancelled": "[已取消]", "rejected": "[已拒绝]",
        }
        priority_text = {
            "critical": "🔴紧急", "high": "🟠高", "medium": "中", "low": "低", "trivial": "⚪无关紧要",
        }

        def _resolve_end(issue) -> dt:
            """Return the time to measure against: closed_at for resolved/closed, now otherwise."""
            if issue.status in ("resolved", "closed") and issue.closed_at:
                try:
                    return dt.fromisoformat(issue.closed_at[:19])
                except (ValueError, TypeError):
                    pass
            return dt.now()

        def format_row(issue, is_mine: bool = False):
            end = _resolve_end(issue)
            created = dt.fromisoformat(issue.created_at[:19])
            seconds = int((end - created).total_seconds())
            if seconds < 60:
                duration = f"{seconds}秒"
            elif seconds < 3600:
                duration = f"{seconds // 60}分"
            elif seconds < 86400:
                duration = f"{seconds // 3600}时"
            else:
                duration = f"{seconds // 86400}天"
            st = status_text.get(issue.status, f"[{issue.status}]")
            pt = priority_text.get(issue.priority, issue.priority)
            title = issue.title[:25] + ".." if len(issue.title) > 25 else issue.title
            prefix = "★ " if is_mine else ""
            return f"| {st} | #{issue.id[:8]} | {prefix}{title} | {pt} | {duration} |"

        # Group by status in desired order:
        # 待处理 → 进行中 → 待审核 → 已解决 → 已关闭 → (终态)
        groups = [
            ("🔴 待处理", ["open"]),
            ("🔵 进行中", ["in_progress"]),
            ("🟡 待审核", ["proposed", "accepted"]),
            ("✅ 已解决", ["resolved"]),
            ("⬛ 已关闭", ["closed"]),
            ("⚪ 已结束", ["cancelled", "rejected"]),
        ]

        header = "| 状态 | ID | 标题 | 优先级 | 耗时 |"
        sep = "| --- | --- | --- | --- | --- |"
        lines: list[str] = []

        for group_label, group_statuses in groups:
            group_issues = [i for i in all_issues if i.status in group_statuses]
            if not group_issues:
                continue

            # Within group: my issues first, then others
            my_in_group = [i for i in group_issues if i.id in assigned_set_local]
            other_in_group = [i for i in group_issues if i.id not in assigned_set_local]

            lines.append(f"### {group_label} ({len(group_issues)})")
            lines.append(header)
            lines.append(sep)
            for issue in my_in_group:
                lines.append(format_row(issue, is_mine=True))
            for issue in other_in_group:
                lines.append(format_row(issue, is_mine=False))
            lines.append("")

        if not lines:
            return " 没有找到匹配的问题"

        scope = "全部" if show_all else f"近{days_limit}天"
        if len(all_issues) == 50:
            lines.append(f"> _仅显示最近 50 条 · {scope}_")

        return "\n".join(lines).rstrip()
    async def handle_stats(self, args: list[str], quote: dict, frame: dict = None) -> str:
        from datetime import datetime as dt
        from datetime import timedelta

        show_all = args and args[0].lower() == "all"
        assigned_issue_ids = await self._get_assigned_issue_ids()

        # Time filter: only count resolved/closed issues from last 30 days
        # open/in_progress issues are not time-limited
        days_limit = 30
        cutoff_date = (dt.now() - timedelta(days=days_limit)).isoformat()

        base_filter = Issue.status != "cancelled"
        if not show_all:
            # For non-all view: include open/in_progress (no time limit) + recent resolved/closed
            time_filter = (
                (Issue.status.in_(["open", "proposed", "in_progress", "accepted"])) |
                (Issue.updated_at >= cutoff_date)
            )
            base_filter = base_filter & time_filter

        if assigned_issue_ids is not None:
            if assigned_issue_ids:
                filter_cond = Issue.id.in_(assigned_issue_ids)
                base_filter = base_filter & filter_cond
            else:
                return " 没有指派给你的问题"

        total_q = select(func.count(Issue.id)).where(base_filter)
        total = (await self.db.execute(total_q)).scalar() or 0

        status_q = select(Issue.status, func.count(Issue.id)).where(base_filter).group_by(Issue.status)
        status_counts = dict((await self.db.execute(status_q)).all())

        priority_q = select(Issue.priority, func.count(Issue.id)).where(base_filter).group_by(Issue.priority)
        priority_counts = dict((await self.db.execute(priority_q)).all())

        # Find longest running active tasks
        active_filter = base_filter & Issue.status.in_(["open", "proposed", "in_progress", "accepted"])
        longest_q = select(Issue).where(active_filter).order_by(Issue.created_at.asc()).limit(3)
        longest_issues = (await self.db.execute(longest_q)).scalars().all()

        status_text = {
            "open": "待处理", "proposed": "提议", "in_progress": "进行中",
            "accepted": "已接受", "resolved": "已解决", "closed": "已关闭",
        }
        priority_text = {
            "critical": "紧急", "high": "高", "medium": "中", "low": "低", "trivial": "无关紧要",
        }

        now_str = dt.now().strftime("%H:%M")
        scope = f"近{days_limit}天" if not show_all else "全部"

        lines = [
            "### 📊 问题统计",
            f"> {now_str} · {scope} · 共 **{total}** 个",
            "",
            "**按状态:**",
            "| 状态 | 数量 | 占比 |",
            "| --- | ---: | ---: |",
        ]

        for status, count in sorted(status_counts.items(), key=lambda x: -x[1]):
            label = status_text.get(status, status)
            pct = int(count / max(total, 1) * 100)
            lines.append(f"| {label} | `{count}` | {pct}% |")

        # Overall progress bar (resolved + closed vs total)
        resolved_count = status_counts.get("resolved", 0) + status_counts.get("closed", 0)
        progress_pct = int(resolved_count / max(total, 1) * 100)
        progress_bar = "■" * min(progress_pct // 10, 10) + "□" * (10 - min(progress_pct // 10, 10))
        lines.extend([
            "",
            "**📈 当前进度:**",
            f"{progress_bar} {progress_pct}%（已解决 {resolved_count} / 总计 {total}）",
        ])

        lines.extend([
            "",
            "**按优先级:**",
            "| 优先级 | 数量 |",
            "| --- | ---: |",
        ])

        for priority, count in sorted(priority_counts.items(), key=lambda x: -x[1]):
            label = priority_text.get(priority, priority)
            lines.append(f"| {label} | `{count}` |")

        # Add longest running tasks section
        if longest_issues:
            lines.extend([
                "",
                "**⏱ 最长耗时任务:**",
            ])
            for issue in longest_issues:
                now = dt.now()
                created = dt.fromisoformat(issue.created_at[:19])
                days = (now - created).days
                hours = int((now - created).total_seconds() / 3600)
                duration = f"{days}天" if days > 0 else f"{hours}时"
                title = issue.title[:20] + ".." if len(issue.title) > 20 else issue.title
                lines.append(f"- #{issue.id[:8]} {title} — {duration}")

        return "\n".join(lines)

    # ─── Issue Management ─────────────────────────────────────

    async def handle_create(self, args: list[str], quote: dict, frame: dict = None) -> str:
        if not args:
            return "❌ 用法: `/create [类型] <标题> [描述...]`\n\n类型: bug/问题/缺陷 | feature/需求/功能/特性（默认 bug）\n标题后的内容自动作为描述，引用消息内容也会合并到描述"

        # Creating issues requires a linked Flowy account
        if not self.bot_user or not self.bot_user.flowy_user_id:
            return "⚠️ 创建问题需要绑定 Flowy 账号，请先联系管理员绑定"

        # Type mapping (English + Chinese)
        type_map: dict[str, str] = {
            "bug": "bug", "问题": "bug", "缺陷": "bug",
            "feature": "feature", "需求": "feature", "功能": "feature", "特性": "feature",
        }
        issue_type = "bug"
        if args[0].lower() in type_map:
            issue_type = type_map[args[0].lower()]
            args = args[1:]

        if not args:
            return "❌ 用法: `/create [类型] <标题> [描述...]`"

        # First non-type arg is the title, rest is description
        title = args[0]
        desc_parts: list[str] = []
        if len(args) > 1:
            desc_parts.append(" ".join(args[1:]))
        # Quoted content appends to description
        quoted = self._normalize_quoted_text(
            quote.get("multiline_body", "") or quote.get("quoted_content", "")
        )
        if quoted:
            desc_parts.append(quoted)
        description = "\n\n".join(desc_parts)

        now = datetime.now().isoformat()
        issue = Issue(
            id=str(uuid.uuid4()),
            title=title,
            description=description,
            issue_type=issue_type,
            status="open",
            priority="medium",
            reporter_id=self.bot_user.flowy_user_id,
            created_at=now,
            updated_at=now,
        )
        self.db.add(issue)

        # Auto-add label based on issue_type
        label = await self.db.execute(select(Label).where(Label.name == issue_type))
        label_obj = label.scalar_one_or_none()
        if label_obj:
            await self.db.execute(issue_labels_table.insert().values(
                issue_id=issue.id, label_id=label_obj.id
            ))

        # Auto-assign to linked Flowy user
        if self.bot_user and self.bot_user.flowy_user_id:
            await self.db.execute(
                issue_assignees.insert().values(
                    issue_id=issue.id,
                    user_id=self.bot_user.flowy_user_id,
                    role="member",
                    assigned_at=now,
                )
            )

        await self.db.commit()

        return f"✅ 已创建{'Bug' if issue_type == 'bug' else '需求'}: **#{issue.id[:8]}** {title}"


    async def handle_update(self, args: list[str], quote: dict, frame: dict = None) -> str:
        issue_id = None

        # Try to get issue reference from args or quoted content
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])
        elif args:
            # Treat first arg as potential title search
            issue_id = args[0]
            args = args[1:]

        if not issue_id or len(args) < 2:
            return "❌ 用法: `/update <id或标题> <字段> <值>` 或引用包含 #ID 的消息"

        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f"❌ 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        field_name = args[0].lower()
        value = " ".join(args[1:])

        # Handle quoted content as value for description
        if field_name == "description" and quote.get("quoted_content"):
            value = quote["quoted_content"]

        allowed_fields = {
            "status": ["open", "in_progress", "resolved", "closed", "cancelled",
                        "proposed", "accepted", "rejected"],
            "priority": ["critical", "high", "medium", "low", "trivial"],
            "title": None,
            "description": None,
        }

        if field_name not in allowed_fields:
            return f"❌ 不支持的字段: {field_name}（可用: {', '.join(allowed_fields.keys())}）"

        if allowed_fields[field_name] and value not in allowed_fields[field_name]:
            return f"❌ {field_name} 的值必须是: {', '.join(allowed_fields[field_name])}"

        old_value = getattr(issue, field_name, None)
        setattr(issue, field_name, value)
        issue.updated_at = datetime.now().isoformat()
        await self.db.commit()

        return f"✅ 已更新 #{issue.id[:8]}: {field_name} {old_value} → {value}"

    async def handle_close(self, args: list[str], quote: dict, frame: dict = None) -> str:
        issue_id = None

        # Try args first
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        # Try quoted content
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])
        elif args:
            # Treat first arg as potential title search
            issue_id = args[0]
            args = args[1:]

        if not issue_id:
            return "❌ 用法: `/close <id或标题> [原因]` 或引用包含 #ID 的消息"

        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f"❌ 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        if issue.status in ("closed", "cancelled"):
            return f"⚠️ 问题 #{issue.id[:8]} 已经是关闭状态"

        issue.status = "closed"
        issue.updated_at = datetime.now().isoformat()
        await self.db.commit()

        reason = " ".join(args) if args else ""
        msg = f"✅ 已关闭 #{issue.id[:8]}: {issue.title}"
        if reason:
            msg += f"\n> 原因: {reason}"
        return msg

    async def handle_resolve(self, args: list[str], quote: dict, frame: dict = None) -> str:
        """Resolve an issue (status → resolved), distinct from close."""
        issue_id = None

        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])
        elif args:
            issue_id = args[0]
            args = args[1:]

        if not issue_id:
            return "❌ 用法: `/解决 <id或标题> [说明]` 或引用包含 #ID 的消息"

        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f"❌ 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        if issue.status in ("resolved", "closed", "cancelled"):
            labels = {"resolved": "已解决", "closed": "已关闭", "cancelled": "已取消"}
            return f"⚠️ 问题 #{issue.id[:8]} 已经是{labels.get(issue.status, issue.status)}状态"

        issue.status = "resolved"
        issue.updated_at = datetime.now().isoformat()
        await self.db.commit()

        reason = " ".join(args) if args else ""
        msg = f"✅ 已解决 #{issue.id[:8]}: {issue.title}"
        if reason:
            msg += f"\n> 说明: {reason}"
        return msg

    async def handle_assign(self, args: list[str], quote: dict, frame: dict = None) -> str:
        issue_id = None
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])

        # If no issue_id yet, try to resolve first non-@ arg as title search
        if not issue_id and args and not args[0].startswith("@"):
            candidate = args[0]
            resolved = await self._resolve_issue(candidate)
            if isinstance(resolved, Issue):
                issue_id = resolved.id
                args = args[1:]
            elif isinstance(resolved, str) and resolved != "not_found":
                # Multiple matches or other error → show to user
                return resolved
            # else "not_found" → leave arg as-is, will be treated as assignee_name

        # Support @mention as assignee target
        assignee_name = None
        if args:
            assignee_name = args[0].lstrip("@")
            args = args[1:]
        elif quote.get("mentioned_list"):
            assignee_name = quote["mentioned_list"][0]
        elif quote.get("extracted_usernames"):
            assignee_name = quote["extracted_usernames"][0]

        # If only @mention provided (no issue_id), show issue list for selection
        if not issue_id and assignee_name:
            # Verify user exists first
            user_q = select(User).where(
                (User.username == assignee_name) | (User.display_name == assignee_name) | (User.nickname == assignee_name)
            )
            user_result = await self.db.execute(user_q)
            target_user = user_result.scalar_one_or_none()
            if not target_user:
                return f" 找不到用户: {assignee_name}"

            # Get open issues (limit 10)
            query = (
                select(Issue)
                .where(Issue.status.in_(["open", "in_progress", "proposed", "accepted"]))
                .order_by(Issue.created_at.desc())
                .limit(10)
            )
            result = await self.db.execute(query)
            issues = result.scalars().all()

            if not issues:
                return " 没有待处理的问题"

            # Build numbered list
            lines = [f"请选择要指派给 **{target_user.display_name or target_user.username}** 的问题：\n"]
            for i, issue in enumerate(issues, 1):
                status_emoji = {"open": "🟢", "in_progress": "🔵", "proposed": "🟡", "accepted": "🔵"}.get(issue.status, "⚪")
                title = issue.title[:35] + "..." if len(issue.title) > 35 else issue.title
                lines.append(f"{i}. {status_emoji} **#{issue.id[:8]}** {title}")
            lines.append(f"\n回复数字序号完成指派（1-{len(issues)}）")

            # Store pending assignment in service
            from app.services.wechat_work_bot.service import bot_service
            bot_service._pending_assignments[self.wechat_user_id] = {
                "assignee_name": assignee_name,
                "issues": [(issue.id, issue.title) for issue in issues],
            }

            return "\n".join(lines)

        if not issue_id or not assignee_name:
            return " 用法: `/assign <id或标题> <用户名>` 或 @某人后发送 /assign"

        return await self._complete_assign(issue_id, assignee_name)

    async def _complete_assign(self, issue_id: str, assignee_name: str) -> str:
        """Complete the assignment after user selects from list.

        Lookup order:
        1. Check if assignee_name is a WeChat Work user ID in bot users table -> get flowy_user_id
        2. Try matching by Flowy username/display_name
        3. Treat as external WeChat Work user
        """
        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f" 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        # Step 1: Check if assignee_name is a WeChat Work user ID in bot users table
        bot_user_q = select(WeChatWorkBotUser).where(
            WeChatWorkBotUser.wechat_user_id == assignee_name
        )
        bot_user_result = await self.db.execute(bot_user_q)
        bot_user_match = bot_user_result.scalar_one_or_none()

        target_flowy_user_id = None
        target_wechat_user_id = None
        target_display_name = assignee_name

        if bot_user_match:
            # Found in bot users table
            target_wechat_user_id = bot_user_match.wechat_user_id
            if bot_user_match.flowy_user_id:
                target_flowy_user_id = bot_user_match.flowy_user_id
                flowy_user = await self.db.get(User, target_flowy_user_id)
                if flowy_user:
                    target_display_name = flowy_user.display_name or flowy_user.username

        if not target_flowy_user_id:
            # Step 2: Try matching by Flowy username/display_name
            user_q = select(User).where(
                (User.username == assignee_name) | (User.display_name == assignee_name) | (User.nickname == assignee_name)
            )
            user_result = await self.db.execute(user_q)
            flowy_user = user_result.scalar_one_or_none()

            if flowy_user:
                target_flowy_user_id = flowy_user.id
                target_display_name = flowy_user.display_name or flowy_user.username

        if target_flowy_user_id:
            # Assign to Flowy user - check if already assigned
            existing = await self.db.execute(
                select(issue_assignees).where(
                    (issue_assignees.c.issue_id == issue.id) &
                    (issue_assignees.c.user_id == target_flowy_user_id)
                )
            )
            if not existing.first():
                await self.db.execute(
                    issue_assignees.insert().values(
                        issue_id=issue.id,
                        user_id=target_flowy_user_id,
                        wechat_user_id=target_wechat_user_id,
                        role="member",
                        assigned_at=datetime.now().isoformat(),
                    )
                )
            issue.updated_at = datetime.now().isoformat()
            await self.db.commit()
            return f" 已将 #{issue.id[:8]} 指派给 {target_display_name}"
        else:
            # Step 3: External WeChat Work user - assign by wechat_user_id only
            existing = await self.db.execute(
                select(issue_assignees).where(
                    (issue_assignees.c.issue_id == issue.id) &
                    (issue_assignees.c.wechat_user_id == assignee_name)
                )
            )
            if not existing.first():
                await self.db.execute(
                    issue_assignees.insert().values(
                        issue_id=issue.id,
                        user_id=None,
                        wechat_user_id=assignee_name,
                        role="member",
                        assigned_at=datetime.now().isoformat(),
                    )
                )
            issue.updated_at = datetime.now().isoformat()
            await self.db.commit()
            return f" 已将 #{issue.id[:8]} 指派给外部人员 {assignee_name}"
    # ─── Comments ─────────────────────────────────────────────

    async def handle_comment(self, args: list[str], quote: dict, frame: dict = None) -> str:
        """Handle /comment command with image support."""
        issue_id = None

        # Get issue reference from args or quoted content
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])
        elif args:
            issue_id = args[0]
            args = args[1:]

        if not issue_id:
            return " 用法: `/comment <id或标题> [内容]` 或引用问题消息后发送 /comment"

        # Find the issue
        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f" 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        # Build comment body
        body_parts = []

        # Text from args
        if args:
            body_parts.append(" ".join(args))

        # Quoted text content — normalize newlines and wrap as blockquote.
        if quote.get("quoted_content"):
            normalized = self._normalize_quoted_text(quote["quoted_content"])
            body_parts.append("> " + normalized.replace("\n", "\n> "))

        # Media from main message or quoted content (image, file, video)
        body = frame.get("body", {}) if frame else {}
        media_info = None
        media_type = None

        # Check main message
        main_msgtype = body.get("msgtype", "")
        if main_msgtype in ("image", "file", "video"):
            media_info = body.get(main_msgtype, {})
            media_type = main_msgtype
        # Check quoted content
        elif quote.get("raw_quote"):
            raw_quote = quote["raw_quote"]
            raw_msgtype = raw_quote.get("msgtype", "")
            if raw_msgtype in ("image", "file", "video"):
                media_info = raw_quote.get(raw_msgtype, {})
                media_type = raw_msgtype

        if media_info:
            media_url = media_info.get("url", "")
            aes_key = media_info.get("aeskey", "")
            if media_url:
                bot_client = frame.get("_bot_client") if frame else None
                if aes_key and bot_client and hasattr(bot_client, "_ws_client"):
                    try:
                        import os
                        data, filename_hint = await bot_client._ws_client.download_file(media_url, aes_key)
                        # Resize images if over 500KB
                        if media_type == "image" and len(data) > 500 * 1024:
                            try:
                                import io

                                from PIL import Image
                                img = Image.open(io.BytesIO(data))
                                img.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
                                buf = io.BytesIO()
                                img.save(buf, format="PNG", optimize=True)
                                data = buf.getvalue()
                                if not filename_hint or not filename_hint.endswith(".png"):
                                    filename_hint = (filename_hint or "image") + ".png"
                            except ImportError:
                                pass
                        # Save to local disk
                        if os.environ.get("UPLOAD_DIR"):
                            attachments_dir = os.path.join(os.environ["UPLOAD_DIR"], "bot_attachments")
                        else:
                            attachments_dir = os.path.join(os.environ.get("STATIC_DIR", "static"), "bot_attachments")
                        os.makedirs(attachments_dir, exist_ok=True)
                        # Generate unique filename
                        ext = filename_hint.rsplit(".", 1)[-1] if filename_hint and "." in filename_hint else "bin"
                        local_filename = f"{uuid.uuid4().hex[:12]}.{ext}"
                        local_path = os.path.join(attachments_dir, local_filename)
                        with open(local_path, "wb") as f:
                            f.write(data)
                        # Use relative URL with appropriate markdown syntax
                        if media_type == "image":
                            body_parts.append(f"![image](attachment:{local_filename})")
                        else:
                            body_parts.append(f"[{filename_hint or media_type}](attachment:{local_filename})")
                    except Exception as e:
                        logger.error(f"Failed to process {media_type}: {e}")
                        body_parts.append(f"[{media_type}]({media_url})")
                else:
                    body_parts.append(f"[{media_type}]({media_url})")

        if not body_parts:
            return " 请提供评论内容或引用消息"

        comment_body = "\n\n".join(body_parts)

        # Check if user has flowy_user_id (required for comments)
        if not self.bot_user or not self.bot_user.flowy_user_id:
            return " 评论功能需要绑定 Flowy 账号，请先联系管理员绑定"

        # Create comment
        now = datetime.now().isoformat()
        comment = Comment(
            id=str(uuid.uuid4()),
            issue_id=issue.id,
            author_id=self.bot_user.flowy_user_id,
            body=comment_body,
            created_at=now,
            updated_at=now,
        )
        self.db.add(comment)
        issue.updated_at = now
        await self.db.commit()

        return f" 已评论 #{issue.id[:8]}"

    async def handle_priority(self, args: list[str], quote: dict, frame: dict = None) -> str:
        """Handle /priority command: /priority <id> <critical|high|medium|low|trivial>"""
        from datetime import datetime as dt

        issue_id = None
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])
        elif args and len(args) >= 2:
            issue_id = args[0]
            args = args[1:]

        if not issue_id or not args:
            return " 用法: `/priority <id或标题> <紧急|高|中|低|无关紧要>`"

        # Support both English and Chinese priority names
        priority_map = {
            "critical": "critical", "紧急": "critical",
            "high": "high", "高": "high",
            "medium": "medium", "中": "medium",
            "low": "low", "低": "low",
            "trivial": "trivial", "无关紧要": "trivial",
        }
        new_priority = priority_map.get(args[0].lower(), args[0].lower())
        if new_priority not in ("critical", "high", "medium", "low", "trivial"):
            return " 优先级必须是：紧急/高/中/低/无关紧要"

        resolved = await self._resolve_issue(issue_id)
        if isinstance(resolved, str):
            return f" 找不到问题: {issue_id}" if resolved == "not_found" else resolved
        issue = resolved

        old_priority = issue.priority
        issue.priority = new_priority
        issue.updated_at = dt.now().isoformat()
        await self.db.commit()

        priority_text = {"critical": "紧急", "high": "高", "medium": "中", "low": "低", "trivial": "无关紧要"}
        return f" 已将 #{issue.id[:8]} 优先级从 {priority_text.get(old_priority, old_priority)} 改为 {priority_text.get(new_priority, new_priority)}"

    # ─── Milestone ────────────────────────────────────────────

    async def handle_milestone(self, args: list[str], quote: dict, frame: dict = None) -> str:
        if not args:
            return await self._milestone_list()

        subcmd = args[0].lower()
        sub_args = args[1:]

        if subcmd == "list":
            return await self._milestone_list()

        elif subcmd == "create":
            if not sub_args:
                return "❌ 用法: `/milestone create <名称>`"
            name = " ".join(sub_args)
            now = datetime.now().isoformat()
            ms = Milestone(
                id=str(uuid.uuid4()),
                name=name,
                status="open",
                owner_id=self.bot_user.flowy_user_id,
                created_at=now,
                updated_at=now,
            )
            self.db.add(ms)
            await self.db.commit()
            return f"✅ 已创建里程碑: **{name}**"

        elif subcmd == "close":
            if not sub_args:
                return "❌ 用法: `/milestone close <id>`"
            ms_id = sub_args[0]
            query = select(Milestone).where(Milestone.id.startswith(ms_id))
            result = await self.db.execute(query)
            ms = result.scalar_one_or_none()
            if not ms:
                return f"❌ 找不到里程碑 {ms_id}"
            ms.status = "closed"
            ms.updated_at = datetime.now().isoformat()
            await self.db.commit()
            return f"✅ 已关闭里程碑: **{ms.name}**"

        elif subcmd == "stats":
            if not sub_args:
                return "❌ 用法: `/milestone stats <id或标题>`"
            return await self._milestone_view(" ".join(sub_args))

        elif subcmd == "add":
            if len(sub_args) < 2:
                return "❌ 用法: `/milestone add <里程碑名称或ID> <#issue_id>`"
            ms_query_text = sub_args[0]
            issue_id = sub_args[1].lstrip("#")
            return await self._milestone_link(ms_query_text, issue_id, link=True)

        elif subcmd == "remove":
            if len(sub_args) < 2:
                return "❌ 用法: `/milestone remove <里程碑名称或ID> <#issue_id>`"
            ms_query_text = sub_args[0]
            issue_id = sub_args[1].lstrip("#")
            return await self._milestone_link(ms_query_text, issue_id, link=False)

        else:
            # Treat args as title or ID prefix query
            return await self._milestone_view(" ".join(args))

    async def _milestone_list(self) -> str:
        """List all milestones as a markdown table."""
        query = (
            select(Milestone, User.display_name)
            .outerjoin(User, Milestone.owner_id == User.id)
            .order_by(Milestone.created_at.desc())
        )
        result = await self.db.execute(query)
        rows = result.all()

        if not rows:
            return "📭 暂无里程碑"

        status_emoji = {"open": "🟢", "published": "🔵", "closed": "⚫"}
        lines = [
            "## 🏁 里程碑列表\n",
            "| 状态 | 名称 | 负责人 | 截止日期 | 进度 |",
            "| --- | --- | --- | --- | --- |",
        ]

        for ms, owner_name in rows:
            emoji = status_emoji.get(ms.status, "⚪")

            total_q = select(func.count()).where(issue_milestones_table.c.milestone_id == ms.id)
            total = (await self.db.execute(total_q)).scalar() or 0

            closed_q = (
                select(func.count())
                .where(
                    issue_milestones_table.c.milestone_id == ms.id,
                    Issue.id == issue_milestones_table.c.issue_id,
                    Issue.status.in_(["closed", "resolved"]),
                )
            )
            closed = (await self.db.execute(closed_q)).scalar() or 0

            progress = f"{round((closed / total) * 100)}% ({closed}/{total})" if total > 0 else "-"
            due = ms.due_date or "-"
            owner = owner_name or "-"

            lines.append(f"| {emoji} | {ms.name} | {owner} | {due} | {progress} |")

        return "\n".join(lines)

    async def _resolve_milestone(self, query_text: str) -> "Milestone | str":
        """Resolve a milestone by ID prefix or name fuzzy match.
        Returns the Milestone object on success, or an error message string.
        """
        result = await self.db.execute(
            select(Milestone).where(Milestone.id.startswith(query_text))
        )
        ms = result.scalar_one_or_none()
        if ms:
            return ms

        result = await self.db.execute(
            select(Milestone).where(Milestone.name.like(f"%{query_text}%"))
        )
        milestones = result.scalars().all()
        if len(milestones) == 1:
            return milestones[0]
        elif len(milestones) > 1:
            names = "\n".join(f"- {m.name} (ID: {m.id[:8]})" for m in milestones)
            return f"🔍 找到多个匹配的里程碑:\n{names}"
        return f"❌ 找不到里程碑: {query_text}"

    async def _milestone_link(self, ms_query_text: str, issue_id: str, link: bool) -> str:
        """Link or unlink an issue to/from a milestone."""
        resolved = await self._resolve_milestone(ms_query_text)
        if isinstance(resolved, str):
            return resolved
        ms = resolved

        # Find issue by ID prefix
        result = await self.db.execute(
            select(Issue).where(Issue.id.startswith(issue_id))
        )
        issue = result.scalar_one_or_none()
        if not issue:
            return f"❌ 找不到问题 #{issue_id}"

        # Check current association
        existing = await self.db.execute(
            select(issue_milestones_table).where(
                issue_milestones_table.c.milestone_id == ms.id,
                issue_milestones_table.c.issue_id == issue.id,
            )
        )
        already_linked = existing.first() is not None

        if link and already_linked:
            return f"⚠️ 问题 #{issue.id[:8]} 已在里程碑 **{ms.name}** 中"
        if not link and not already_linked:
            return f"⚠️ 问题 #{issue.id[:8]} 不在里程碑 **{ms.name}** 中"

        if link:
            await self.db.execute(
                issue_milestones_table.insert().values(
                    issue_id=issue.id, milestone_id=ms.id
                )
            )
            await self.db.commit()
            return f"✅ 已将 #{issue.id[:8]} 关联到里程碑 **{ms.name}**"
        else:
            await self.db.execute(
                issue_milestones_table.delete().where(
                    issue_milestones_table.c.milestone_id == ms.id,
                    issue_milestones_table.c.issue_id == issue.id,
                )
            )
            await self.db.commit()
            return f"✅ 已将 #{issue.id[:8]} 从里程碑 **{ms.name}** 中移除"

    async def _milestone_view(self, query_text: str) -> str:
        """View milestone details, progress stats, and associated issues."""
        from datetime import datetime as dt
        from datetime import timedelta

        resolved = await self._resolve_milestone(query_text)
        if isinstance(resolved, str):
            return resolved
        ms = resolved

        # Owner name
        owner_name = "-"
        if ms.owner_id:
            owner_name = (await self.db.execute(
                select(User.display_name).where(User.id == ms.owner_id)
            )).scalar() or "-"

        # Status distribution (exclude cancelled)
        status_counts_q = (
            select(Issue.status, func.count())
            .join(issue_milestones_table, Issue.id == issue_milestones_table.c.issue_id)
            .where(issue_milestones_table.c.milestone_id == ms.id, Issue.status != "cancelled")
            .group_by(Issue.status)
        )
        status_counts = dict((await self.db.execute(status_counts_q)).all())

        total = sum(status_counts.values())
        closed = status_counts.get("closed", 0) + status_counts.get("resolved", 0)
        progress = round((closed / total) * 100) if total > 0 else 0

        status_emoji = {"open": "🟢", "published": "🔵", "closed": "⚫"}
        emoji = status_emoji.get(ms.status, "⚪")

        lines = [f"## 🏁 {ms.name}"]
        lines.append(f"**状态**: {emoji} {ms.status}")
        lines.append(f"**负责人**: {owner_name}")
        if ms.due_date:
            lines.append(f"**截止日期**: {ms.due_date}")
        if ms.description:
            lines.append(f"**描述**: {ms.description}")
        lines.append(f"**进度**: {progress}% ({closed}/{total})")

        status_labels = {
            "open": "待处理", "proposed": "提议", "in_progress": "进行中",
            "accepted": "已接受", "resolved": "已解决", "closed": "已关闭",
        }
        dist_parts = [f"{status_labels.get(s, s)}: {c}" for s, c in status_counts.items()]
        if dist_parts:
            lines.append(f"**分布**: {' / '.join(dist_parts)}")

        lines.append("")

        # Associated issues with time filter (same rules as handle_list)
        days_limit = 30
        cutoff_date = (dt.now() - timedelta(days=days_limit)).isoformat()

        issues_q = (
            select(Issue)
            .join(issue_milestones_table, Issue.id == issue_milestones_table.c.issue_id)
            .where(
                issue_milestones_table.c.milestone_id == ms.id,
                Issue.status != "cancelled",
                (Issue.status.in_(["open", "proposed", "in_progress", "accepted"]))
                | (Issue.updated_at >= cutoff_date),
            )
            .order_by(Issue.created_at.desc())
            .limit(50)
        )
        result = await self.db.execute(issues_q)
        issues = result.scalars().all()

        if issues:
            status_text = {
                "open": "[待处理]", "proposed": "[提议]", "in_progress": "[进行中]",
                "accepted": "[已接受]", "resolved": "[已解决]", "closed": "[已关闭]",
                "cancelled": "[已取消]", "rejected": "[已拒绝]",
            }
            priority_text = {
                "critical": "🔴紧急", "high": "🟠高", "medium": "中",
                "low": "低", "trivial": "⚪无关紧要",
            }

            def _resolve_end(issue) -> dt:
                if issue.status in ("resolved", "closed") and issue.closed_at:
                    try:
                        return dt.fromisoformat(issue.closed_at[:19])
                    except (ValueError, TypeError):
                        pass
                return dt.now()

            def format_row(issue):
                end = _resolve_end(issue)
                created = dt.fromisoformat(issue.created_at[:19])
                seconds = int((end - created).total_seconds())
                if seconds < 60:
                    duration = f"{seconds}秒"
                elif seconds < 3600:
                    duration = f"{seconds // 60}分"
                elif seconds < 86400:
                    duration = f"{seconds // 3600}时"
                else:
                    duration = f"{seconds // 86400}天"
                st = status_text.get(issue.status, f"[{issue.status}]")
                pt = priority_text.get(issue.priority, issue.priority)
                title = issue.title[:25] + ".." if len(issue.title) > 25 else issue.title
                return f"| {st} | #{issue.id[:8]} | {title} | {pt} | {duration} |"

            # Group by status category: 待处理 / 处理中 / 已处理
            group_defs = [
                ("🔴 待处理", ["open", "proposed"]),
                ("🔵 处理中", ["in_progress", "accepted"]),
                ("✅ 已处理", ["resolved", "closed", "cancelled", "rejected"]),
            ]

            table_header = "| 状态 | ID | 标题 | 优先级 | 耗时 |"
            table_sep = "| --- | --- | --- | --- | --- |"

            for group_label, group_statuses in group_defs:
                group_issues = [i for i in issues if i.status in group_statuses]
                if not group_issues:
                    continue
                lines.append(f"### {group_label} ({len(group_issues)})")
                lines.append(table_header)
                lines.append(table_sep)
                for issue in group_issues:
                    lines.append(format_row(issue))
                lines.append("")
        else:
            lines.append("_暂无关联问题_")

        return "\n".join(lines)

    # ─── User Management (admin only) ─────────────────────────

    async def handle_add_user(self, args: list[str], quote: dict, frame: dict = None) -> str:
        # Support @mention to get wechat_user_id
        wechat_id = None
        role = "viewer"
        if args:
            wechat_id = args[0].lstrip("@")
            if len(args) > 1 and args[1] in ("admin", "helper", "viewer"):
                role = args[1]
        elif quote.get("mentioned_list"):
            wechat_id = quote["mentioned_list"][0]
            if args and args[0] in ("admin", "helper", "viewer"):
                role = args[0]
        if not wechat_id:
            return " 用法: `/add_user <wechat_id> [role]` 或 @某人后发送 /add_user"

        if role not in ("admin", "helper", "viewer"):
            return " 角色必须是 admin/helper/viewer"

        # Check if user already exists
        existing = await self.db.execute(
            select(WeChatWorkBotUser).where(WeChatWorkBotUser.wechat_user_id == wechat_id)
        )
        if existing.scalar_one_or_none():
            return f" 用户 {wechat_id} 已存在，请使用 /set_role 修改角色"

        # Find matching Flowy user (optional — try by username)
        flowy_user_id = None
        user_q = select(User).where((User.username == wechat_id) | (User.nickname == wechat_id))
        user_result = await self.db.execute(user_q)
        flowy_user = user_result.scalar_one_or_none()
        if flowy_user:
            flowy_user_id = flowy_user.id

        now = datetime.now().isoformat()
        bot_user = WeChatWorkBotUser(
            id=str(uuid.uuid4()),
            wechat_user_id=wechat_id,
            flowy_user_id=flowy_user_id,
            role=role,
            created_at=now,
            updated_at=now,
        )
        self.db.add(bot_user)
        await self.db.commit()

        bound_msg = f"，已关联 Flowy 账号 **{flowy_user.display_name or flowy_user.username}**" if flowy_user else "（未绑定 Flowy 账号）"
        role_label = {"admin": "管理员", "helper": "协助人员", "viewer": "查看者"}.get(role, role)
        return f" 已添加用户 `{wechat_id}`，角色: {role_label}{bound_msg}"
    async def handle_remove_user(self, args: list[str], quote: dict, frame: dict = None) -> str:
        if not args:
            return "❌ 用法: `/remove_user <wechat_user_id>`"

        wechat_id = args[0].lstrip("@")
        query = select(WeChatWorkBotUser).where(WeChatWorkBotUser.wechat_user_id == wechat_id)
        result = await self.db.execute(query)
        bot_user = result.scalar_one_or_none()

        if not bot_user:
            return f"❌ 找不到用户 {wechat_id}"

        await self.db.delete(bot_user)
        await self.db.commit()
        return f"✅ 已移除用户 {wechat_id}"

    async def handle_set_role(self, args: list[str], quote: dict, frame: dict = None) -> str:
        if len(args) < 2:
            return "❌ 用法: `/set_role <wechat_user_id> <admin|helper|viewer>`"

        wechat_id = args[0].lstrip("@")
        new_role = args[1]

        if new_role not in ("admin", "helper", "viewer"):
            return "❌ 角色必须是 admin/helper/viewer"

        query = select(WeChatWorkBotUser).where(WeChatWorkBotUser.wechat_user_id == wechat_id)
        result = await self.db.execute(query)
        bot_user = result.scalar_one_or_none()

        if not bot_user:
            return f"❌ 找不到用户 {wechat_id}"

        bot_user.role = new_role
        bot_user.updated_at = datetime.now().isoformat()
        await self.db.commit()

        return f"✅ 已将 {wechat_id} 的角色设置为 {new_role}"

    async def handle_list_users(self, args: list[str], quote: dict, frame: dict = None) -> str:
        query = select(WeChatWorkBotUser)
        result = await self.db.execute(query)
        users = result.scalars().all()

        if not users:
            return " 暂无机器人用户，使用 `/add_user <wechat_id> [role]` 添加"

        role_emoji = {"admin": "👑", "helper": "🛠", "viewer": ""}
        lines = ["## 👥 机器人用户列表\n"]
        for u in users:
            emoji = role_emoji.get(u.role, "⚪")
            bound = ""
            if u.flowy_user_id:
                flowy_user = await self.db.get(User, u.flowy_user_id)
                if flowy_user:
                    bound = f" → {flowy_user.display_name or flowy_user.username}"
            else:
                bound = " _(未绑定)_"
            lines.append(f"{emoji} `{u.wechat_user_id}` — {u.role}{bound}")
        return "\n".join(lines)
    # ─── Binding ──────────────────────────────────────────────

    async def handle_bind(self, args: list[str], quote: dict, frame: dict = None) -> str:
        """Handle /bind <token> — available to unregistered users."""
        if not args:
            return "❌ 用法: `/bind <token>`\n\n请联系管理员生成绑定指令"

        token = args[0]
        result = verify_bind_token(token)

        if not result:
            return "⚠️ 绑定指令无效或已过期（有效期 10 分钟）\n\n请联系管理员重新生成"

        # Check if already bound
        existing = await self.db.execute(
            select(WeChatWorkBotUser).where(WeChatWorkBotUser.wechat_user_id == self.wechat_user_id)
        )
        if existing.scalar_one_or_none():
            return "⚠️ 您已绑定过 Flowy 账号，无需重复绑定"

        # Verify Flowy user exists
        flowy_user = await self.db.get(User, result["uid"])
        if not flowy_user:
            return "❌ 绑定的 Flowy 账号不存在"

        now = datetime.now().isoformat()
        bot_user = WeChatWorkBotUser(
            id=str(uuid.uuid4()),
            wechat_user_id=self.wechat_user_id,
            flowy_user_id=result["uid"],
            role=result["role"],
            created_at=now,
            updated_at=now,
        )
        self.db.add(bot_user)
        await self.db.commit()

        role_label = {"admin": "管理员", "helper": "协助人员", "viewer": "查看者"}.get(result["role"], result["role"])
        return (
            f"✅ 绑定成功！\n\n"
            f"Flowy 账号: **{flowy_user.display_name or flowy_user.username}**\n"
            f"角色: {role_label}\n\n"
            f"发送 `/help` 查看可用指令"
        )

    # ─── Wiki / Knowledge Base ──────────────────────────────────

    async def handle_wiki(self, args: list[str], quote: dict, frame: dict = None) -> str:
        """Handle /wiki command — search, list, or add wiki pages.

        Usage:
        - /wiki — list recent wiki pages
        - /wiki add 标题 | 内容 — quick add a private wiki page
        - /wiki 关键词 — search wiki
        """
        from app.services import wiki_service

        if not self.bot_user or not self.bot_user.flowy_user_id:
            return "⚠️ 请先使用 `/bind` 绑定 Flowy 账号"

        user_id = self.bot_user.flowy_user_id

        # No args: list recent pages
        if not args:
            import re as _re
            pages = await wiki_service.get_recent_pages_for_bot(self.db, user_id, limit=10)
            if not pages:
                return "📚 暂无知识库页面\n\n使用 `/wiki add 标题 | 内容` 快速添加"
            lines = ["📚 **最近的知识库页面**\n"]
            for p in pages:
                visibility = "🌐" if p.is_public else "🔒"
                # Plain text preview
                text = _re.sub(r'!\[[^\]]*\]\([^)]+\)', '', p.content or "")
                text = _re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
                text = _re.sub(r'[*_#>`\-|]', '', text)
                text = _re.sub(r'\n+', ' ', text).strip()
                preview = (text[:80] + "...") if len(text) > 80 else text
                lines.append(f"{visibility} **{p.title}**")
                if preview:
                    lines.append(f"  _{preview}_")
                # Show attachments count
                img_count = len(_re.findall(r'!\[[^\]]*\]\([^)]+\)', p.content or ""))
                file_count = len(_re.findall(r'\[[^\]]+\]\(/api/v1/wiki/files/[^)]+\)', p.content or "")) - img_count
                if img_count or file_count:
                    parts = []
                    if img_count:
                        parts.append(f"🖼{img_count}图")
                    if file_count:
                        parts.append(f"📎{file_count}文件")
                    lines.append(f"  _({'  '.join(parts)})_")
            return "\n".join(lines)

        # /wiki add 标题 | 内容
        if args[0] == "add":
            raw = " ".join(args[1:])
            if "|" not in raw:
                return "❌ 用法: `/wiki add 标题 | 内容`\n\n例: `/wiki add Docker常用命令 | docker ps -a 查看所有容器`"
            parts = raw.split("|", 1)
            title = parts[0].strip()
            content = parts[1].strip() if len(parts) > 1 else ""
            if not title:
                return "❌ 标题不能为空"
            page = await wiki_service.create_page(self.db, owner_id=user_id, title=title, content=content)
            return f"✅ 知识库页面已创建\n\n**{page.title}**\n🔒 私密\n\n使用 `/wiki {title}` 搜索"

        # /wiki 关键词 — search
        keyword = " ".join(args)

        # Get related user IDs: find issues this user is involved with
        related_user_ids: list[str] = []
        # Find issues where the user is an assignee
        from app.models.issue import issue_assignees
        result = await self.db.execute(
            select(issue_assignees.c.issue_id).where(
                issue_assignees.c.user_id == user_id
            ).limit(20)
        )
        issue_ids = [row[0] for row in result.all()]
        if issue_ids:
            # Get all assignees of those issues
            result = await self.db.execute(
                select(issue_assignees.c.user_id).where(
                    issue_assignees.c.issue_id.in_(issue_ids)
                ).distinct()
            )
            related_user_ids = [row[0] for row in result.all() if row[0] != user_id]

        search_result = await wiki_service.search_for_bot(
            self.db, keyword, user_id, related_user_ids
        )
        related_pages = search_result["related"]
        public_pages = search_result["public"]

        if not related_pages and not public_pages:
            return f"🔍 未找到与 \"{keyword}\" 相关的知识库页面"

        import re

        def _extract_text_preview(content: str, max_len: int = 150) -> str:
            """Extract plain text preview from markdown, stripping images/files."""
            if not content:
                return ""
            # Remove images: ![alt](url)
            text = re.sub(r'!\[([^\]]*)\]\([^)]+\)', '', content)
            # Remove file links: [filename](/api/v1/wiki/files/...)
            text = re.sub(r'\[([^\]]+)\]\(/api/v1/wiki/files/[^)]+\)', '', text)
            # Remove other markdown: links, bold, italic, headers
            text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
            text = re.sub(r'[*_#>`\-|]', '', text)
            text = re.sub(r'\n+', ' ', text).strip()
            return (text[:max_len] + "...") if len(text) > max_len else text

        def _extract_images(content: str) -> list[str]:
            """Extract image URLs from markdown content."""
            if not content:
                return []
            return re.findall(r'!\[[^\]]*\]\(([^)]+)\)', content)

        def _extract_files(content: str) -> list[tuple[str, str]]:
            """Extract file links (name, url) from wiki content."""
            if not content:
                return []
            # Match [filename](/api/v1/wiki/files/...) but not images
            return re.findall(r'\[([^\]]+)\]\((/api/v1/wiki/files/[^)]+)\)', content)

        def _format_page_detail(p, idx: int | None = None) -> list[str]:
            """Format a wiki page with text preview + images + files."""
            owner_name = p.owner.display_name or p.owner.username if p.owner else "未知"
            prefix = f"{idx}. " if idx else "- "
            result = [f"{prefix}**{p.title}** _({owner_name})_"]

            text_preview = _extract_text_preview(p.content, 150)
            if text_preview:
                result.append(f"   _{text_preview}_")

            images = _extract_images(p.content)
            if images:
                img_lines = []
                for url in images[:3]:
                    img_lines.append(f"![img]({url})")
                result.append("   " + " ".join(img_lines))
                if len(images) > 3:
                    result.append(f"   _...还有 {len(images) - 3} 张图片_")

            files = _extract_files(p.content)
            # Filter out image urls from files list
            files = [(name, url) for name, url in files if not any(name.lower().endswith(ext) for ext in ('.png','.jpg','.jpeg','.gif','.webp','.svg','.bmp'))]
            if files:
                file_links = [f"[{name}]({url})" for name, url in files[:3]]
                result.append(f"   📎 {' · '.join(file_links)}")
                if len(files) > 3:
                    result.append(f"   _...还有 {len(files) - 3} 个文件_")

            return result

        # Replace local wiki file paths with public URLs for inline display in WeChat Work markdown
        from app.utils.settings import get_frontend_url
        try:
            public_url = await get_frontend_url(self.db)
        except Exception:
            public_url = ""

        def _make_public_url(content: str) -> str:
            """Replace /api/v1/wiki/files/xxx with public URL."""
            if not public_url or not content:
                return content
            import re as _re
            return _re.sub(
                r'\(/api/v1/wiki/files/',
                f'({public_url}/api/v1/wiki/files/',
                content
            )

        lines = [f"🔍 **搜索: {keyword}**\n"]

        if related_pages:
            lines.append("**📎 关联人员知识库:**")
            for p in related_pages[:5]:
                lines.extend(_format_page_detail(p))
            if len(related_pages) > 5:
                lines.append(f"  _...还有 {len(related_pages) - 5} 条_")

        if public_pages:
            lines.append("")
            lines.append("**🌐 公共知识库:** _(回复编号确认采用)_")
            for i, p in enumerate(public_pages[:5], 1):
                lines.extend(_format_page_detail(p, idx=i))
            if len(public_pages) > 5:
                lines.append(f"   _...还有 {len(public_pages) - 5} 条_")

        response = "\n".join(lines)
        # Convert local file paths to public URLs for inline image display
        response = _make_public_url(response)

        return response
