# ElectronTimelineViewer — Phased Build Plan

This document breaks the build into reviewable phases. Each phase has clear deliverables and acceptance checks before moving on.

---

## Phase 1 — Project Scaffold and Toolchain

**Goal:** Runnable Electron shell with correct dependencies and build pipeline.

**Tasks:**

- Initialize electron-vite (vanilla TypeScript template)
- Install `ag-grid-community`, `csv-parse`, `electron-builder`
- Create `.gitignore`, `electron-builder.yml`, project folder structure
- Configure `package.json` scripts (`dev`, `build`, `build:linux`)
- Add placeholder application icon

**Acceptance:**

- `npm run dev` launches an Electron window without errors
- `npm run build` completes without errors (packaging may be Phase 6)

---

## Phase 2 — Main Process: File I/O and Indexing

**Goal:** Open CSV files, detect format, build line-offset index, fetch rows by range.

**Tasks:**

- Implement RFC 4180 CSV parsing (`csv-parse` streaming mode)
- Format detection from exact header match (Filesystem vs Super)
- `fileIndexer.ts` Worker thread with progress events
- `fileReader.ts` — seek by offset, parse row batches
- File size / line count limits (2 GB, 10 million lines)
- `ipcHandlers.ts` — `file:open`, `file:open-path`, `file:get-rows`, `file:close`
- In-memory file session registry keyed by UUID

**Acceptance:**

- Open `test_files/FILESYSTEM.csv` and `test_files/SUPER.csv` via IPC test or minimal renderer
- `get-rows` returns correctly parsed cells including quoted commas
- Progress events fire during indexing of a moderately large file

---

## Phase 3 — Preload API and Renderer Shell

**Goal:** Multi-tab UI shell with menu bar, status bar, and loading states.

**Tasks:**

- `preload/index.ts` — expose typed `window.api`
- `app.ts` — top-level controller, menu actions, drag-and-drop
- `tabManager.ts` — tab create/switch/close with unsaved-tag indicator (`*`)
- `index.html` + `main.css` — layout per design spec
- Wire `file:index-progress` to tab loading overlay
- Window close / tab close prompts for unsaved tags

**Acceptance:**

- Open both test CSVs in separate tabs
- Tab titles show filename; loading text updates during indexing
- File → Open dialog works; drag-and-drop opens files

---

## Phase 4 — AG Grid Infinite Row Model

**Goal:** Scrollable grid displaying timeline data from IPC datasource.

**Tasks:**

- `gridConfig.ts` — dynamic column defs, infinite row model options
- `timelineTab.ts` — datasource calling `file:get-rows`
- Super format: checkbox tag column, message truncation (200 chars)
- Row styling for tagged rows (amber) — tags from Phase 5
- Font size menu (View → Increase/Decrease/Reset)
- Status bar row count

**Acceptance:**

- Grid scrolls through 100 000+ rows smoothly (test with larger file)
- Double-click opens field detail popup (Phase 5 can enhance formatting)
- Filesystem and Super column headers match source CSV

---

## Phase 5 — Search, Tags, and Field Detail

**Goal:** Full filtering, tagging persistence, and rich cell inspection.

**Tasks:**

- Search Worker in main process (`file:search`) with progress
- Filtered datasource mapping match indices to virtual rows
- Search match row styling (blue); Clear Search restores full view
- `tagStore.ts` — load/save `.tags.json` in userData
- `file:tag-update`, `file:save-tags` IPC
- Tag checkbox toggles; `*` on tab/window title when dirty
- `fieldDetailWindow.ts` + `formatter.ts` — JSON/XML pretty-print, copy button
- Search menu: current tab, all tabs, clear

**Acceptance:**

- Search finds known strings; Matches count in status bar
- Tags persist across close/reopen of same file
- Close tab with unsaved tags prompts Save / Discard / Cancel
- JSON and XML in SUPER `message` column pretty-print on double-click

---

## Phase 6 — Packaging and Final Acceptance

**Goal:** Distributable Linux builds and full acceptance criteria sign-off.

**Tasks:**

- Finalize `electron-builder.yml` (AppImage, deb, win portable)
- Test `npm run build` from PowerShell on Windows
- Manual test with 500 MB+ CSV (indexing progress, scroll, search)
- README update with build/run instructions
- Remove debug code; ensure GPL headers where appropriate

**Acceptance (from DESIGN_SPEC):**

1. Both CSV formats open and display correctly
2. 500 MB+ file opens without freezing; progress updates during indexing
3. Smooth scroll through 100 000+ rows
4. Search highlights matches; clear restores full view
5. Super timeline tagging with unsaved `*` indicator
6. Tags survive close/reopen via `.tags.json`
7. Unsaved-tag prompts on tab/window close
8. JSON/XML pretty-print in field detail popup
9. `npm run build` succeeds in PowerShell

---

## Out of Scope (All Phases)

Do not implement until explicitly scheduled:

- Graphical/chart view of tagged rows
- Export to HTML or Excel
- Date range filtering
- Column grouping or freeze-panes
- Full-text search index cache
- Real-time as-you-type search

---

## Suggested Review Order

| Phase | Depends on | Est. complexity |
| --- | --- | --- |
| 1 | — | Low |
| 2 | 1 | High |
| 3 | 2 | Medium |
| 4 | 2, 3 | Medium |
| 5 | 4 | High |
| 6 | 5 | Low |

Phases 2 and 4–5 contain the bulk of forensic-viewer logic; Phases 1, 3, and 6 are primarily integration and polish.
