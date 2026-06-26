from fastapi import APIRouter

from app.api.v1 import (
    admin,
    auth,
    bot_attachments,
    connections,
    dashboard,
    health,
    issues,
    labels,
    milestones,
    notifications,
    settings_api,
    sync,
    users,
    wechat_work_bot,
)

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(issues.router)
api_router.include_router(labels.router)
api_router.include_router(connections.router)
api_router.include_router(sync.router)
api_router.include_router(users.router)
api_router.include_router(admin.router)
api_router.include_router(milestones.router)
api_router.include_router(dashboard.router)
api_router.include_router(settings_api.router)
api_router.include_router(notifications.router)
api_router.include_router(wechat_work_bot.router)
api_router.include_router(bot_attachments.router)
