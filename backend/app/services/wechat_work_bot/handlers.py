"""Command handlers for WeChat Work bot."""

import io
import json
import logging
import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.issue import Comment, Issue, Label, issue_assignees, issue_labels_table
from app.models.tracking import Milestone
from app.models.user import User
from app.models.wechat_work_bot import WeChatWorkBotUser
from app.services.wechat_work_bot.bind_token import verify_bind_token

logger = logging.getLogger("uvicorn")


class CommandHandlers:
    """Handles all bot commands. Each handler returns a markdown string."""

    def __init__(self, db: AsyncSession, bot_user: WeChatWorkBotUser | None = None, wechat_user_id: str = ""):
        self.db = db
        self.bot_user = bot_user
        self.wechat_user_id = wechat_user_id

    # ─── General ──────────────────────────────────────────────

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

    async def handle_help(self, args: list[str], quote: dict, frame: dict = None) -> str:
        chattype = quote.get("chattype", "single")
        chat_hint = "💬 群聊模式" if chattype == "group" else "💬 私聊模式"

        return f"""##  Flowy 机器人指令
> {chat_hint}

### 🔍 查询类
| 指令 | 说明 |
| --- | --- |
| `/list` `/列表` [status] | 问题列表 |
| `/stats` `/统计` | 问题统计 |

### ✏️ 操作类
| 指令 | 说明 |
| --- | --- |
| `/create` `/创建` [bug|feature] <标题> | 创建问题 |
| `/update` `/修改` <id> <字段> <值> | 更新问题 |
| `/close` `/关闭` <id> [原因] | 关闭问题 |
| `/assign` `/指派` <id> <用户名> | 指派问题 |
| `/priority` `/优先级` <id> <级别> | 调整优先级 |
| `/comment` `/评论` <id> [内容] | 评论问题 |

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

        my_issues = [i for i in all_issues if i.id in assigned_set]
        other_issues = [i for i in all_issues if i.id not in assigned_set]

        status_text = {
            "open": "[待处理]", "proposed": "[提议]", "in_progress": "[进行中]",
            "accepted": "[已接受]", "resolved": "[已解决]", "closed": "[已关闭]",
        }
        priority_text = {
            "critical": "🔴紧急", "high": "🟠高", "medium": "中", "low": "低",
        }

        def format_row(issue):
            now = dt.now()
            created = dt.fromisoformat(issue.created_at[:19])
            hours = int((now - created).total_seconds() / 3600)
            if hours < 1:
                duration = f"{int((now - created).total_seconds() / 60)}分"
            elif hours < 24:
                duration = f"{hours}时"
            else:
                duration = f"{hours // 24}天"
            st = status_text.get(issue.status, f"[{issue.status}]")
            pt = priority_text.get(issue.priority, issue.priority)
            title = issue.title[:25] + ".." if len(issue.title) > 25 else issue.title
            return f"| {st} | **#{issue.id[:8]}** {title} | {pt} | {duration} |"

        lines = []

        if my_issues:
            lines.append(f"### 📌 我的问题 ({len(my_issues)})")
            lines.append("| 状态 | 标题 | 优先级 | 时长 |")
            lines.append("| --- | --- | --- | --- |")
            for issue in my_issues:
                lines.append(format_row(issue))
            lines.append("")

        if other_issues or not my_issues:
            title = f"### 📋 所有问题 ({len(other_issues)})" if my_issues else f"### 📋 问题列表 ({len(all_issues)})"
            lines.append(title)
            lines.append("| 状态 | 标题 | 优先级 | 时长 |")
            lines.append("| --- | --- | --- | --- |")
            for issue in (other_issues if my_issues else all_issues):
                lines.append(format_row(issue))

        scope = "全部" if show_all else f"近{days_limit}天"
        if len(all_issues) == 50:
            lines.append(f"> _仅显示最近 50 条 · {scope}_")

        return "\n".join(lines)
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
            "critical": "紧急", "high": "高", "medium": "中", "low": "低", "trivial": "低",
        }

        now_str = dt.now().strftime("%H:%M")
        scope = f"近{days_limit}天" if not show_all else "全部"

        lines = [
            "### 📊 问题统计",
            f"> {now_str} · {scope} · 共 **{total}** 个",
            "",
            "**按状态:**",
            "| 状态 | 数量 | 占比 | 进度 |",
            "| --- | ---: | ---: | --- |",
        ]

        for status, count in sorted(status_counts.items(), key=lambda x: -x[1]):
            label = status_text.get(status, status)
            pct = int(count / max(total, 1) * 100)
            bar = "■" * min(pct // 10, 10) + "□" * (10 - min(pct // 10, 10))
            lines.append(f"| {label} | `{count}` | {pct}% | {bar} |")

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
            return "❌ 用法: `/create [bug|feature] <标题>`"

        # First arg is optional type, rest is title
        issue_type = "bug"  # default
        if args[0].lower() in ("bug", "feature"):
            issue_type = args[0].lower()
            args = args[1:]

        if not args:
            return "❌ 用法: `/create [bug|feature] <标题>`"

        title = " ".join(args)
        description = quote.get("multiline_body", "") or quote.get("quoted_content", "")

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
            self.db.execute(issue_labels_table.insert().values(
                issue_id=issue.id, label_id=label_obj.id
            ))

        await self.db.commit()

        return f"✅ 已创建{('Bug' if issue_type == 'bug' else '功能需求')}: **#{issue.id[:8]}** {title}"


    async def handle_update(self, args: list[str], quote: dict, frame: dict = None) -> str:
        issue_id = None

        # Try to get issue ID from args or quoted content
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])

        if not issue_id or len(args) < 2:
            return "❌ 用法: `/update <id> <field> <value>` 或引用包含 #ID 的消息"

        # Find issue by prefix match
        query = select(Issue).where(Issue.id.startswith(issue_id))
        result = await self.db.execute(query)
        issue = result.scalar_one_or_none()

        if not issue:
            return f"❌ 找不到问题 #{issue_id}"

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

        if not issue_id:
            return "❌ 用法: `/close <id> [原因]` 或引用包含 #ID 的消息"

        query = select(Issue).where(Issue.id.startswith(issue_id))
        result = await self.db.execute(query)
        issue = result.scalar_one_or_none()

        if not issue:
            return f"❌ 找不到问题 #{issue_id}"

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
            return " 用法: `/assign <id> <用户名>` 或 @某人后发送 /assign"

        return await self._complete_assign(issue_id, assignee_name)

    async def _complete_assign(self, issue_id: str, assignee_name: str) -> str:
        """Complete the assignment after user selects from list.

        Lookup order:
        1. Check if assignee_name is a WeChat Work user ID in bot users table -> get flowy_user_id
        2. Try matching by Flowy username/display_name
        3. Treat as external WeChat Work user
        """
        query = select(Issue).where(Issue.id.startswith(issue_id))
        result = await self.db.execute(query)
        issue = result.scalar_one_or_none()

        if not issue:
            return f" 找不到问题 #{issue_id}"

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

        # Get issue ID from args or quoted content
        if args and args[0].startswith("#"):
            issue_id = args[0][1:]
            args = args[1:]
        elif args and args[0].isdigit():
            issue_id = args[0]
            args = args[1:]
        elif quote.get("extracted_issue_ids"):
            issue_id = str(quote["extracted_issue_ids"][0])

        if not issue_id:
            return " 用法: `/comment <id> [内容]` 或引用问题消息后发送 /comment"

        # Find the issue
        query = select(Issue).where(Issue.id.startswith(issue_id))
        result = await self.db.execute(query)
        issue = result.scalar_one_or_none()
        if not issue:
            return f" 找不到问题 #{issue_id}"

        # Build comment body
        body_parts = []

        # Text from args
        if args:
            body_parts.append(" ".join(args))

        # Quoted text content
        if quote.get("quoted_content"):
            body_parts.append(f"> {quote['quoted_content']}")

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

        if not issue_id or not args:
            return " 用法: `/priority <id> <紧急|高|中|低|trivial>`"

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
            return " 优先级必须是：紧急/高/中/低/trivial"

        query = select(Issue).where(Issue.id.startswith(issue_id))
        result = await self.db.execute(query)
        issue = result.scalar_one_or_none()
        if not issue:
            return f" 找不到问题 #{issue_id}"

        old_priority = issue.priority
        issue.priority = new_priority
        issue.updated_at = dt.now().isoformat()
        await self.db.commit()

        priority_text = {"critical": "紧急", "high": "高", "medium": "中", "low": "低", "trivial": "低"}
        return f" 已将 #{issue.id[:8]} 优先级从 {priority_text.get(old_priority, old_priority)} 改为 {priority_text.get(new_priority, new_priority)}"

    # ─── Milestone ────────────────────────────────────────────

    async def handle_milestone(self, args: list[str], quote: dict, frame: dict = None) -> str:
        if not args:
            return "❌ 用法: `/milestone <create|list|close|stats> [参数]`"

        subcmd = args[0].lower()
        sub_args = args[1:]

        if subcmd == "list":
            query = select(Milestone).order_by(Milestone.created_at.desc())
            result = await self.db.execute(query)
            milestones = result.scalars().all()

            if not milestones:
                return "📭 暂无里程碑"

            lines = ["## 🏁 里程碑列表\n"]
            status_emoji = {"open": "🟢", "published": "🔵", "closed": "⚫"}
            for ms in milestones:
                emoji = status_emoji.get(ms.status, "⚪")
                due = f" (截止: {ms.due_date})" if ms.due_date else ""
                lines.append(f"{emoji} **{ms.name}**{due} — {ms.status}")
            return "\n".join(lines)

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
                return "❌ 用法: `/milestone stats <id>`"
            ms_id = sub_args[0]
            query = select(Milestone).where(Milestone.id.startswith(ms_id))
            result = await self.db.execute(query)
            ms = result.scalar_one_or_none()
            if not ms:
                return f"❌ 找不到里程碑 {ms_id}"

            # Count issues linked to this milestone
            from app.models.issue import issue_milestones

            total_q = (
                select(func.count(issue_milestones.c.issue_id))
                .where(issue_milestones.c.milestone_id == ms.id)
            )
            total = (await self.db.execute(total_q)).scalar() or 0

            return f"## 🏁 {ms.name}\n状态: {ms.status}\n关联问题数: {total}"

        return f"❌ 未知子命令: {subcmd}"

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
