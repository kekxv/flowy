# Chart insertion dialog implementation plan

**Goal:** Users enter chart data in a modal instead of editing JSON; generated Markdown remains compatible with existing reports and printing.

**Architecture:** Add a portaled native dialog with chart type, title, editable category/series matrix and shared visual preview. Validate user input before serializing the existing ChartSpec. MarkdownEditor snapshots its selection before opening, inserts generated Markdown at that selection and restores focus. Preserve flowchart insertion through a simple sequence editor.

- [x] Add failing interaction tests for matrix-to-chart insertion, cursor preservation, validation, cancellation, type changes and form isolation.
- [x] Implement dialog, accessible responsive layout, preview and form validation without new dependencies.
- [x] Replace sample dropdown in MarkdownEditor and update usage documentation.
- [x] Run targeted/full frontend tests, lint/build and real browser desktop/mobile checks. Keep application services stopped.

## Verification

- RED: five new interaction cases failed because the modal insertion action did not exist.
- GREEN: 123 frontend tests passed across 26 files; lint and final production build passed.
- Real Chromium: desktop and 390px mobile layouts checked, with no page overflow; bar/line/pie preview, numeric validation, generated insertion and outer form isolation passed.
- Flowchart steps containing quotes and angle brackets rendered successfully; Escape closed the native modal and restored focus.
- Independent review approved validation, schema compatibility, selection preservation and modal/form behavior with no critical or important issues.
- No application services started; existing database content was not changed by this feature.
