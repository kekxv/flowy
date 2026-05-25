from pydantic import BaseModel, Field

from app.schemas.auth import UserResponse


class LabelResponse(BaseModel):
    id: str
    name: str
    color: str
    description: str
    created_at: str

    model_config = {"from_attributes": True}


class LabelCreate(BaseModel):
    name: str = Field(min_length=1, max_length=64)
    color: str = Field(default="#808080", pattern=r"^#[0-9a-fA-F]{6}$")
    description: str = Field(default="", max_length=256)


class LabelUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=64)
    color: str | None = Field(default=None, pattern=r"^#[0-9a-fA-F]{6}$")
    description: str | None = Field(default=None, max_length=256)


class CommentResponse(BaseModel):
    id: str
    issue_id: str
    author: UserResponse
    body: str
    created_at: str
    updated_at: str

    model_config = {"from_attributes": True}


class CommentCreate(BaseModel):
    body: str = Field(min_length=1)


class CommentUpdate(BaseModel):
    body: str = Field(min_length=1)


class ExternalLinkResponse(BaseModel):
    id: str
    issue_id: str
    connection_id: str
    external_id: str
    external_url: str
    external_repo: str
    title: str | None
    status: str | None
    last_synced_at: str | None
    created_at: str

    model_config = {"from_attributes": True}


class AssigneeResponse(BaseModel):
    id: str
    username: str
    email: str = ""
    display_name: str = ""
    role: str = "member"
    avatar_url: str = ""


class IssueResponse(BaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    reporter: UserResponse
    assignees: list[AssigneeResponse] = []
    milestone_ids: list[str] = []
    labels: list[LabelResponse] = []
    created_at: str
    updated_at: str
    closed_at: str | None

    model_config = {"from_attributes": True}


class IssueDetailResponse(IssueResponse):
    comments: list[CommentResponse] = []
    external_links: list[ExternalLinkResponse] = []


class AssigneeInput(BaseModel):
    user_id: str
    role: str = "member"


class IssueCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(default="")
    priority: str = Field(default="medium", pattern=r"^(critical|high|medium|low|trivial)$")
    assignees: list[AssigneeInput] = Field(default_factory=list)
    label_ids: list[str] = Field(default_factory=list)
    milestone_ids: list[str] = Field(default_factory=list)


class IssueUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = None
    status: str | None = Field(default=None, pattern=r"^(open|in_progress|resolved|closed|cancelled)$")
    priority: str | None = Field(default=None, pattern=r"^(critical|high|medium|low|trivial)$")
    assignees: list[AssigneeInput] | None = None
    label_ids: list[str] | None = None
    milestone_ids: list[str] | None = None


class IssueFilter:
    def __init__(
        self,
        status: str | None = None,
        priority: str | None = None,
        assignee_id: str | None = None,
        reporter_id: str | None = None,
        label_id: str | None = None,
        q: str | None = None,
    ):
        self.statuses = status.split(",") if status else None
        self.priorities = priority.split(",") if priority else None
        self.assignee_id = assignee_id
        self.reporter_id = reporter_id
        self.label_id = label_id
        self.q = q


class ExternalLinkCreate(BaseModel):
    connection_id: str
    external_repo: str
    external_id: str
    external_url: str
    title: str | None = None
    status: str | None = None
