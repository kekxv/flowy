FLOWY_TO_GITHUB = {
    "open": "open",
    "in_progress": "open",
    "resolved": "closed",
    "closed": "closed",
    "cancelled": "closed",
}

FLOWY_TO_GITEA = FLOWY_TO_GITHUB

GITHUB_TO_FLOWY = {
    "open": "open",
    "closed": "closed",
}

GITEA_TO_FLOWY = GITHUB_TO_FLOWY


def flowy_status_to_external(status: str, provider: str) -> str:
    if provider == "github":
        return FLOWY_TO_GITHUB.get(status, "open")
    if provider == "gitea":
        return FLOWY_TO_GITEA.get(status, "open")
    return status


def external_status_to_flowy(status: str, provider: str) -> str:
    if provider == "github":
        return GITHUB_TO_FLOWY.get(status, "open")
    if provider == "gitea":
        return GITEA_TO_FLOWY.get(status, "open")
    return status
