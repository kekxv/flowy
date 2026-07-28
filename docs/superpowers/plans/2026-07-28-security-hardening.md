# Flowy Security Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the confirmed privilege-escalation, cross-user access, SSRF, intranet proxy, secret-disclosure, and dependency vulnerabilities while continuing to support trusted intranet HTTP endpoints.

**Architecture:** Authorization decisions move to explicit server-side checks and scoped query helpers. Outbound URLs use structural validation; HTTP remains supported, ordinary users cannot choose arbitrary server-side destinations, and trusted administrator-configured intranet sources remain usable. Signed download capabilities use mandatory non-default secrets, full HMAC signatures, canonical source containment, and no unchecked redirects.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, httpx, pytest, React/TypeScript, npm, uv.

## Global Constraints

- Preserve support for both `http://` and `https://` internal services.
- Do not require TLS for administrator-configured intranet sources or the configured Gitea instance.
- Block untrusted users from choosing arbitrary server-side network destinations.
- Add a failing regression test before each production-code behavior change.
- Do not create Git commits unless the user explicitly requests them.

---

### Task 1: Registration, Settings, and Secret Bootstrap

**Files:**
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/app/api/v1/settings_api.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/main.py`
- Modify: `entrypoint.sh`
- Test: `backend/tests/test_api_auth.py`
- Test: `backend/tests/test_security_regressions.py`

**Interfaces:**
- Produces: `Settings.validate_security_secrets() -> None`; public registration creates `member` after bootstrap; settings reads require admin and mask secrets.

- [ ] **Step 1: Write failing registration and settings tests**

```python
async def test_open_registration_creates_member(client, enabled_registration):
    response = await client.post("/api/v1/auth/register", json=SECOND_USER)
    assert response.status_code == 201
    assert response.json()["role"] == "member"

async def test_member_cannot_read_system_settings(member_client):
    response = await member_client.get("/api/v1/system/settings")
    assert response.status_code == 403
```

- [ ] **Step 2: Run the focused tests and confirm they fail with admin creation and HTTP 200**

Run: `pytest backend/tests/test_security_regressions.py -k 'registration or settings' -q`

- [ ] **Step 3: Implement conditional bootstrap role, admin-only masked settings, and startup secret validation**

```python
role = "admin" if user_count == 0 else "member"

SAFE_SETTING_KEYS = {"frontend_url", "github_client_id", "gitea_client_id", "gitea_instance_url", "registration_enabled"}
```

Reject empty/default JWT and application signing secrets at application startup and in `entrypoint.sh`; never print a generated encryption key.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pytest backend/tests/test_api_auth.py backend/tests/test_security_regressions.py -k 'registration or settings or secret' -q`

### Task 2: Issue and External-Connection Authorization

**Files:**
- Modify: `backend/app/api/v1/issues.py`
- Modify: `backend/app/schemas/issue.py`
- Modify: `backend/app/api/v1/connections.py`
- Modify: `backend/app/services/sync_service.py`
- Modify: `backend/app/api/v1/sync.py`
- Test: `backend/tests/test_security_regressions.py`

**Interfaces:**
- Produces: `_require_issue_manager(...)`; assignee roles are enumerated; external links require connection ownership; `sync_connection(connection_id)` scopes manual sync.

- [ ] **Step 1: Write failing cross-user authorization tests**

```python
async def test_member_cannot_self_assign_project_lead_on_foreign_issue(member_client, foreign_issue):
    response = await member_client.put(f"/api/v1/issues/{foreign_issue.id}", json={"assignees": [{"user_id": MEMBER_ID, "role": "project_lead"}]})
    assert response.status_code == 403

async def test_external_link_rejects_another_users_connection(lead_client, foreign_connection):
    response = await lead_client.post(LINK_URL, json={**LINK_BODY, "connection_id": foreign_connection.id})
    assert response.status_code == 404
```

- [ ] **Step 2: Run the focused tests and confirm the unauthorized operations currently succeed**

Run: `pytest backend/tests/test_security_regressions.py -k 'assignee or external_connection or sync' -q`

- [ ] **Step 3: Implement server-derived authorization and ownership constraints**

Only admins/current issue managers may replace assignees or milestones. A reporter may retain the documented status-only transition. Validate `AssigneeInput.role` against the supported role set. Require connection ownership on link create/refresh/delete and scope manual synchronization to the requested owned connection.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pytest backend/tests/test_security_regressions.py -k 'assignee or external_connection or sync' -q`

### Task 3: HTTP-Compatible Outbound and Intranet Proxy Security

**Files:**
- Create: `backend/app/core/url_security.py`
- Modify: `backend/app/services/notifications/webhook.py`
- Modify: `backend/app/services/notifications/wechat_work.py`
- Modify: `backend/app/api/v1/notifications.py`
- Modify: `backend/app/services/connection_service.py`
- Modify: `backend/app/api/v1/connections.py`
- Modify: `backend/app/services/wechat_work_bot/intranet_parser.py`
- Modify: `backend/app/api/v1/wechat_work_bot.py`
- Modify: `backend/app/services/wechat_work_bot/file_token.py`
- Test: `backend/tests/test_url_security.py`
- Test: `backend/tests/test_security_regressions.py`

**Interfaces:**
- Produces: `validate_http_url(url, *, allow_private, allowed_hosts=()) -> str`; `url_belongs_to_source(file_url, source_url) -> bool`; full-length constant-time HMAC tokens.

- [ ] **Step 1: Write failing URL and proxy tests**

```python
@pytest.mark.parametrize("url", ["file:///etc/passwd", "http://127.0.0.1/x", "http://169.254.169.254/latest/meta-data"])
def test_untrusted_outbound_url_is_rejected(url):
    with pytest.raises(ValueError):
        validate_http_url(url, allow_private=False)

