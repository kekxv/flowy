# Visual Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Flowy's legacy neutral-card UI with a distinct modern workspace visual system.

**Architecture:** Rebuild the application shell around a dark branded navigation rail and an elevated light work surface. Redefine global design tokens and component primitives, then adapt the dashboard and issue list layouts to use stronger hierarchy, richer data presentation, and scan-friendly interaction states without changing API behavior.

**Tech Stack:** React, TypeScript, Tailwind CSS, CSS custom properties, Vitest.

## Global Constraints

- Preserve existing routes, controls, responsive navigation, and i18n behavior.
- Keep all existing functionality accessible by keyboard and on small screens.
- Reuse the existing configurable primary color through CSS variables.

---

### Task 1: Establish the visual system and shell

**Files:**
- Modify: `frontend/src/index.css`, `frontend/src/components/layout/AppLayout.tsx`

- [ ] Replace neutral canvas, card, button, input, and motion tokens with the new visual system.
- [ ] Rebuild desktop/mobile navigation as a dark branded workspace frame with an elevated content stage.
- [ ] Run the production build.

### Task 2: Redesign report dashboard and issue workspace

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`, `frontend/src/pages/IssueListPage.tsx`

- [ ] Add a report hero and strong dashboard hierarchy around the existing charts.
- [ ] Reshape issue search/list areas into a command-style work queue with more scannable rows.
- [ ] Run frontend tests and production build.
