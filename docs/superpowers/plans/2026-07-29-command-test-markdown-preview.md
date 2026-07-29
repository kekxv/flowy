# Command Test Markdown Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let administrators switch command-test responses between raw source text and rendered Markdown.

**Architecture:** Add a focused `CommandTestResult` presentation component that owns the source/preview mode and reuses the existing `MarkdownContent` renderer. Replace only the successful command response block in `WeChatWorkBotPage`; command execution and error handling remain unchanged.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Markdown/GFM, Vitest, Testing Library.

## Global Constraints

- Preserve the exact command response string; presentation must not rewrite it.
- Default to source mode to preserve the current behavior.
- Use the existing `MarkdownContent` component for preview rendering.
- Keep source and preview content vertically scrollable within the existing response-height limit.

---

### Task 1: Command result source/preview viewer

**Files:**
- Create: `frontend/src/components/CommandTestResult.tsx`
- Create: `frontend/src/components/CommandTestResult.test.tsx`
- Modify: `frontend/src/pages/WeChatWorkBotPage.tsx`

**Interfaces:**
- Consumes: `MarkdownContent({ children: string })` from `frontend/src/components/MarkdownContent.tsx`.
- Produces: `CommandTestResult({ content: string })`, rendering source mode by default and an interactive Markdown preview mode.

- [x] **Step 1: Write the failing component test**

```tsx
const content = '# 返回标题\n\n**已完成**'
render(<CommandTestResult content={content} />)
expect(screen.getByLabelText('返回内容源文件').textContent).toBe(content)
expect(screen.queryByRole('heading', { name: '返回标题' })).not.toBeInTheDocument()
fireEvent.click(screen.getByRole('button', { name: 'Markdown 预览' }))
expect(screen.getByRole('heading', { name: '返回标题' })).toBeInTheDocument()
expect(screen.getByText('已完成').tagName).toBe('STRONG')
fireEvent.click(screen.getByRole('button', { name: '源文件' }))
expect(screen.getByLabelText('返回内容源文件').textContent).toBe(content)
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- --run src/components/CommandTestResult.test.tsx`

Expected: FAIL because `CommandTestResult` does not exist.

- [x] **Step 3: Implement the viewer**

Create a component with local mode state, two `aria-pressed` buttons named `源文件` and `Markdown 预览`, a `<pre>` source branch, and a `prose` preview branch containing `MarkdownContent`.

```tsx
export default function CommandTestResult({ content }: { content: string }) {
  const [mode, setMode] = useState<'source' | 'preview'>('source')
  return (
    <div className="rounded-lg bg-[var(--bg-muted)] overflow-hidden">
      <div className="flex justify-end border-b border-[var(--border-light)] p-1.5">
        <button type="button" aria-pressed={mode === 'source'} onClick={() => setMode('source')}>源文件</button>
        <button type="button" aria-pressed={mode === 'preview'} onClick={() => setMode('preview')}>Markdown 预览</button>
      </div>
      {mode === 'source' ? (
        <pre aria-label="返回内容源文件">{content}</pre>
      ) : (
        <div className="prose prose-sm max-w-none"><MarkdownContent>{content}</MarkdownContent></div>
      )}
    </div>
  )
}
```

- [x] **Step 4: Integrate the viewer**

Import `CommandTestResult` in `WeChatWorkBotPage.tsx` and replace the existing raw response `<div>` with `<CommandTestResult content={testResponse} />`.

```tsx
import CommandTestResult from "../components/CommandTestResult";

{testResponse && <CommandTestResult content={testResponse} />}
```

- [x] **Step 5: Verify GREEN and regressions**

Run: `npm test -- --run src/components/CommandTestResult.test.tsx`

Expected: PASS with source mode shown first, Markdown rendered after switching, and source content restored after switching back.

Run: `npm test && npm run lint && npm run build`

Expected: all tests pass, lint has no new errors, and the production build exits successfully.

- [x] **Step 6: Review and commit**

Run: `git diff --check && git diff --stat && git status --short`

Expected: only the component, test, page integration, and this plan are changed; no whitespace errors.

Commit: `feat: preview command test responses as markdown`
