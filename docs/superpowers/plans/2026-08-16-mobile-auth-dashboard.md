# Mobile Authentication and Dashboard Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent unauthenticated mobile visits from repeatedly reloading the login page and render the milestone progress chart at a non-zero width.

**Architecture:** Treat only authenticated, non-auth API failures as refresh candidates; public and permission-scoped requests must reject normally. Give the reusable ECharts wrapper an explicit width API, then size the compact milestone ring chart in both dimensions so ECharts can initialize on mobile and desktop.

**Tech Stack:** React 19, TypeScript, Axios, ECharts, Vitest, Testing Library.

## Global Constraints

- Do not change backend API response contracts or authorization rules.
- Preserve automatic access-token refresh for protected API requests.
- Do not perform a full-page navigation for a 401 from public/auth endpoints or when no refresh token exists.
- Keep dashboard charts responsive and retain their no-data fallback.

---

### Task 1: Constrain automatic token refresh

**Files:**
- Modify: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`

**Interfaces:**
- Consumes Axios response errors and `accessToken` / `refreshToken` browser storage keys.
- Produces one refresh-and-retry attempt only for a protected request with both tokens present; all other 401 responses reject without navigation.

- [ ] **Step 1: Write failing tests**

```tsx
it("does not navigate when the anonymous theme-settings request receives 401", async () => {
  localStorage.clear()
  mock.onGet("api/v1/system/settings").reply(401)

  await expect(api.get("/system/settings")).rejects.toMatchObject({ response: { status: 401 } })
  expect(window.location.hash).toBe("")
})
```

```tsx
it("refreshes and retries a protected request with both tokens", async () => {
  localStorage.setItem("accessToken", "expired-access")
  localStorage.setItem("refreshToken", "valid-refresh")
  mock.onGet("api/v1/dashboard").replyOnce(401).onGet("api/v1/dashboard").replyOnce(200, { ok: true })
  refreshMock.mockResolvedValue({ data: { access_token: "new-access", refresh_token: "new-refresh" } })

  await expect(api.get("/dashboard")).resolves.toMatchObject({ data: { ok: true } })
})
```

- [ ] **Step 2: Run the focused test and verify it fails because all 401 responses currently invoke the refresh-and-navigate branch.**

Run: `npm test -- --run src/api/client.test.ts`

- [ ] **Step 3: Implement the smallest refresh eligibility guard**

```ts
const isAuthRequest = error.config.url?.startsWith("/auth/")
const canRefresh = Boolean(localStorage.getItem("accessToken") && localStorage.getItem("refreshToken"))
if (error.response?.status === 401 && !isAuthRequest && canRefresh && !error.config._retry) {
  // existing refresh-and-retry behavior
}
```

On refresh failure, clear only the auth keys and navigate once to `#/login`; otherwise return the original rejected response.

- [ ] **Step 4: Run the focused test and verify it passes.**

Run: `npm test -- --run src/api/client.test.ts`

### Task 2: Size the compact milestone ECharts instance

**Files:**
- Modify: `frontend/src/components/DashboardChart.tsx`
- Modify: `frontend/src/components/DashboardChart.test.tsx`
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes an ECharts option, height, and optional width.
- Produces a chart host whose configured dimensions are passed to `echarts-for-react`; ordinary charts continue to occupy `100%` width.

- [ ] **Step 1: Write a failing test**

```tsx
it("uses an explicit width for a compact chart", () => {
  render(<DashboardChart option={{ series: [{ type: "pie", data: [{ value: 1 }] }] }} height={44} width={44} />)
  expect(screen.getByTestId("dashboard-echart")).toHaveStyle({ width: "44px", height: "44px" })
})
```

- [ ] **Step 2: Run the focused test and verify it fails because the wrapper does not accept or apply width.**

Run: `npm test -- --run src/components/DashboardChart.test.tsx`

- [ ] **Step 3: Implement explicit dimensions and use them for milestone rings**

```tsx
function DashboardChart({ option, height = 180, width = "100%", emptyText = "No data" }: DashboardChartProps) {
  const style = { width, height }
  // use style for both the chart and no-data fallback
}

function RingProgress({ pct, size = 44 }) {
  return <DashboardChart width={size} height={size} option={...} />
}
```

- [ ] **Step 4: Run the focused test and verify it passes.**

Run: `npm test -- --run src/components/DashboardChart.test.tsx`

### Task 3: Verify the integrated behavior

**Files:**
- Verify: `frontend/src/api/client.ts`
- Verify: `frontend/src/components/DashboardChart.tsx`
- Verify: `frontend/src/pages/DashboardPage.tsx`

- [ ] **Step 1: Run the frontend test suite.**

Run: `npm test`

- [ ] **Step 2: Run static checks and production build.**

Run: `npm run lint && npm run build`

- [ ] **Step 3: Inspect the final diff.**

Run: `git diff --check && git diff -- frontend/src/api/client.ts frontend/src/api/client.test.ts frontend/src/components/DashboardChart.tsx frontend/src/components/DashboardChart.test.tsx frontend/src/pages/DashboardPage.tsx`
