import uuid
import secrets
import logging
from datetime import datetime, timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.crypto import decrypt_token, encrypt_token
from app.database import get_db
from app.dependencies import get_current_user
from app.models.external import ExternalConnection, ExternalIssue, OAuthState
from app.models.issue import issue_assignees
from app.models.settings import AppSetting
from app.models.user import User
from app.schemas.external import (
    ExternalConnectionResponse,
    ExternalIssueSearchResult,
    ExternalRepoResponse,
    LinkExternalIssueRequest,
    PATConnectionRequest,
)
from app.core.dispatcher import dispatch
from app.services import connection_service
from app.services.external import get_client
from app.services.external.base import ExternalRepo
from app.services.notifications.base import NotificationEvent
from app.utils.settings import get_frontend_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/external/connections", tags=["connections"])

OAUTH_CONFIGS = {
    "github": {
        "auth_url": "https://github.com/login/oauth/authorize",
        "token_url": "https://github.com/login/oauth/access_token",
        "client_id": settings.github_client_id,
        "client_secret": settings.github_client_secret,
        "scope": "repo",
    },
    "gitea": {
        "auth_url": "{instance}/login/oauth/authorize",
        "token_url": "{instance}/login/oauth/access_token",
        "client_id": settings.gitea_client_id,
        "client_secret": settings.gitea_client_secret,
    },
}


