# /list Dashboard Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Make `/list` always return a compact temporary-detail link whose detail page presents an issue dashboard with responsive charts and no “我的工作” module.

**Architecture:** The bot stores the existing issue list as temporary detail content and prepends a private JSON dashboard marker containing aggregate issue data. The public detail page detects that marker and renders a dedicated lightweight CSS/SVG dashboard; ordinary wiki, bug, requirement, software, and test details keep their current Markdown article UI. The dashboard does not expose internal issue IDs or assignment/my-work sections.

**Tech Stack:** FastAPI/SQLAlchemy, Python pytest/Ruff, React/TypeScript, Vitest, CSS.

**Spec:** User request: “`/list`能不能再加一个点击详情，进去之后是类似仪表盘的报告，有图表等等，但是不需要我的工作，那个模块，并且兼容pc和手机”

## Global Constraints

- The WeChat reply remains compact: title, summary, and one temporary-detail link.
- Dashboard data is scoped to the same `/list` filter and at most 50 issues.
- Internal IDs and “我的工作” content are absent from the public dashboard presentation.
- Desktop and mobile layouts must remain readable without horizontal page overflow.
- Existing non-dashboard temporary detail pages keep their current behavior.

### Task 1: Backend dashboard payload

**Files:**
- Modify: `backend/app/services/wechat_work_bot/handlers.py:handle_list`
- Test: `backend/tests/test_wechat_work_bot.py`

**Interfaces:**
- Dashboard marker format: one HTML comment line beginning `<!-- flowy-dashboard:` and ending ` -->`, followed by the existing Markdown list.
- JSON fields: `kind`, `scope`, `total`, `shown`, `statuses`, `priorities`, `types`, and `issues`; issue objects contain title, status, priority, issue_type, created_at, updated_at, and duration_seconds, with no id.

- [x] Write a failing test asserting `/list` returns a temporary link and stored content contains the marker, aggregates, issue titles, and no issue IDs.
- [x] Run the focused test and confirm it fails because `handle_list` still returns inline Markdown for short lists.
- [x] Add the marker payload and always call `_temporary_detail` for non-empty lists; retain existing filtering and sorting.
- [x] Run the focused test and confirm it passes.
- [x] Run backend Ruff and related bot tests.

### Task 2: Public dashboard renderer

**Files:**
- Create: `frontend/src/components/IssueListDashboard.tsx`
- Create: `frontend/src/components/IssueListDashboard.test.tsx`
- Modify: `frontend/src/pages/PublicBotDetailPage.tsx`

**Interfaces:**
- Export `parseIssueListDashboard(content: string)` returning `{ dashboard: IssueListDashboardData | null; markdown: string }`.
- Render KPI cards, status distribution bars, priority/type charts, a 30-day activity trend, and a recent issue list without IDs or assignment sections.
- Use semantic labels and responsive grid/flex layout; no ECharts dependency.

- [x] Write parser/render tests first for marker extraction, no-ID output, and mobile-safe dashboard structure.
- [x] Run them and confirm failure because the component does not exist.
- [x] Implement marker parsing and dashboard rendering.
- [x] Integrate it only when the marker kind is `issue-list`; pass ordinary content through MarkdownContent.
- [x] Run frontend focused tests and lint.

### Task 3: Responsive visual system and regression verification

**Files:**
- Modify: `frontend/src/index.css`
- Tests: existing frontend and backend suites.

- [x] Add dashboard card, bar, trend, and issue-list styles with `min-width:0`, wrapping, and one-column mobile breakpoints.
- [x] Verify no horizontal overflow rules are introduced.
- [x] Run complete CI-equivalent backend and frontend commands from `.github/workflows/ci.yml`.
- [x] Run `git diff --check`.

