# 一次性临时问题链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许登录用户创建一个有时限、只能提交一次的公开问题填写链接，并让匿名填写者提交标题、描述、时间、类型、优先级以及受限附件。

**Architecture:** 后端新增临时链接表，数据库只保存随机令牌的 SHA-256 摘要；创建者必须登录，公开读取/上传/提交只接受令牌。提交时在事务中锁定并原子标记令牌，使用创建者作为 reporter，并以 `member` 角色将问题分配给创建者，避免匿名用户选择任意用户或提升权限。前端新增登录后的链接管理页和无需登录的填写页。

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, React 19, React Router, Axios, Vitest/pytest。

**Spec:** User request in conversation (一次性临时问题需求填写链接，支持图片/文件、时间、类型、优先级，过期或提交后失效，防滥用和越权)。

## Global Constraints

- 令牌只保存 SHA-256 摘要，原始令牌仅在创建响应和复制链接时出现。
- 有效期限制为 5 分钟至 7 天，默认 24 小时；每个创建者最多 20 个未过期链接。
- 公开接口不可读取用户、项目、标签、里程碑或任意问题数据。
- 提交必须在数据库事务内条件更新 `used_at IS NULL AND expires_at > now`，失败返回 410。
- 匿名附件沿用配置的上传大小上限，单链接最多 5 个文件，拒绝可执行文件扩展名。

---

### Task 1: 临时链接模型、迁移与安全服务

**Files:**
- Create: `backend/app/models/temporary_issue_link.py`
- Create: `backend/alembic/versions/e015_temporary_issue_links.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/app/services/temporary_issue_link_service.py`
- Test: `backend/tests/test_temporary_issue_link_service.py`

**Interfaces:**
- `hash_link_token(token: str) -> str`
- `create_raw_token() -> str`
- `TemporaryIssueLinkService.create(db, creator_id, expires_in_minutes) -> tuple[TemporaryIssueLink, str]`
- `TemporaryIssueLinkService.get_active(db, raw_token) -> TemporaryIssueLink | None`
- `TemporaryIssueLinkService.consume_and_create_issue(db, raw_token, data) -> Issue`

- [ ] **Step 1: Write failing service tests** covering token hashing, minimum/maximum expiry validation, active lookup expiry, and single-use consumption.
- [ ] **Step 2: Run `backend/.venv/bin/pytest tests/test_temporary_issue_link_service.py -q` and verify missing module/API failures.**
- [ ] **Step 3: Implement model/service and migration.** Use a 64-character token hash unique index, creator FK, `expires_at`, `used_at`, `issue_id`, `created_at`; validate expiry and cap active links. During consumption use `UPDATE ... WHERE used_at IS NULL AND expires_at > now`, then create the issue with `reporter_id=creator_id` and one `issue_assignees` row with `role='member'`.
- [ ] **Step 4: Run the service tests and verify they pass.**

### Task 2: Authenticated management and public API, including scoped uploads

**Files:**
- Create: `backend/app/schemas/temporary_issue_link.py`
- Create: `backend/app/api/v1/temporary_issue_links.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_temporary_issue_link_api.py`

**Interfaces:**
- `POST /api/v1/temporary-issue-links` authenticated: `{expires_in_minutes}` → `{url, token, expires_at}`
- `GET /api/v1/temporary-issue-links` authenticated: creator-owned link summaries only
- `GET /api/v1/public/issue-links/{token}` anonymous: public form metadata
- `POST /api/v1/public/issue-links/{token}/attachments` anonymous multipart upload
- `POST /api/v1/public/issue-links/{token}/submit` anonymous: title/description/issue_type/priority/due_date → created issue summary

- [ ] **Step 1: Write failing API tests** for authentication, creator ownership, 404/410 expiry, one successful submit, second submit rejection, invalid enum/date payloads, and attachment size/type/count/path safety.
- [ ] **Step 2: Run the API tests and verify expected failures.**
- [ ] **Step 3: Implement schemas/routes.** Public routes must never accept reporter/assignee/label/milestone fields; use link creator identity. Return generic 410 for expired/used tokens, avoid revealing whether a random token ever existed, and add `Cache-Control: no-store`.
- [ ] **Step 4: Run API tests and relevant existing issue tests.**

### Task 3: Frontend link management and anonymous form

**Files:**
- Create: `frontend/src/api/temporaryIssueLinks.ts`
- Create: `frontend/src/pages/TemporaryIssueLinksPage.tsx`
- Create: `frontend/src/pages/PublicIssueLinkPage.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/AppLayout.tsx`
- Modify: `frontend/src/locales/zh.json`
- Modify: `frontend/src/locales/en.json`
- Test: `frontend/src/pages/PublicIssueLinkPage.test.tsx`

**Interfaces:**
- Authenticated route `/temporary-issue-links` lists links, creates expiry, copies URL.
- Public route `/public/issue-links/:token` renders title/description/file upload/time/type/priority and one submit state.
- API client functions `createTemporaryIssueLink`, `listTemporaryIssueLinks`, `getPublicIssueLink`, `uploadPublicIssueLinkAttachment`, `submitPublicIssueLink`.

- [ ] **Step 1: Write failing component tests** for form rendering, required title, upload markdown insertion, successful submission lockout, and expired-link message.
- [ ] **Step 2: Run targeted Vitest and verify failures.**
- [ ] **Step 3: Implement pages/routes/navigation and localized copy.** Do not mount the public page inside `ProtectedRoute`; keep submit button disabled during request and replace form with success/expired state.
- [ ] **Step 4: Run targeted Vitest, TypeScript build, and lint.**

### Task 4: Verification and security regression coverage

**Files:**
- Modify: `backend/tests/conftest.py` only if fixtures are needed
- Test: existing relevant backend/frontend suites

- [ ] **Step 1: Run backend targeted tests with a test Fernet key and full backend suite.**
- [ ] **Step 2: Run frontend tests, build, and lint.**
- [ ] **Step 3: Review diff for token leakage, authorization bypasses, unsafe file handling, and route ordering.**
