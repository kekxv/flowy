from app.services.external.base import ExternalProviderClient
from app.services.external.github import GitHubClient
from app.services.external.gitea import GiteaClient

PROVIDERS: dict[str, type[ExternalProviderClient]] = {
    "github": GitHubClient,
    "gitea": GiteaClient,
}


def get_client(provider: str, token: str, instance_url: str = "") -> ExternalProviderClient:
    cls = PROVIDERS.get(provider)
    if not cls:
        raise ValueError(f"Unknown provider: {provider}")
    return cls(token=token, instance_url=instance_url)
