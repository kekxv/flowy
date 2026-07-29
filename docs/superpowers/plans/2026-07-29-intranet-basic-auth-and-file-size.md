# Intranet Basic Auth and File Size Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Support securely stored HTTP Basic Auth credentials for intranet file sources and show file sizes in `/file` results and source previews.

**Architecture:** Add nullable username and Fernet-encrypted password columns to `intranet_sources`; expose only username plus a `has_auth` flag through the admin API. Resolve credentials immediately before outbound listing/download requests and pass them as HTTP Basic Auth headers while continuing to reject credentials embedded in URLs. Normalize sizes to integer bytes in the parser, then format them independently in backend bot output and frontend preview UI.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, cryptography/Fernet, httpx, pytest, React 19, TypeScript, Vitest.

## Global Constraints

- Credentials embedded in URLs remain prohibited.
- Passwords are encrypted with the configured persistent `ENCRYPTION_KEY` and are never returned by APIs or written to logs.
- Existing unauthenticated file sources continue to work without data migration.
- HTTP support for administrator-configured RFC1918 sources remains enabled.
- Existing SSRF, same-source path, redirect, and 50 MiB download protections remain unchanged.
- Editing with an empty password preserves the existing encrypted password; disabling authentication removes both stored credential fields.
- File sizes are normalized as non-negative integer bytes; unavailable or invalid sizes remain `None` and display as `未知`.

---

### Task 1: Persist and Safely Expose Source Credentials

**Files:**
- Create: `backend/alembic/versions/e011_intranet_source_basic_auth.py`
- Modify: `backend/app/models/wechat_work_bot.py`
- Modify: `backend/app/schemas/wechat_work_bot.py`
- Modify: `backend/app/api/v1/wechat_work_bot.py`
- Test: `backend/tests/test_wechat_bot_new_features.py`

**Interfaces:**
- Consumes: `encrypt_token(plaintext: str) -> str` and existing admin-only intranet source CRUD routes.
- Produces: nullable model fields `auth_username` and `auth_password_encrypted`; request fields `auth_username`, `auth_password`, `clear_auth`; response fields `auth_username` and `has_auth`.

- [x] **Step 1: Add failing CRUD tests**

Add tests that create a source with `auth_username="reader"` and `auth_password="secret"`, assert the database stores a non-plaintext encrypted password, and assert API responses contain only `auth_username="reader"` and `has_auth=true`. Add update tests proving an empty password preserves the prior ciphertext and `clear_auth=true` removes both credential fields.

- [x] **Step 2: Run CRUD tests and verify RED**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest tests/test_wechat_bot_new_features.py::TestIntranetSourcesCRUD -q`

Expected: FAIL because credential fields are not accepted or persisted.

- [x] **Step 3: Implement model, migration, schemas, and CRUD semantics**

Add nullable `String(256)` username and `Text` encrypted-password columns. On create, require username and password together; on update, preserve ciphertext for an empty password, encrypt any non-empty replacement, and clear both fields only when `clear_auth=true`. Construct responses through one helper so ciphertext cannot accidentally enter response payloads.

```python
auth_username: Mapped[str | None] = mapped_column(String(256), nullable=True)
auth_password_encrypted: Mapped[str | None] = mapped_column(Text, nullable=True)

def _source_response(source: IntranetSource) -> IntranetSourceResponse:
    return IntranetSourceResponse(
        id=source.id,
        name=source.name,
        url=source.url,
        source_type=source.source_type,
        file_ttl_seconds=source.file_ttl_seconds,
        auth_username=source.auth_username or "",
        has_auth=bool(source.auth_username and source.auth_password_encrypted),
        created_at=source.created_at,
        updated_at=source.updated_at,
    )
```

- [x] **Step 4: Run CRUD tests and verify GREEN**

Run the Task 1 Step 2 command and confirm all CRUD tests pass.

### Task 2: Authenticate Outbound Listing and Download Requests

**Files:**
- Create: `backend/app/services/wechat_work_bot/intranet_auth.py`
- Modify: `backend/app/services/wechat_work_bot/intranet_parser.py`
- Modify: `backend/app/services/wechat_work_bot/handlers.py`
- Modify: `backend/app/api/v1/wechat_work_bot.py`
- Test: `backend/tests/test_url_security.py`
- Test: `backend/tests/test_security_regressions.py`

**Interfaces:**
- Produces: `get_source_credentials(source: IntranetSource) -> tuple[str, str] | None` and `parse_source(url: str, source_type: str, auth: tuple[str, str] | None = None) -> list[dict]`.
- Consumes: decrypted credentials in preview, `/file` search, and signed-token download proxy requests.

- [x] **Step 1: Add failing Basic Auth request tests**

Use controlled fake HTTP clients to assert that listing and file-download requests receive an `httpx.BasicAuth` value that resolves to the expected `Authorization: Basic ...` header. Keep a separate test proving unauthenticated sources pass no credentials.

- [x] **Step 2: Run authentication tests and verify RED**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest tests/test_url_security.py tests/test_security_regressions.py -q`

Expected: FAIL because `parse_source` and the download proxy do not load source credentials.

- [x] **Step 3: Implement credential resolution and request wiring**

Decrypt credentials only immediately before use. Pass Basic Auth to parser requests, preview requests, bot searches, and download streaming requests. Never append credentials to URLs or include them in raised error text.

