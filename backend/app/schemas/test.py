from pydantic import AliasChoices, BaseModel, Field, field_validator


class TestRequestCreate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    objective: str = Field(default="", validation_alias=AliasChoices("objective", "catalog"))
    expected_effect: str = ""
    current_behavior: str = ""
    issue_id: str | None = None


class TestAssignment(BaseModel):
    tester_id: str


class TestTransition(BaseModel):
    status: str
    reason: str = ""


class TestRunCreate(BaseModel):
    status: str = Field(pattern="^(passed|failed)$")
    version: str = Field(min_length=1, max_length=256)
    method: str = Field(min_length=1)
    server_url: str = Field(default="", max_length=1000)
    steps: str = Field(min_length=1)
    result: str = Field(min_length=1)
    report: str = Field(min_length=1)

    @field_validator("version", "method", "steps", "result", "report")
    @classmethod
    def non_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("field is required")
        return value


class TestCollectionCreate(BaseModel):
    expires_in_minutes: int = Field(default=1440, ge=5, le=10080)


class PublicTestSubmit(TestRequestCreate):
    pass
