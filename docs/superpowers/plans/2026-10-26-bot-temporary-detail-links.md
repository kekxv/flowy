# Bot Temporary Detail Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将企业微信机器人中的 wiki、软件、问题/需求、测试查询和报告回复统一压缩为标题、概括和可过期详情链接。

**Architecture:** 新增只读临时详情表和公共 API，保存 Markdown 正文与短摘要；机器人处理器通过统一 helper 创建链接并返回短消息。前端新增无需登录的公共详情页，复用 Markdown 渲染器。

**Tech Stack:** FastAPI, SQLAlchemy async, Alembic, React, React Router, react-markdown。

**Spec:** 用户需求：机器人长回复生成临时 URL，回复包含标题、概括、点击查看详情；wiki、soft、问题/需求、测试管理报告查询和报告测试均支持。

## Global Constraints

- 临时链接默认 24 小时有效，最短 5 分钟，最长 7 天。
- 详情链接只读、无需登录，过期后返回 410。
- 微信机器人消息保持 Markdown 格式且尽量短。

---

### Task 1: Add temporary bot detail storage and public API

**Files:**
- Create: `backend/app/models/temporary_bot_detail.py`
- Create: `backend/app/services/temporary_bot_detail_service.py`
- Create: `backend/app/api/v1/temporary_bot_details.py`
- Create: `backend/alembic/versions/e020_temporary_bot_details.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_temporary_bot_detail_service.py`

- [ ] Write failing service/API tests for token hashing, expiry, and public payload.
- [ ] Run the focused tests and confirm failure because the model/service does not exist.
- [ ] Implement model, token service, GET `/public/bot-details/{token}`, and migration.
- [ ] Run focused backend tests and confirm pass.

### Task 2: Make bot handlers return short linked summaries

**Files:**
- Modify: `backend/app/services/wechat_work_bot/handlers.py`
- Modify: `backend/app/services/wechat_work_bot/service.py`
- Test: `backend/tests/test_wechat_bot_detail_links.py`

- [ ] Add failing tests covering wiki single result, soft detail, issue/requirement detail, test query/report, and detail URL format.
- [ ] Run the tests and confirm they fail with long inline output or missing helper.
- [ ] Add `CommandHandlers._temporary_detail(...)` and use it for long wiki, soft, issue/requirement and test/report responses; preserve selection prompts and action confirmations.
- [ ] Ensure service sends the compact response as one Markdown message and logs the full response/link text.
- [ ] Run focused tests and confirm pass.

### Task 3: Add public frontend detail page

**Files:**
- Create: `frontend/src/api/temporaryBotDetails.ts`
- Create: `frontend/src/pages/PublicBotDetailPage.tsx`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/pages/PublicBotDetailPage.test.tsx`

- [ ] Add failing rendering tests for title, summary, Markdown body, expiry and unavailable states.
- [ ] Run focused Vitest tests and confirm failure.
- [ ] Implement API client, public route, and responsive read-only page using `MarkdownContent`.
- [ ] Run frontend tests and type/build checks.

### Task 4: Full verification

- [ ] Run backend focused and full tests.
- [ ] Run frontend test, lint, and build commands.
- [ ] Inspect git diff and confirm migration/router/model wiring.
