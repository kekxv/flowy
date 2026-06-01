from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class ExternalIssueData:
    external_id: str
    title: str
    status: str
    description: str
    url: str
    labels: list[str] = field(default_factory=list)
    assignees: list[str] = field(default_factory=list)
    updated_at: str = ""
    link_type: str = "issue"  # "issue" or "pull_request"


@dataclass
class ExternalRepo:
    full_name: str
    name: str
    description: str
    private: bool
    url: str


class ExternalProviderClient(ABC):
    """Abstract base for external issue provider clients (GitHub, Gitea, etc.)"""

    def __init__(self, token: str, instance_url: str = ""):
        self.token = token
        self.instance_url = instance_url.rstrip("/") if instance_url else ""

    @abstractmethod
    async def test_connection(self) -> bool:
        """Verify the token is valid by fetching current user info."""
        ...

    @abstractmethod
    async def get_current_username(self) -> str:
        """Return the authenticated user's username."""
        ...

    @abstractmethod
    async def list_repos(self) -> list[ExternalRepo]:
        """List repos accessible to this credential."""
        ...

    @abstractmethod
    async def get_issue(self, repo: str, issue_number: int) -> ExternalIssueData:
        """Fetch a single issue from the provider."""
        ...

    @abstractmethod
    async def list_issues(
        self, repo: str, state: str = "open", since: str | None = None
    ) -> list[ExternalIssueData]:
        """List issues in a repository."""
        ...

    @abstractmethod
    async def search_issues(self, repo: str, query: str) -> list[ExternalIssueData]:
        """Search issues by query string."""
        ...

    @abstractmethod
    async def create_issue(
        self, repo: str, title: str, body: str = "", labels: list[str] | None = None
    ) -> ExternalIssueData:
        """Create an issue on the external platform."""
        ...

    @abstractmethod
    async def update_issue(
        self,
        repo: str,
        issue_number: int,
        title: str | None = None,
        body: str | None = None,
        state: str | None = None,
        labels: list[str] | None = None,
    ) -> ExternalIssueData:
        """Update an issue on the external platform."""
        ...

    @abstractmethod
    async def add_comment(self, repo: str, issue_number: int, body: str) -> dict:
        """Add a comment to an external issue."""
        ...
