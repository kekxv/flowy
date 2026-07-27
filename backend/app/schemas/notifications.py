from pydantic import BaseModel, Field


class NotificationChannelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    channel_type: str
    config: dict


class NotificationChannelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    config: dict | None = None
    is_active: bool | None = None


class NotificationRuleCreate(BaseModel):
    channel_id: str
    event_type: str
    name: str = Field(default="", max_length=128)
    filters: dict = Field(default_factory=dict)


class NotificationRuleUpdate(BaseModel):
    is_active: bool | None = None
    name: str | None = Field(default=None, max_length=128)
    event_type: str | None = None
    filters: dict | None = None
