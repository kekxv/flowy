from pydantic import BaseModel, Field


class SoftwareDependencyIn(BaseModel):
    kind: str = "external"  # internal / external / runtime
    name: str = Field(default="", max_length=128)
    target_component_id: str | None = None
    constraint: str = Field(default="", max_length=64)


class SoftwareVersionCreate(BaseModel):
    version: str = Field(min_length=1, max_length=64)
    note: str = Field(default="", max_length=4000)
    artifact_type: str = Field(default="none", pattern="^(file|url|none)$")
    file_name: str = Field(default="", max_length=255)
    file_size: float = 0.0
    download_url: str = Field(default="", max_length=4000)
    published_at: str | None = None
    dependencies: list[SoftwareDependencyIn] = []


class SoftwareVersionUpdate(BaseModel):
    version: str | None = Field(default=None, min_length=1, max_length=64)
    note: str | None = Field(default=None, max_length=4000)
    artifact_type: str | None = Field(default=None, pattern="^(file|url|none)$")
    file_name: str | None = Field(default=None, max_length=255)
    file_size: float | None = None
    download_url: str | None = Field(default=None, max_length=4000)
    published_at: str | None = None
    dependencies: list[SoftwareDependencyIn] | None = None


class SoftwareComponentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    identifier: str = Field(min_length=1, max_length=128)
    category: str = Field(default="other", max_length=32)
    icon_key: str = Field(default="", max_length=16)
    description: str = Field(default="", max_length=2000)


class SoftwareComponentUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=128)
    identifier: str | None = Field(default=None, min_length=1, max_length=128)
    category: str | None = Field(default=None, max_length=32)
    icon_key: str | None = Field(default=None, max_length=16)
    description: str | None = Field(default=None, max_length=2000)