def test_admin_configured_private_http_is_allowed():
    assert validate_http_url("http://10.20.0.8/hooks", allow_private=True) == "http://10.20.0.8/hooks"

def test_parent_path_is_outside_source():
    assert not url_belongs_to_source("http://files.local/base/../secret", "http://files.local/base")
```

- [ ] **Step 2: Run the URL/proxy tests and confirm missing validation and containment failures**

Run: `pytest backend/tests/test_url_security.py backend/tests/test_security_regressions.py -k 'ssrf or outbound or intranet or token' -q`

- [ ] **Step 3: Implement structural validation while retaining HTTP**

Accept only HTTP(S), reject credentials/fragments and dangerous loopback/link-local/metadata destinations for all callers, and reject private destinations for untrusted callers. Restrict notification destination management to admins. Restrict user Gitea connections to the administrator-configured instance. Canonicalize intranet paths, require same origin, disable redirects, cap downloaded bytes, and sign tokens with full HMAC plus constant-time comparison.

- [ ] **Step 4: Run focused tests and confirm HTTP intranet tests and blocking tests both pass**

Run: `pytest backend/tests/test_url_security.py backend/tests/test_security_regressions.py -k 'ssrf or outbound or intranet or token' -q`

### Task 4: Wiki, Attachment, Project-Role, and Notification Scoping

**Files:**
- Modify: `backend/app/services/wiki_service.py`
- Modify: `backend/app/api/v1/wiki.py`
- Modify: `backend/app/api/v1/bot_attachments.py`
- Modify: `backend/app/api/v1/auth.py`
- Modify: `backend/app/api/v1/notifications.py`
- Test: `backend/tests/test_security_regressions.py`

**Interfaces:**
- Produces: viewer collaborators cannot edit; attachment capability names use full UUID entropy; self project-role writes are rejected/validated; rules and logs are scoped to their owners.

- [ ] **Step 1: Write failing scope and permission tests**

```python
async def test_viewer_collaborator_cannot_edit(viewer_client, private_page):
    response = await viewer_client.put(f"/api/v1/wiki/{private_page.id}", json={"title": "changed"})
    assert response.status_code == 403

async def test_notification_logs_only_include_owned_channels(member_client, foreign_log):
    response = await member_client.get("/api/v1/notifications/logs")
    assert foreign_log.id not in {row["id"] for row in response.json()["data"]}
```

- [ ] **Step 2: Run the focused tests and confirm viewer edits and cross-user log reads currently succeed**

Run: `pytest backend/tests/test_security_regressions.py -k 'wiki or attachment or project_role or notification' -q`

- [ ] **Step 3: Implement association-permission checks and owner-scoped notification queries**

Read the collaborator permission from `wiki_collaborators`; require `editor` for updates. Replace 48-bit attachment names with full UUID names and preserve realpath checks. Make project-role changes admin-managed and validate allowed values. Verify notification channel ownership on rule creation and join logs through owned channels.

- [ ] **Step 4: Run focused tests and confirm they pass**

Run: `pytest backend/tests/test_security_regressions.py -k 'wiki or attachment or project_role or notification' -q`

### Task 5: Dependency Updates and Full Verification

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `backend/pyproject.toml`
- Modify: `backend/uv.lock`

**Interfaces:**
- Produces: lockfiles resolve patched releases where available without changing application APIs.

- [ ] **Step 1: Capture the failing audit baseline**

Run: `npm audit --package-lock-only --omit=dev`

Run: `uv export --project backend --frozen --no-dev --format requirements-txt | uvx pip-audit -r /dev/stdin`

- [ ] **Step 2: Upgrade vulnerable dependency constraints and regenerate lockfiles**

Upgrade Axios to at least `1.18.0`, React Router to a release fixing applicable client advisories, Vite/PostCSS to patched releases, cryptography to at least `48.0.1`, Pillow to at least `12.3.0`, pydantic-settings to at least `2.14.2`, python-multipart to at least `0.0.31`, and FastAPI/Starlette to a compatible patched pair. Remove or replace the `python-jose` ECDSA dependency if no fixed ECDSA release exists.

- [ ] **Step 3: Run backend tests, frontend tests/build/lint, and both audits**

Run: `pytest -p no:cacheprovider backend/tests -q`

Run: `npm test && npm run build && npm run lint`

Run: `npm audit --package-lock-only --omit=dev`

Run: `uv export --project backend --frozen --no-dev --format requirements-txt | uvx pip-audit -r /dev/stdin`

- [ ] **Step 4: Review the final diff and verify no unrelated files changed**

Run: `git status --short && git diff --check && git diff --stat`
