# Active Download Token Lifetime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure a validated intranet-file download remains streamable after its link reaches the signed expiry time.

**Architecture:** The proxy authenticates the signed token before opening the upstream response and then streams that already-authorized response without revalidating the token. The actual interruption risk is Nginx's global 30-second proxy timeouts, so give only the intranet download endpoint a long activity-based timeout; Nginx resets these timers whenever bytes move.

**Tech Stack:** FastAPI, httpx, pytest, pytest-asyncio.

## Global Constraints

- An expired token must still be rejected before the download begins.
- Do not extend the reusable URL or weaken HMAC/expiry validation for new requests.
- Preserve true streaming; never buffer the entire file to extend a download.

---

### Task 1: Keep active download connections alive

**Files:**
- Modify: `nginx.conf`
- Test: `backend/tests/test_nginx_config.py`

- [ ] **Step 1: Write a failing Nginx configuration regression test**

Read `nginx.conf` and assert the exact-match `/api/v1/intranet/download` location uses 3600-second `proxy_read_timeout` and `proxy_send_timeout` values.

- [ ] **Step 2: Run the regression test to verify it fails**

Run: `cd backend && uv run pytest tests/test_nginx_config.py -q`

Expected: FAIL because every API route currently inherits the 30-second proxy timeout.

- [ ] **Step 3: Add an exact download location to Nginx**

Copy the existing API proxy headers into `location = /api/v1/intranet/download`; set `proxy_read_timeout 3600s` and `proxy_send_timeout 3600s` there while leaving the global API defaults unchanged.

- [ ] **Step 4: Run configuration and Nginx syntax checks**

Run: `cd backend && uv run pytest tests/test_nginx_config.py -q && nginx -t -c "$(pwd)/../nginx.conf"`

Expected: PASS.

### Task 2: Verify normal expiry behavior remains intact

**Files:**
- Test: `backend/tests/test_wechat_bot_new_features.py`

- [ ] **Step 1: Run the download-proxy test group**

Run: `cd backend && uv run pytest tests/test_wechat_bot_new_features.py -k 'DownloadProxy or active_download' -q`

Expected: PASS, including rejection of a link that expires before download starts.
