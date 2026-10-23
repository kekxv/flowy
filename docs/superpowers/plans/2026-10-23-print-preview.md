# Test report print preview implementation plan

**Goal:** Detail-page printing always includes all reports and first opens a zoomable, paginated A4/A5 preview.

**Architecture:** Snapshot requested reports, render shared TestPrintDocument, wait for charts/fonts/images, and paginate its HTML into an isolated iframe using Paged.js. Preview zoom affects only screen framing. Print the already paginated iframe, so the same document/pages reach the system print dialog. Reuse for explicit single-report action from report cards.

- [x] Update failing page interaction tests for all-reports default and preview-before-print.
- [x] Implement isolated paginated document builder and accessible preview modal with zoom, fit-width, A4/A5, page count and explicit print.
- [x] Integrate detail-page all-reports and card single-report preview, retaining chart readiness and snapshot stability.
- [x] Verify real browser pagination/zoom/printing, frontend tests/build/lint, independent review and documentation. Keep application services stopped.

## Verification

- Frontend: 119 tests passed across 26 files; lint and production build passed.
- Real Chromium: two reports, four SVG diagrams, report versions and final content preserved; zoom and mobile fit-width checked.
- A4 preview and exported PDF both contain 4 pages; A5 both contain 6 pages, with correct physical page dimensions.
- Regression coverage includes preview-before-print, all-report scope after single preview, paper changes and rapid A4/A5/A4 readiness changes.
- Independent review completed; stale readiness issue fixed and rechecked.
- Application services remain stopped.
