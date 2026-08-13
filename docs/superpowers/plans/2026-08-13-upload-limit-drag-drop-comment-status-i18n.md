# Upload Limit, Drag-and-Drop, and Comment Status i18n Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make issue attachment limits reflect the configured Wiki limit, permit confirmed drag-and-drop uploads, and translate comment-status controls.

**Architecture:** Move the static Wiki upload-limit endpoint before the dynamic page-id endpoint so the frontend can fetch it. Extend the shared Markdown editor used by issue creation, editing, and comments with a drop target that reuses the existing upload workflow only after browser confirmation. Replace local English status labels with translation keys.

**Tech Stack:** FastAPI, React 19, TypeScript, react-i18next, Vitest, pytest.

## Global Constraints

- Keep the server-side configured-size enforcement as the authoritative upload limit.
- Accept a single dropped file or image, matching the existing file-picker behavior.
- Ask for confirmation before every drag-and-drop upload; cancelled drops must not upload.

---

### Task 1: Restore the public configured upload-limit endpoint

**Files:**
- Modify: `backend/app/api/v1/wiki.py`
- Test: `backend/tests/test_api_issues.py`

- [ ] **Step 1: Write a failing endpoint regression test**

Add a logged-in request to `GET /api/v1/wiki/upload-limit` that asserts `200` and the configured byte and MB values.

- [ ] **Step 2: Run the endpoint test to verify it fails**

Run: `cd backend && uv run pytest tests/test_api_issues.py -k upload_limit -q`

Expected: FAIL because `upload-limit` is captured by `/{page_id}`.

- [ ] **Step 3: Move the static route before `@router.get("/{page_id}")`**

Define `get_upload_limit` after `_get_upload_limit` and remove its later duplicate so FastAPI matches it first.

- [ ] **Step 4: Run the endpoint test to verify it passes**

Run: `cd backend && uv run pytest tests/test_api_issues.py -k upload_limit -q`

Expected: PASS.

### Task 2: Add confirmed drag-and-drop uploads to MarkdownEditor

**Files:**
- Modify: `frontend/src/components/MarkdownEditor.tsx`
- Test: `frontend/src/components/MarkdownEditor.test.tsx`

- [ ] **Step 1: Write failing drop tests**

Add tests that drop one file, stub `window.confirm`, and assert the upload request is made only when confirmation returns true; assert a cancelled confirmation makes no request.

- [ ] **Step 2: Run the component test to verify it fails**

Run: `cd frontend && npm test -- MarkdownEditor.test.tsx`

Expected: FAIL because the editor has no `onDrop` behavior.

- [ ] **Step 3: Implement the minimal shared drop flow**

Extract the existing file validation/upload work into a `handleFileUpload(file)` helper, invoke it from both input changes and confirmed drops, and show a visual drop state.

- [ ] **Step 4: Run the component test to verify it passes**

Run: `cd frontend && npm test -- MarkdownEditor.test.tsx`

Expected: PASS.

### Task 3: Translate comment-status controls

**Files:**
- Modify: `frontend/src/pages/IssueDetailPage.tsx`
- Modify: `frontend/src/locales/zh.json`
- Modify: `frontend/src/locales/en.json`

- [ ] **Step 1: Write a failing locale-oriented UI test**

Add a test that renders a non-valid comment in Chinese and verifies its status badge/control uses the localized status text.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- IssueDetailPage.test.tsx`

Expected: FAIL because `STAT_LBLS` contains hard-coded English strings.

- [ ] **Step 3: Add `comment_status` translation keys and render them with `t`**

Replace `STAT_LBLS` with a status-to-key map and call `t` for the status badge and menu labels.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test -- IssueDetailPage.test.tsx`

Expected: PASS.

### Task 4: Verify the integrated change

**Files:**
- Verify: `backend/tests/test_api_issues.py`
- Verify: `frontend/src/components/MarkdownEditor.test.tsx`
- Verify: `frontend/src/pages/IssueDetailPage.test.tsx`

- [ ] **Step 1: Run targeted frontend tests and production build**

Run: `cd frontend && npm test -- MarkdownEditor.test.tsx IssueDetailPage.test.tsx && npm run build`

- [ ] **Step 2: Run targeted backend API tests**

Run: `cd backend && uv run pytest tests/test_api_issues.py -q`

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short`
