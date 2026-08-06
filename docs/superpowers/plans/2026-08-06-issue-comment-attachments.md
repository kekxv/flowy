# Issue, Comment, and Wiki Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let issue create/edit forms and comments insert uploaded files or images under the Wiki upload limit, and store all newly uploaded Wiki files as Base62 capability names ending in `.bin` while preserving download names.

**Architecture:** Reuse the existing reversible Base62 attachment-name codec for opaque, original-name-bearing storage names. Extend the attachment API with a protected upload endpoint that consults the existing Wiki setting, and expose it through the shared Markdown editor so issue descriptions and comments insert safe Markdown links. Wiki keeps its existing endpoint but adopts the codec and `.bin` storage convention.

**Tech Stack:** FastAPI, SQLAlchemy async, pytest/httpx, React 19, TypeScript, Vitest, Tailwind CSS.

## Global Constraints

- Reuse `wiki_upload_max_mb` and its 5 MB fallback for every new attachment upload.
- Do not reject Wiki or issue/comment uploads by filename extension.
- New attachment storage files use a Base62 capability name followed by `.bin`; a download response retains the sanitized original filename.
- Preserve support for legacy bot attachment paths that lack `.bin`.

---

### Task 1: Secure attachment storage and download behavior

**Files:**
- Modify: `backend/app/services/wechat_work_bot/attachment_names.py`
- Modify: `backend/app/api/v1/wiki.py`
- Modify: `backend/app/api/v1/bot_attachments.py`
- Test: `backend/tests/test_security_regressions.py`
- Test: `backend/tests/test_api_issues.py`

**Interfaces:**
- Consumes: `encode_attachment_name(original_name: str) -> str` and `decode_attachment_name(storage_name: str) -> str | None`.
- Produces: Wiki and bot attachment download routes that use the stored `.bin` filename but return `Content-Disposition` with the original name.

- [ ] **Step 1: Write failing API tests**

```python
assert response.json()["filename"].endswith(".bin")
assert response.json()["filename"].removesuffix(".bin").isalnum()
assert response.headers["content-disposition"].endswith("report.unknown")
```

- [ ] **Step 2: Run the focused tests and verify they fail because Wiki still validates extensions and uses UUID filenames.**

Run: `python3 -m pytest backend/tests/test_security_regressions.py backend/tests/test_api_issues.py -q`

- [ ] **Step 3: Implement opaque `.bin` storage and original-name download responses.**

```python
storage_name = f"{encode_attachment_name(file.filename)}.bin"
original_name = decode_attachment_name(filename) or filename
return FileResponse(filepath, filename=original_name, media_type=media_type)
```

- [ ] **Step 4: Re-run focused backend tests and verify they pass.**

Run: `python3 -m pytest backend/tests/test_security_regressions.py backend/tests/test_api_issues.py -q`

### Task 2: Upload endpoint shared by issue descriptions and comments

**Files:**
- Modify: `backend/app/api/v1/bot_attachments.py`
- Modify: `backend/app/api/v1/issues.py`
- Test: `backend/tests/test_api_issues.py`

**Interfaces:**
- Consumes: `wiki._get_upload_limit(db) -> int` and the Base62 codec.
- Produces: `POST /api/v1/bot-attachments/upload`, returning `{filename, original_name, url, is_image, markdown}`.

- [ ] **Step 1: Write failing tests for authenticated upload, configurable oversize rejection, and image Markdown.**

```python
response = await client.post("/api/v1/bot-attachments/upload", files={"file": ("note.any", b"data")}, headers=headers)
assert response.json()["markdown"] == "[note.any](/api/v1/bot-attachments/...)"
assert too_large.status_code == 413
```

- [ ] **Step 2: Run the focused test and verify it fails because no upload route exists.**

Run: `python3 -m pytest backend/tests/test_api_issues.py -q`

- [ ] **Step 3: Implement the protected upload endpoint and extend comment cleanup to recognize uploaded attachment URLs.**

```python
content = await file.read()
if len(content) > await _get_upload_limit(db):
    raise HTTPException(413, detail="File size exceeds configured limit")
```

- [ ] **Step 4: Re-run the focused test and verify it passes.**

Run: `python3 -m pytest backend/tests/test_api_issues.py -q`

### Task 3: Markdown upload controls and roomier issue forms

**Files:**
- Create: `frontend/src/api/attachments.ts`
- Modify: `frontend/src/components/MarkdownEditor.tsx`
- Modify: `frontend/src/components/MarkdownEditor.test.tsx`
- Modify: `frontend/src/pages/IssueCreatePage.tsx`
- Modify: `frontend/src/pages/IssueEditPage.tsx`
- Modify: `frontend/src/pages/IssueDetailPage.tsx`
- Modify: `frontend/src/locales/zh.json`
- Modify: `frontend/src/locales/en.json`

**Interfaces:**
- Consumes: `uploadAttachment(file: File): Promise<AttachmentUploadResult>` and `getWikiUploadLimit(): Promise<{limit_mb: number}>`.
- Produces: Markdown editor toolbar buttons that add a returned Markdown snippet at the cursor; issue create/edit pages use a wider form and a taller editor.

- [ ] **Step 1: Write failing component tests for File/Image controls, limit messaging, and uploaded Markdown insertion.**

```tsx
await user.upload(screen.getByLabelText("Upload file"), new File(["a"], "note.any"))
expect(onChange).toHaveBeenCalledWith("[note.any](/api/v1/bot-attachments/file.bin)")
```

- [ ] **Step 2: Run the component test and verify it fails because the toolbar has no upload controls.**

Run: `npm test -- --run src/components/MarkdownEditor.test.tsx`

- [ ] **Step 3: Implement upload controls, limit enforcement, and responsive issue form layout.**

```tsx
<MarkdownEditor value={desc} onChange={setDesc} rows={12} className="min-h-[360px]" />
```

- [ ] **Step 4: Re-run component tests and build the frontend.**

Run: `npm test -- --run src/components/MarkdownEditor.test.tsx && npm run build`

### Task 4: Full verification and review

**Files:**
- Verify only

- [ ] **Step 1: Run backend, frontend, lint, and build verification.**

Run: `python3 -m pytest -q && npm test -- --run && npm run lint && npm run build`

- [ ] **Step 2: Inspect the final diff against the global constraints.**

Run: `git diff --check && git diff --stat && git status --short`
