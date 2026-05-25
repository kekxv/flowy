from pydantic import BaseModel, Field


class PATConnectionRequest(BaseModel):
    provider: str = Field(pattern=r"^(github|gitea)$")
    token: str = Field(min_length=1)
    instance_url: str = Field(default="", max_length=256)


class OAuthInitRequest(BaseModel):
    provider: str = Field(pattern=r"^(github|gitea)$")
    redirect_uri: str = Field(default="", max_length=512)


class ExternalConnectionResponse(BaseModel):
    id: str
    provider: str
    instance_url: str
    remote_username: str
    is_active: bool
    last_synced_at: str | None
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class ExternalRepoResponse(BaseModel):
    full_name: str
    name: str
    description: str
    private: bool
    url: str


class ExternalIssueSearchResult(BaseModel):
    external_id: str
    title: str
    status: str
    external_url: str
    labels: list[str]
    updated_at: str
    link_type: str = "issue"


class LinkExternalIssueRequest(BaseModel):
    connection_id: str
    external_repo: str
    external_id: str
    external_url: str
    title: str | None = None
    status: str | None = None
    link_type: str = "issue"
