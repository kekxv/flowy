# Wiki Summary and Unified Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` or `subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Markdown wiki summaries and make the web and bot wiki searches return pages only when their titles or tags match.

**Architecture:** Store a `summary` column on `wiki_pages`, surface it through the existing Pydantic schemas and REST endpoints, then render it using the existing Markdown renderer in create, detail, and list views. Centralize the title/tag-only query and scoring in `wiki_service` so the web endpoint and `/wiki` bot command apply identical matching rules.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, Pydantic, React, TypeScript, Vitest, pytest.

## Global Constraints

- Wiki summary is Markdown, optional, and capped at 4,000 characters.
- Search considers page title and tags only; it must never match page body or attachment Markdown.
- Preserve existing visibility and permissions.
- Add matching English and Simplified Chinese locale keys.

---

### Task 1: Persist and expose wiki summaries

**Files:**
- Modify: `backend/tests/test_wiki_search.py`
- Modify: `backend/app/models/wiki.py`
- Modify: `backend/app/schemas/wiki.py`
- Modify: `backend/app/services/wiki_service.py`
- Modify: `backend/app/api/v1/wiki.py`
- Create: `backend/alembic/versions/<revision>_wiki_summary_column.py`

- [ ] Write a failing API/service test that creates a page with `summary="**Short**"` and verifies it is retained.
- [ ] Run the selected pytest test and verify it fails because the schema/model does not expose `summary`.
- [ ] Add the nullable-default-empty model column, migration, create/update arguments, and response field.
- [ ] Re-run the selected pytest test and verify it passes.

### Task 2: Enforce consistent title-and-tag-only search

**Files:**
- Modify: `backend/tests/test_wiki_search.py`
- Modify: `backend/app/services/wiki_service.py`

- [ ] Write failing tests proving body-only matches are excluded from both list search and bot fuzzy search.
- [ ] Run the selected pytest tests and verify they fail with current content matching.
- [ ] Remove content matching from SQL filters and relevance scoring, preserving title/tag relevance and visibility ordering.
- [ ] Re-run the selected pytest tests and verify they pass.

### Task 3: Add summary editing and rendering in the web UI

**Files:**
- Modify: `frontend/src/pages/WikiCreatePage.test.tsx`
- Modify: `frontend/src/pages/WikiDetailPage.test.tsx`
- Modify: `frontend/src/api/wiki.ts`
- Modify: `frontend/src/pages/WikiCreatePage.tsx`
- Modify: `frontend/src/pages/WikiDetailPage.tsx`
- Modify: `frontend/src/pages/WikiListPage.tsx`
- Modify: `frontend/src/locales/en.json`
- Modify: `frontend/src/locales/zh.json`

- [ ] Write failing UI tests that require a Markdown summary field on create and detail editing forms.
- [ ] Run selected Vitest tests and verify the controls are absent.
- [ ] Add summary API typing, Markdown input/preview controls, summary presentation in detail/list cards, and localization keys.
- [ ] Re-run selected Vitest tests and verify they pass.

### Task 4: Make bot results useful without body searching

**Files:**
- Modify: `backend/tests/test_wiki_search.py`
- Modify: `backend/app/services/wechat_work_bot/handlers.py`

- [ ] Write a failing bot test verifying search results show the Markdown summary as a concise preview.
- [ ] Run the selected pytest test and verify it fails.
- [ ] Display summary snippets for list and multi-result `/wiki` responses while keeping full body display only after a title/tag match.
- [ ] Re-run the selected pytest test and verify it passes.

### Task 5: Verify and integrate

**Files:** all modified files above.

- [ ] Run `cd backend && pytest tests/test_wiki_search.py`.
- [ ] Run `cd frontend && npm test && npm run build`.
- [ ] Run `git diff --check` and locale-key parity validation.
- [ ] Commit only the intended implementation files.
