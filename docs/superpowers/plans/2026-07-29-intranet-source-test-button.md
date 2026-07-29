# Intranet Source Test Button Implementation Plan

**Goal:** Allow administrators to test the current add/edit source form before saving, and keep source action buttons visible.

**Architecture:** Add an admin-only endpoint that validates and parses an unsaved source configuration. The endpoint accepts temporary Basic Auth credentials, or reuses an existing source password during edits when the password field is left blank. The frontend builds a dedicated test payload from the live form, shows an independent loading/result state in the dialog, and removes hover-only opacity from the source action controls.

## Task 1: Define test payload behavior

- Add frontend unit tests for new-source credentials, unauthenticated sources, and edit-time password reuse metadata.
- Add backend endpoint tests for plain sources, temporary Basic Auth, existing-password reuse, authorization, and secret-safe failures.
- Run the focused tests and confirm they fail before implementation.

## Task 2: Implement the backend connection test endpoint

- Add request/response schemas for testing a source configuration.
- Validate the submitted URL using the existing private-network-aware validator.
- Resolve credentials safely, allowing stored-password reuse only for the specified existing source.
- Parse the source and return a bounded preview plus total count without persisting changes.
- Convert parser failures to a concise 502 response without exposing submitted secrets.

## Task 3: Implement the dialog interaction

- Add the frontend test-payload helper.
- Add independent loading and result state to the add/edit dialog.
- Add a `测试连接` button that uses the current unsaved form values.
- Display success/failure feedback inside the dialog and reset it when the form opens or changes.
- Keep preview/edit/delete actions visible at all times.

## Task 4: Verify and integrate

- Run focused and complete backend tests plus Ruff.
- Run frontend tests, lint, and production build.
- Run `git diff --check`, review the diff, commit, fast-forward merge into `main`, and remove the worktree and temporary branch.
