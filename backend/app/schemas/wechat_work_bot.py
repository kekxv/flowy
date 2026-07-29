from pydantic import BaseModel, Field, model_validator


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


# ─── Intranet Sources ─────────────────────────────────────────


class IntranetSourceCreate(BaseModel):
    name: str
    url: str
    source_type: str = Field(default="json", pattern="^(json|nginx)$")
    file_ttl_seconds: int = Field(default=3600, ge=60, le=86400)
    auth_username: str = Field(default="", max_length=256)
    auth_password: str = Field(default="", max_length=1024)

    @model_validator(mode="after")
    def validate_basic_auth_pair(self):
        if bool(self.auth_username.strip()) != bool(self.auth_password):
            raise ValueError("Basic Auth username and password must be provided together")
        return self


class IntranetSourceUpdate(BaseModel):
    name: str | None = None
    url: str | None = None
    source_type: str | None = Field(default=None, pattern="^(json|nginx)$")
    file_ttl_seconds: int | None = Field(default=None, ge=60, le=86400)
    auth_username: str | None = Field(default=None, max_length=256)
    auth_password: str | None = Field(default=None, max_length=1024)
    clear_auth: bool = False


class IntranetSourceTestRequest(BaseModel):
    source_id: str | None = Field(default=None, max_length=128)
    url: str
    source_type: str = Field(default="json", pattern="^(json|nginx)$")
    use_basic_auth: bool = False
    auth_username: str = Field(default="", max_length=256)
    auth_password: str = Field(default="", max_length=1024)

    @model_validator(mode="after")
    def validate_test_credentials(self):
        username = self.auth_username.strip()
        if not self.use_basic_auth:
            if username or self.auth_password:
                raise ValueError("Basic Auth credentials require use_basic_auth")
            return self
        if not username:
            raise ValueError("Basic Auth username is required")
        if not self.auth_password and not self.source_id:
            raise ValueError("Basic Auth password is required for a new source")
        return self


class IntranetSourceTestResponse(BaseModel):
    ok: bool
    message: str
    total: int


class IntranetSourceResponse(BaseModel):
    id: str
    name: str
    url: str
    source_type: str
    file_ttl_seconds: int
    auth_username: str = ""
    has_auth: bool = False
    created_at: str
    updated_at: str


class IntranetPreviewResponse(BaseModel):
    files: list[dict]
    total: int


class TestCommandRequest(BaseModel):
    command: str


class TestCommandResponse(BaseModel):
    response: str = ""
    error: str | None = None
