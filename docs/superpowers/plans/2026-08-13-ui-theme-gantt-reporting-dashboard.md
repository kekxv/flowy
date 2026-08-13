# UI Theme, Milestone Gantt, and Reporting Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a modern configurable Flowy interface with system-wide color themes, a milestone-and-issue Gantt view, and richer reporting charts on the dashboard.

**Architecture:** Store the administrator-selected primary color in AppSetting and expose it through the existing system settings endpoint; a frontend theme provider derives accessible variable shades and persists a per-device preferred preset. Add start/due date fields to milestones and issues via Alembic, expose milestone issues with schedule data, render a CSS Gantt in the milestones area, and augment dashboard API statistics for compact SVG reporting visuals.

**Tech Stack:** FastAPI, SQLAlchemy/Alembic, React 19, TypeScript, Tailwind CSS, Vitest, pytest.

## Global Constraints

- Preserve all existing issue, milestone, and permissions behavior.
- Support old records with absent schedule dates without crashing or misleading 0-length bars.
- Use no new chart or date library; visualizations must remain lightweight SVG/CSS.
- Theme colors must maintain readable foreground contrast.

---

### Task 1: Add scheduling fields and Gantt API data

**Files:**
- Modify: `backend/app/models/issue.py`, `backend/app/models/tracking.py`, `backend/app/schemas/issue.py`, `backend/app/api/v1/milestones.py`
- Create: `backend/alembic/versions/e012_issue_and_milestone_schedule.py`
- Test: `backend/tests/test_api_milestones.py`

- [ ] Write failing API tests that create/update schedule dates and assert `GET /milestones/{id}/issues` exposes issue start/due dates and milestone start/due dates.
- [ ] Run the target test and observe the missing fields failure.
- [ ] Add nullable `start_date`/`due_date` schedule fields, schema validation, API serialization, and an Alembic migration.
- [ ] Re-run target tests.

### Task 2: Add report data to dashboard API

**Files:**
- Modify: `backend/app/api/v1/dashboard.py`
- Test: `backend/tests/test_api_dashboard.py`

- [ ] Write failing API tests for a 30-day activity series, completion-by-week series, and milestone summary data.
- [ ] Run the target test and observe failure.
- [ ] Compute the report series with existing issue dates and return them under `stats`.
- [ ] Re-run target tests.

### Task 3: Implement themes and modern application shell

**Files:**
- Create: `frontend/src/components/theme/ThemeProvider.tsx`, `frontend/src/components/theme/ThemePanel.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/index.css`, `frontend/src/components/layout/AppLayout.tsx`, `frontend/src/pages/AdminPage.tsx`, locale JSON
- Test: `frontend/src/components/theme/ThemeProvider.test.tsx`

- [ ] Write failing tests that select a preset/custom color and assert derived CSS variables are applied and persisted.
- [ ] Run the component test to observe failure.
- [ ] Implement accessible color derivation, local preference restoration, a compact user theme panel, and an admin global primary color setting.
- [ ] Re-run component tests and production build.

### Task 4: Build milestone Gantt view

**Files:**
- Create: `frontend/src/components/GanttChart.tsx`, `frontend/src/components/GanttChart.test.tsx`
- Modify: `frontend/src/pages/MilestonesPage.tsx`, `frontend/src/pages/MilestoneDetailPage.tsx`, issue create/edit UI, locale JSON

- [ ] Write failing component tests for date-to-bar positioning and unscheduled-task handling.
- [ ] Run Gantt tests to observe failure.
- [ ] Implement responsive milestone lanes, issue bars, today marker, view range selector, and schedule date editors.
- [ ] Re-run Gantt tests and build.

### Task 5: Upgrade dashboard reporting visuals

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`, locale JSON
- Test: `frontend/src/pages/DashboardPage.test.tsx`

- [ ] Write failing UI tests that assert report charts and report-range controls render from dashboard data.
- [ ] Run target test to observe failure.
- [ ] Add activity, completion trend, issue mix, delivery risk, milestone progress, and personal workload sections using accessible SVG/CSS charts.
- [ ] Re-run target tests, all frontend tests, backend relevant tests, and production build.
