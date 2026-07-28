# Intranet Download Route and File Format Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the `/api/v1/intranet/download` links emitted by `/file` resolve correctly and replace the table response with a readable numbered list.

**Architecture:** Register a small public compatibility router alongside the existing WeChat Work management router, with both paths pointing at the same signed-token download handler. Keep `/api/v1/intranet/download` as the canonical URL emitted in bot messages so existing messages and newly generated messages share one stable public path. Render each search result as a numbered Markdown block instead of a table.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, pytest/httpx ASGI transport, WeCom Markdown.

## Global Constraints

- Keep HTTP support for administrator-configured RFC1918 intranet sources.
- Keep signed-token validation, source-boundary validation, redirect rejection, and the 50 MiB download limit unchanged.
- Preserve the existing `/api/v1/wechat-work-bot/intranet/download` route for compatibility.
- `/file` results must not use Markdown table syntax.

---

### Task 1: Register the Public Download Route

**Files:**
- Modify: `backend/app/api/v1/wechat_work_bot.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_wechat_bot_new_features.py`

**Interfaces:**
- Consumes: `download_intranet_file(token: str, db: AsyncSession)` and the API v1 router prefix `/api/v1`.
- Produces: public route `GET /api/v1/intranet/download` while retaining `GET /api/v1/wechat-work-bot/intranet/download`.

- [x] **Step 1: Write the failing route test**

Add a test that requests `/api/v1/intranet/download?token=invalid` and asserts status `401`. The current application returns `404`, proving the route emitted by `/file` is not registered.

- [x] **Step 2: Run the route test and verify RED**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest tests/test_wechat_bot_new_features.py::TestDownloadProxy::test_public_download_route_reaches_token_validation -q`

Expected: FAIL because the response status is `404` instead of `401`.

- [x] **Step 3: Register the compatibility router**

Define `public_router = APIRouter(tags=["wechat-work-bot"])` in `wechat_work_bot.py`, decorate `download_intranet_file` with both `@router.get("/intranet/download")` and `@public_router.get("/intranet/download")`, and include `public_router` in `backend/app/api/v1/router.py`.

- [x] **Step 4: Run the route test and verify GREEN**

Run the command from Step 2.

Expected: PASS with the short route returning `401` for an invalid token.

### Task 2: Render `/file` Results as a Numbered List

**Files:**
- Modify: `backend/app/services/wechat_work_bot/handlers.py`
- Test: `backend/tests/test_wechat_work_bot.py`

**Interfaces:**
- Consumes: the existing `all_matches` entries containing `name`, `source_name`, and `token`.
- Produces: numbered Markdown blocks containing the file name, source, and download link, with no pipe-delimited table rows.

- [x] **Step 1: Change the existing file-limit test to express list behavior**

Assert that the response contains exactly ten numbered result headings (`1.` through `10.`), contains `[下载文件](` links, retains the total/limit note, and contains neither `| 文件名 |` nor `| --- |`.

- [x] **Step 2: Run the list-format test and verify RED**

Run: `ENCRYPTION_KEY=MDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDA= .venv/bin/pytest tests/test_wechat_work_bot.py::TestBotFileCommand::test_file_limit_10_results -q`

Expected: FAIL because the current response is a Markdown table.

- [x] **Step 3: Implement numbered Markdown blocks**

Build each displayed entry as `N. **filename**`, `来源：source name`, and `[下载文件](URL)`, separated by blank lines. Keep filename truncation, ten-result limit, failure hints, and the canonical `/api/v1/intranet/download` URL unchanged.

- [x] **Step 4: Run targeted tests and verify GREEN**

Run both Task 1 and Task 2 targeted tests and confirm they pass.

- [x] **Step 5: Run full verification and commit**

Run backend pytest with the test Fernet key, Ruff, `git diff --check`, and the relevant frontend test/build commands. Commit with `fix: restore intranet downloads and refresh file results`.