@router.get("", response_model=list[ExternalConnectionResponse])
async def list_connections(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conns = await connection_service.get_user_connections(db, user.id)
    return [ExternalConnectionResponse.model_validate(c) for c in conns]


@router.post("/oauth/init")
async def oauth_init(data: dict, req: Request, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Generate OAuth authorization URL."""
    provider = data.get("provider", "github")
    instance_url = data.get("instance_url", "").rstrip("/")
    frontend_url = data.get("frontend_url", "").rstrip("/")
    cfg = OAUTH_CONFIGS.get(provider)
    # Fallback to DB-stored OAuth settings
    db_settings = {}
    result = await db.execute(select(AppSetting))
    for s in result.scalars().all():
        db_settings[s.key] = s.value
    cid = db_settings.get(f"{provider}_client_id") or cfg["client_id"]
    csec = db_settings.get(f"{provider}_client_secret") or cfg["client_secret"]
    inst = (db_settings.get(f"{provider}_instance_url") or instance_url).strip().rstrip("/")
    cfg = {**cfg, "client_id": cid, "client_secret": csec, "instance_url": inst}
    if not cfg["client_id"]:
        raise HTTPException(status_code=400, detail=f"OAuth not configured for {provider}")

    state = secrets.token_urlsafe(32)
    # Build backend callback URL
    frontend_url = await get_frontend_url(db)
    backend_callback = f"{frontend_url}/api/v1/external/connections/oauth/callback"

    if provider == "github":
        auth_url = f"{cfg['auth_url']}?client_id={cfg['client_id']}&redirect_uri={backend_callback}&state={state}&scope={cfg['scope']}"
    else:  # gitea
        base = (inst or "https://gitea.com").rstrip("/")
        url_tpl = cfg["auth_url"].replace("{instance}", base)
        auth_url = f"{url_tpl}?client_id={cfg['client_id']}&redirect_uri={backend_callback}&state={state}&response_type=code"

    # Persist state to DB (survives server reload)
    db.add(OAuthState(state=state, provider=provider, instance_url=inst, user_id=user.id, redirect_uri=backend_callback, frontend_url=fe_url))
    await db.commit()
    return {"auth_url": auth_url, "state": state}


async def _exchange_and_save_oauth(provider: str, instance_url: str, user_id: str, code: str, redirect_uri: str, db: AsyncSession):
    """Exchange OAuth code for token and save connection."""
    cfg = OAUTH_CONFIGS.get(provider)
    if not cfg:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    # Fallback to DB-stored settings
    db_settings = {}
    sr = await db.execute(select(AppSetting))
    for s in sr.scalars().all():
        db_settings[s.key] = s.value
    cfg = {**cfg, "client_id": db_settings.get(f"{provider}_client_id") or cfg["client_id"],
           "client_secret": db_settings.get(f"{provider}_client_secret") or cfg["client_secret"]}

    # Exchange code for token
    if provider == "github":
        token_url = cfg["token_url"]
        payload = {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"], "code": code, "redirect_uri": redirect_uri}
        headers = {"Accept": "application/json"}
        verify = True
    else:
        base = (instance_url or "https://gitea.com").rstrip("/")
        token_url = cfg["token_url"].replace("{instance}", base)
        payload = {"client_id": cfg["client_id"], "client_secret": cfg["client_secret"], "code": code, "redirect_uri": redirect_uri, "grant_type": "authorization_code"}
        headers = {"Accept": "application/json"}
        verify = not instance_url

    async with httpx.AsyncClient(timeout=15, verify=verify) as client:
        resp = await client.post(token_url, data=payload, headers=headers)
        if resp.status_code >= 400:
            raise HTTPException(status_code=400, detail=f"Token exchange failed [{resp.status_code}] for {token_url}: {resp.text or '(empty body)'}")
        token_data = resp.json()

    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="No access_token in response")

    # Calculate expiry time
    expires_in = token_data.get("expires_in", 0)
    expires_at = None
    if expires_in:
        expires_at = (datetime.now() + timedelta(seconds=int(expires_in))).isoformat()

    # Get remote username
    ext_client = get_client(provider, access_token, instance_url)
    username = await ext_client.get_current_username()

    # Remove existing connection for same provider+user (re-auth)
    existing = await db.execute(
        select(ExternalConnection).where(
            ExternalConnection.user_id == user_id,
            ExternalConnection.provider == provider,
        )
    )
    for old in existing.scalars().all():
        await db.delete(old)

    conn = ExternalConnection(
        id=str(uuid.uuid4()), user_id=user_id, provider=provider,
        oauth_token=encrypt_token(access_token),
        refresh_token=encrypt_token(token_data.get("refresh_token")) if token_data.get("refresh_token") else None,
        token_expires_at=expires_at,
        instance_url=instance_url, remote_username=username, remote_user_id=username,
    )
    db.add(conn)
    await db.commit()
    await db.refresh(conn)
    # Dispatch notification
    try:
        frontend_url = await get_frontend_url(db)
        await dispatch(db, NotificationEvent(
            event_type="external.connected",
            title=f"External account connected: {conn.provider}",
            summary=f"Connected as {conn.remote_username}",
            detail_url=f"{frontend_url}/profile",
            actor_name=conn.remote_username,
            resource_type="connection",
            resource_id=conn.id,
        ))
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")
    return conn


async def _get_valid_token(conn: ExternalConnection, db: AsyncSession) -> str:
    """Get a valid access token, refreshing if expired."""
    token = decrypt_token(conn.oauth_token or conn.pat_token or "")

    # Check expiry and refresh if needed
    if conn.oauth_token and conn.refresh_token and conn.token_expires_at:
        try:
            expires_at = datetime.fromisoformat(conn.token_expires_at)
            if datetime.now() >= expires_at:
                refresh = decrypt_token(conn.refresh_token)
                cfg = OAUTH_CONFIGS.get(conn.provider, {})
                base = (conn.instance_url or "https://gitea.com").rstrip("/")
                if conn.provider == "gitea":
                    token_url = cfg.get("token_url", "{instance}/login/oauth/access_token").replace("{instance}", base)
                else:
                    token_url = cfg.get("token_url", "https://github.com/login/oauth/access_token")

                # Fallback to DB-stored client credentials
                db_settings = {}
                sr = await db.execute(select(AppSetting))
                for s in sr.scalars().all():
                    db_settings[s.key] = s.value
                cid = db_settings.get(f"{conn.provider}_client_id") or cfg.get("client_id", "")
                csec = db_settings.get(f"{conn.provider}_client_secret") or cfg.get("client_secret", "")

                payload = {"client_id": cid, "client_secret": csec, "refresh_token": refresh, "grant_type": "refresh_token"}
                async with httpx.AsyncClient(timeout=15, verify=not conn.instance_url) as client:
                    resp = await client.post(token_url, data=payload, headers={"Accept": "application/json"})
                    if resp.status_code < 400:
                        data = resp.json()
                        new_token = data.get("access_token")
                        if new_token:
                            conn.oauth_token = encrypt_token(new_token)
                            conn.refresh_token = encrypt_token(data.get("refresh_token")) if data.get("refresh_token") else conn.refresh_token
                            expires_in = data.get("expires_in", 0)
                            if expires_in:
                                conn.token_expires_at = (datetime.now() + timedelta(seconds=int(expires_in))).isoformat()
                            await db.commit()
                            return new_token
        except Exception as e:
            logger.warning(f"Failed to dispatch notification: {e}")

    return token
async def oauth_callback_get(
    code: str = Query(...),
    state: str = Query(...),
    db: AsyncSession = Depends(get_db),
):
    """Handle OAuth provider redirect (GET). Exchanges code, saves connection, redirects to frontend."""
    stored = await db.get(OAuthState, state)
    if not stored:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    try:
        await _exchange_and_save_oauth(
            provider=stored.provider,
            instance_url=stored.instance_url,
            user_id=stored.user_id,
            code=code,
            redirect_uri=stored.redirect_uri,
            db=db,
        )
        await db.delete(stored)
        await db.commit()
        fe = (stored.frontend_url or "http://localhost:5173").rstrip("/")
        return RedirectResponse(url=f"{fe}/#/profile?oauth=ok")
    except HTTPException as e:
        fe = (stored.frontend_url or "http://localhost:5173").rstrip("/")
        return RedirectResponse(url=f"{fe}/#/profile?oauth=error&msg={e.detail}")


@router.post("/oauth/callback", status_code=status.HTTP_201_CREATED)
async def oauth_callback_post(data: dict, db: AsyncSession = Depends(get_db)):
    """Handle OAuth callback from frontend (POST). Exchanges code, saves connection."""
    state = data.get("state", "")
    code = data.get("code", "")
    stored = await db.get(OAuthState, state)
    if not stored:
        raise HTTPException(status_code=400, detail="Invalid or expired state")

    conn = await _exchange_and_save_oauth(
        provider=stored.provider,
        instance_url=stored.instance_url,
        user_id=stored.user_id,
        code=code,
        redirect_uri=stored.redirect_uri,
        db=db,
    )
    await db.delete(stored)
    await db.commit()
    return ExternalConnectionResponse.model_validate(conn)


@router.post("/pat", response_model=ExternalConnectionResponse, status_code=status.HTTP_201_CREATED)
async def connect_via_pat(
    data: PATConnectionRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        conn = await connection_service.create_pat_connection(
            db, user.id, data.provider, data.token, data.instance_url
        )
        return ExternalConnectionResponse.model_validate(conn)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Connection failed: {e}")


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    await connection_service.delete_connection(db, conn)
    try:
        frontend_url = await get_frontend_url(db)
        await dispatch(db, NotificationEvent(
            event_type="external.disconnected",
            title=f"External account removed: {conn.provider}",
            summary=f"Disconnected {conn.remote_username}",
            detail_url=f"{frontend_url}/profile",
            actor_name=user.display_name or user.username,
            resource_type="connection",
            resource_id=conn.id,
        ))
        await db.commit()  # Persist notification logs
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")


@router.post("/{connection_id}/test")
async def test_connection(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    ok = await connection_service.test_connection(db, connection_id)
    return {"ok": ok}


@router.get("/{connection_id}/repos", response_model=list[ExternalRepoResponse])
async def list_repos(
    connection_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    if not conn.pat_token and not conn.oauth_token:
        raise HTTPException(status_code=400, detail="Token not available")
    token = await _get_valid_token(conn, db)
    client = get_client(conn.provider, token, conn.instance_url)
    repos = await client.list_repos()
    return [
        ExternalRepoResponse(full_name=r.full_name, name=r.name, description=r.description, private=r.private, url=r.url)
        for r in repos
    ]


@router.post("/{connection_id}/create-issue")
async def create_external_issue(
    connection_id: str,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    if not conn.pat_token and not conn.oauth_token:
        raise HTTPException(status_code=400, detail="Token not available")
    token = await _get_valid_token(conn, db)
    client = get_client(conn.provider, token, conn.instance_url)
    result = await client.create_issue(
        repo=data["repo"],
        title=data["title"],
        body=data.get("body", ""),
    )
    return {
        "external_id": result.external_id,
        "title": result.title,
        "status": result.status,
        "external_url": result.url,
    }


@router.get("/{connection_id}/issues", response_model=list[ExternalIssueSearchResult])
async def search_external_issues(
    connection_id: str,
    repo: str,
    query: str = "",
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    conn = await db.get(ExternalConnection, connection_id)
    if not conn or conn.user_id != user.id:
        raise HTTPException(status_code=404, detail="Connection not found")
    if not conn.pat_token and not conn.oauth_token:
        raise HTTPException(status_code=400, detail="Token not available")
    token = await _get_valid_token(conn, db)
    client = get_client(conn.provider, token, conn.instance_url)
    if query:
        results = await client.search_issues(repo, query)
    else:
        results = await client.list_issues(repo)
    return [
        ExternalIssueSearchResult(
            external_id=ri.external_id,
            title=ri.title,
            status=ri.status,
            external_url=ri.url,
            labels=ri.labels,
            updated_at=ri.updated_at,
            link_type=ri.link_type,
        )
        for ri in results
    ]


async def _check_issue_perm(issue_id: str, user: User, db: AsyncSession):
    if user.role == "admin":
        return
    r = await db.execute(
        select(issue_assignees.c.role).where(
            issue_assignees.c.issue_id == issue_id,
            issue_assignees.c.user_id == user.id,
            issue_assignees.c.role == "project_lead",
        )
    )
    if r.first() is not None:
        return
    # Check if feature owner
    from app.models.issue import Issue
    issue = await db.get(Issue, issue_id)
    if issue and issue.issue_type == "feature":
        roles = await db.execute(
            select(issue_assignees.c.role).where(
                issue_assignees.c.issue_id == issue_id,
                issue_assignees.c.user_id == user.id,
            )
        )
        if roles.first() is not None:
            return
    raise HTTPException(status_code=403, detail="Only admin, project_lead, or feature owner can manage external links")


# External issue links
@router.get("/issues/{issue_id}/external-links")
async def list_external_links(
    issue_id: str,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ExternalIssue).where(ExternalIssue.issue_id == issue_id)
    )
    links = list(result.scalars().all())
    return [
        {
            "id": l.id,
            "issue_id": l.issue_id,
            "connection_id": l.connection_id,
            "external_id": l.external_id,
            "external_url": l.external_url,
            "external_repo": l.external_repo,
            "title": l.title,
            "status": l.status,
            "link_type": l.link_type,
            "last_synced_at": l.last_synced_at,
            "created_at": l.created_at,
        }
        for l in links
    ]


@router.post("/issues/{issue_id}/external-links", status_code=status.HTTP_201_CREATED)
async def link_external_issue(
    issue_id: str,
    data: LinkExternalIssueRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_issue_perm(issue_id, user, db)
    link = ExternalIssue(
        id=str(uuid.uuid4()),
        issue_id=issue_id,
        connection_id=data.connection_id,
        external_id=data.external_id,
        external_url=data.external_url,
        external_repo=data.external_repo,
        title=data.title,
        status=data.status,
        link_type=getattr(data, "link_type", None) or "issue",
    )
    db.add(link)
    await db.commit()
    await db.refresh(link)
    return {
        "id": link.id,
        "issue_id": link.issue_id,
        "connection_id": link.connection_id,
        "external_id": link.external_id,
        "external_url": link.external_url,
        "external_repo": link.external_repo,
        "title": link.title,
        "status": link.status,
        "link_type": link.link_type,
        "last_synced_at": link.last_synced_at,
        "created_at": link.created_at,
    }


@router.post("/issues/{issue_id}/external-links/{link_id}/refresh")
async def refresh_external_link(
    issue_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_issue_perm(issue_id, user, db)
    link = await db.get(ExternalIssue, link_id)
    if not link or link.issue_id != issue_id:
        raise HTTPException(status_code=404, detail="Link not found")
    conn = await db.get(ExternalConnection, link.connection_id)
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found")

    if not conn.pat_token and not conn.oauth_token:
        raise HTTPException(status_code=400, detail="Token not available")
    token = await _get_valid_token(conn, db)
    client = get_client(conn.provider, token, conn.instance_url)

    # Fetch latest issue data
    try:
        results = await client.search_issues(link.external_repo, link.external_id)
        if results:
            ri = results[0]
            link.title = ri.title
            link.status = ri.status
            link.external_url = ri.url
    except Exception as e:
        logger.warning(f"Failed to dispatch notification: {e}")

    from datetime import datetime
    link.last_synced_at = datetime.now().isoformat()
    await db.commit()
    return {
        "id": link.id, "title": link.title, "status": link.status,
        "external_url": link.external_url, "last_synced_at": link.last_synced_at,
    }


@router.delete("/issues/{issue_id}/external-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
async def unlink_external_issue(
    issue_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await _check_issue_perm(issue_id, user, db)
    link = await db.get(ExternalIssue, link_id)
    if not link or link.issue_id != issue_id:
        raise HTTPException(status_code=404, detail="Link not found")
    await db.delete(link)
    await db.commit()
