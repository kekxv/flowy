"""Pydantic schemas for Wiki / Knowledge Base."""

from pydantic import BaseModel, Field


class WikiPageResponse(BaseModel):
    id: str
    owner_id: str
    title: str
    slug: str
    content: str
    tags: str
    is_public: bool
    weight: int = 0
    created_at: str
    updated_at: str
    owner_name: str = ""
    owner_display_name: str = ""
    collaborator_ids: list[str] = []

    model_config = {"from_attributes": True}


class WikiPageCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(default="")
    tags: str = Field(default="", max_length=1000)
    is_public: bool = False
    weight: int = Field(default=0, ge=0, le=9999)


class WikiPageUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    content: str | None = None
    tags: str | None = Field(default=None, max_length=1000)
    is_public: bool | None = None
    weight: int | None = Field(default=None, ge=0, le=9999)


class WikiCollaboratorAdd(BaseModel):
    user_id: str = Field(min_length=1)
    permission: str = Field(default="editor", pattern=r"^(editor|viewer)$")


class WikiCollaboratorResponse(BaseModel):
    user_id: str
    username: str
    display_name: str
    permission: str

    model_config = {"from_attributes": True}