```python
def get_source_credentials(source: IntranetSource) -> tuple[str, str] | None:
    if not source.auth_username or not source.auth_password_encrypted:
        return None
    return source.auth_username, decrypt_token(source.auth_password_encrypted)

auth = get_source_credentials(source)
files = await parse_source(source.url, source.source_type, auth=auth)
```

- [x] **Step 4: Run authentication tests and verify GREEN**

Run the Task 2 Step 2 command and confirm the new request-boundary tests pass.

### Task 3: Parse and Display File Sizes in Bot Results

**Files:**
- Modify: `backend/app/services/wechat_work_bot/intranet_parser.py`
- Modify: `backend/app/services/wechat_work_bot/handlers.py`
- Test: `backend/tests/test_wechat_work_bot.py`

**Interfaces:**
- Produces: parser entries shaped as `{name: str, url: str, mtime: str | None, size: int | None}`.
- Consumes: JSON keys `size`, `file_size`, or `content_length`; Nginx trailing byte/unit values such as `1536`, `1.5K`, `2 MB`.

- [x] **Step 1: Add failing parser and bot-output tests**

Add literal fixtures proving JSON numeric/string sizes and Nginx byte/unit sizes normalize to bytes. Add a `/file` result test asserting `大小：1.5 KB` for `1536` bytes and `大小：未知` when size is absent.

- [x] **Step 2: Run size tests and verify RED**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest tests/test_wechat_work_bot.py -k 'size or file_limit' -q`

Expected: FAIL because parser entries and bot output do not contain sizes.

- [x] **Step 3: Implement byte normalization and formatting**

Add `_parse_size(value) -> int | None` and `_extract_nginx_size(html_text, href) -> int | None`; include size on every parser entry. Format bot sizes using `B`, `KB`, `MB`, `GB`, and `TB`, with one decimal only when needed.

```python
def _parse_size(value) -> int | None:
    if isinstance(value, int) and not isinstance(value, bool):
        return value if value >= 0 else None
    match = re.fullmatch(r"(\d+(?:\.\d+)?)\s*([KMGT]?I?B?)?", str(value).strip(), re.I)
    if not match:
        return None
    units = {"": 1, "B": 1, "K": 1024, "KB": 1024, "KIB": 1024,
             "M": 1024**2, "MB": 1024**2, "MIB": 1024**2,
             "G": 1024**3, "GB": 1024**3, "GIB": 1024**3,
             "T": 1024**4, "TB": 1024**4, "TIB": 1024**4}
    return int(float(match.group(1)) * units[match.group(2).upper()])

lines.append(f"   来源：{m['source_name']} · 大小：{_format_file_size(m.get('size'))}")
```

- [x] **Step 4: Run size tests and verify GREEN**

Run the Task 3 Step 2 command and confirm all new size assertions pass.

### Task 4: Add Credential Controls and Size Preview to the Admin UI

**Files:**
- Create: `frontend/src/utils/intranetSource.ts`
- Create: `frontend/src/utils/intranetSource.test.ts`
- Modify: `frontend/src/pages/WeChatWorkBotPage.tsx`

**Interfaces:**
- Produces: `formatFileSize(size?: number | null) -> string` and `buildIntranetSourcePayload(form, editingHasAuth) -> object`.
- Consumes: API response fields `auth_username`, `has_auth`, and preview entry `size`.

- [x] **Step 1: Add failing frontend utility tests**

Assert exact formatting for `0`, `1024`, `1536`, `1048576`, and missing values. Assert create payloads send username/password only when Basic Auth is enabled, edit payloads omit an empty password to preserve it, and disabling an existing credential emits `clear_auth=true`.

- [x] **Step 2: Run frontend utility tests and verify RED**

Run: `npm test -- src/utils/intranetSource.test.ts`

Expected: FAIL because the utility module does not exist.

- [x] **Step 3: Implement utilities and wire the source form**

Add a Basic Auth toggle, username field, password field with “留空则保留原密码” edit hint, and an authenticated badge in the source list. Use the payload helper for create/update and show formatted file sizes beside names in preview rows.

```typescript
export function buildIntranetSourcePayload(form: IntranetSourceForm, editingHasAuth: boolean) {
  const payload = { name: form.name, url: form.url, source_type: form.source_type,
    file_ttl_seconds: form.file_ttl_seconds }
  if (form.use_basic_auth) return { ...payload, auth_username: form.auth_username,
    ...(form.auth_password ? { auth_password: form.auth_password } : {}) }
  return editingHasAuth ? { ...payload, clear_auth: true } : payload
}
```

- [x] **Step 4: Run frontend tests and verify GREEN**

Run the Task 4 Step 2 command and confirm all utility tests pass.

### Task 5: Full Verification and Delivery

**Files:**
- Verify all files changed in Tasks 1–4.

**Interfaces:**
- Consumes: the final worktree commit.
- Produces: a verified, fast-forwardable branch with no uncommitted files.

- [x] **Step 1: Verify the migration graph and upgrade**

Run `alembic heads` and upgrade a temporary SQLite database to `head`; confirm `intranet_sources` contains nullable `auth_username` and `auth_password_encrypted` columns.

- [x] **Step 2: Run full backend verification**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest && .venv/bin/ruff check .`

- [x] **Step 3: Run full frontend verification**

Run: `npm test && npm run build && npm run lint`

- [x] **Step 4: Review secrets and diff hygiene**

Run `git diff --check`; inspect the API response construction and logs to confirm no password or encrypted ciphertext is returned or logged.

- [x] **Step 5: Commit and fast-forward main**

Commit with `feat: support authenticated intranet file sources`, fast-forward `main`, then remove the worktree and temporary branch.
