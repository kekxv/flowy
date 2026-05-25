import httpx

from app.services.notifications.base import NotificationChannel, NotificationEvent


class WeChatWorkChannel(NotificationChannel):
    """WeChat Work (企业微信) group bot webhook."""

    @staticmethod
    def config_schema() -> dict:
        return {
            "type": "object",
            "required": ["webhook_url"],
            "properties": {
                "webhook_url": {
                    "type": "string",
                    "title": "Webhook URL",
                    "description": "企业微信群机器人 Webhook 地址",
                },
                "mentioned_list": {
                    "type": "array",
                    "items": {"type": "string"},
                    "title": "@成员列表",
                    "description": "手机号或 userid，'@all' 表示所有人",
                },
            },
        }

    async def validate_config(self, config: dict) -> bool:
        url = config.get("webhook_url", "")
        if not url:
            return False
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(url, json={"msgtype": "text", "text": {"content": "Flowy 通知测试"}})
                return resp.status_code < 500
        except Exception:
            return False

    async def send(self, event: NotificationEvent, config: dict) -> bool:
        url = config["webhook_url"]
        mentioned = config.get("mentioned_list", [])
        mentioned_text = ""
        if mentioned:
            mentioned_text = " ".join(f"@{m}" for m in mentioned)

        type_labels = {
            "issue.created": "问题创建",
            "issue.updated": "问题更新",
            "issue.commented": "新评论",
            "issue.closed": "问题关闭",
            "milestone.created": "里程碑创建",
            "milestone.published": "里程碑发布",
            "milestone.closed": "里程碑关闭",
            "milestone.reopened": "里程碑重新打开",
            "external_link.updated": "外部关联更新",
            "sync.completed": "同步完成",
            "sync.failed": "同步失败",
            "external.connected": "外部连接添加",
            "external.disconnected": "外部连接移除",
        }
        type_label = type_labels.get(event.event_type, event.event_type)

        ts = event.timestamp[:19].replace("T", " ") if len(event.timestamp) > 19 else event.timestamp

        extra_lines = ""
        flowy_title = event.extra.get("flowy_issue_title")
        if flowy_title:
            extra_lines += f"\n关联问题: {flowy_title}"

        content = f"""## {type_label}: {event.title}
> {event.summary}

操作人: {event.actor_name}
时间: {ts}{extra_lines}

[查看详情]({event.detail_url})
{mentioned_text}"""

        payload = {"msgtype": "markdown", "markdown": {"content": content}}

        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, json=payload)
            data = resp.json()
            if data.get("errcode") != 0:
                raise RuntimeError(f"WeChat Work error: {data.get('errmsg', 'unknown')}")
        return True
