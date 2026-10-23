# Report charts implementation plan

**Goal:** Enrich report display and printing with Markdown charts and Mermaid diagrams.

**Architecture:** Extend the shared Markdown renderer with fenced `chart` (validated JSON) and `mermaid` blocks. Lazy rendering generates responsive SVG independent of hidden print container dimensions. Reuse the renderer for editor previews, report dialogs and print documents. Print actions wait for pending figures and fonts; errors show source instead of crashing or silently losing information.

**Scope:** Line/bar/pie charts, chart data tables, Mermaid flow diagrams; report-editor insert examples; existing data stays Markdown with no database changes.

- [x] Write failing tests for chart parsing/validation, Markdown integration, editor insertion and print readiness.
- [x] Add lazy SVG renderers and safe fallback UI; keep normal code blocks unchanged.
- [x] Add report-editor templates and integrate waiting into single/all-report printing.
- [x] Verify browser display, A4/A5 PDFs, regression tests/build/lint and independent review. Do not start application services.

Validation: 117 frontend tests passed; TypeScript/Vite build, ESLint and diff checks passed. Actual Chromium report dialog rendered four SVG figures without errors, with no mobile horizontal overflow. A4 (3 pages) and A5 (4 pages) PDFs preserved all chart labels, Mermaid nodes and final report text. Independent review completed; printing selection race fixed and regression tested. Application services were not started.
