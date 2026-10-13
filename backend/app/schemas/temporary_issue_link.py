from pydantic import BaseModel, Field


class TemporaryIssueLinkCreate(BaseModel):
    expires_in_minutes: int = Field(default=1440, ge=5, le=10080)
class PublicIssueSubmit(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(default="", max_length=50000)
    issue_type: str = Field(default="bug", pattern=r"^(bug|feature)$")
    priority: str = Field(default="medium", pattern=r"^(critical|high|medium|low|trivial)$")
    due_date: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
