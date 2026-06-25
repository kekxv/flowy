from pydantic import BaseModel, Field


class BotConfigResponse(BaseModel):
    bot_id: str = ""
    ai_enabled: bool = False
    auto_reply: bool = True
    is_running: bool = False
    ai_base_url: str = ""
    ai_model: str = ""


class BotConfigUpdate(BaseModel):
    bot_id: str = ""
    secret: str = ""
    ai_enabled: bool = False
    auto_reply: bool = True
    ai_base_url: str = ""
    ai_api_key: str = ""
    ai_model: str = ""


class BotUserCreate(BaseModel):
    wechat_user_id: str
    display_name: str | None = None
    flowy_user_id: str | None = None
    role: str = Field(default="viewer", pattern="^(admin|helper|viewer)$")


class BotUserUpdate(BaseModel):
    display_name: str | None = None
    flowy_user_id: str | None = None
    role: str = Field(pattern="^(admin|helper|viewer)$")


class BotUserResponse(BaseModel):
    id: str
    wechat_user_id: str
    display_name: str | None = None
    flowy_user_id: str | None = None
    role: str
    flowy_user_name: str = ""
    created_at: str = ""


class BotLogResponse(BaseModel):
    id: str
    wechat_user_id: str
    flowy_user_id: str | None = None
    command: str
    args: str | None = None
    response: str | None = None
    status: str
    error: str | None = None
    created_at: str


class BotStatusResponse(BaseModel):
    is_running: bool
    bot_id: str = ""
    uptime_seconds: float = 0


class BotActionResponse(BaseModel):
    ok: bool
    message: str = ""


class BindTokenRequest(BaseModel):
    flowy_user_id: str
    role: str = "viewer"


class BindTokenResponse(BaseModel):
    token: str
    command: str
    expires_in_seconds: int = 600
