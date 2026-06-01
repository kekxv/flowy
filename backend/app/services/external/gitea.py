import httpx

from app.services.external.base import (
    ExternalIssueData,
    ExternalProviderClient,
    ExternalRepo,
)


class GiteaClient(ExternalProviderClient):
    def _api_url(self, path: str) -> str:
        base = self.instance_url or "https://gitea.com"
        return f"{base}/api/v1{path}"

    def _headers(self) -> dict:
        return {"Authorization": f"token {self.token}", "Accept": "application/json"}

    async def _request(self, method: str, path: str, **kwargs) -> dict | list:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.request(
                method, self._api_url(path), headers=self._headers(), **kwargs
            )
            resp.raise_for_status()
            return resp.json()

    async def test_connection(self) -> bool:
        try:
            user = await self._request("GET", "/user")
            return "login" in user
        except Exception:
            return False

    async def get_current_username(self) -> str:
        user = await self._request("GET", "/user")
        return user["login"]

    async def list_repos(self) -> list[ExternalRepo]:
        data = await self._request("GET", "/user/repos?limit=100")
        repos = []
        for r in data:
            repos.append(
                ExternalRepo(
                    full_name=r["full_name"],
                    name=r["name"],
                    description=r.get("description", "") or "",
                    private=r.get("private", False),
                    url=r["html_url"],
                )
            )
        return repos

    async def get_issue(self, repo: str, issue_number: int) -> ExternalIssueData:
        data = await self._request("GET", f"/repos/{repo}/issues/{issue_number}")
        return self._parse_issue(data)

    async def list_issues(
        self, repo: str, state: str = "all", since: str | None = None
    ) -> list[ExternalIssueData]:
        params = {"state": state, "limit": "100"}
        if since:
            params["since"] = since
        data = await self._request("GET", f"/repos/{repo}/issues", params=params)
        return [self._parse_issue(i) for i in data]

    async def search_issues(self, repo: str, query: str) -> list[ExternalIssueData]:
        data = await self._request(
            "GET", f"/repos/{repo}/issues", params={"q": query, "state": "all", "limit": "30"}
        )
        return [self._parse_issue(i) for i in data]

    async def create_issue(
        self, repo: str, title: str, body: str = "", labels: list[str] | None = None
    ) -> ExternalIssueData:
        payload = {"title": title, "body": body}
        if labels:
            payload["labels"] = [l for l in labels]
        data = await self._request("POST", f"/repos/{repo}/issues", json=payload)
        return self._parse_issue(data)

    async def update_issue(
        self,
        repo: str,
        issue_number: int,
        title: str | None = None,
        body: str | None = None,
        state: str | None = None,
        labels: list[str] | None = None,
    ) -> ExternalIssueData:
        payload = {}
        if title is not None:
            payload["title"] = title
        if body is not None:
            payload["body"] = body
        if state is not None:
            payload["state"] = state
        if labels is not None:
            payload["labels"] = [l for l in labels]
        data = await self._request("PATCH", f"/repos/{repo}/issues/{issue_number}", json=payload)
        return self._parse_issue(data)

    async def add_comment(self, repo: str, issue_number: int, body: str) -> dict:
        return await self._request(
            "POST",
            f"/repos/{repo}/issues/{issue_number}/comments",
            json={"body": body},
        )

    def _parse_issue(self, data: dict) -> ExternalIssueData:
        labels = [l["name"] for l in (data.get("labels") or [])]
        assignees = [a["login"] for a in (data.get("assignees") or []) if a]
        return ExternalIssueData(
            external_id=str(data["number"]),
            title=data["title"],
            status=data.get("merged_at")
            and "merged"
            or (data.get("pull_request") and data["state"] or data["state"]),
            description=data.get("body", "") or "",
            url=data["html_url"],
            labels=labels,
            assignees=assignees,
            updated_at=data.get("updated_at", ""),
            link_type="pull_request" if data.get("pull_request") else "issue",
        )
