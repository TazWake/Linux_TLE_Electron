# ElectronTimelineViewer

GPL-licensed desktop timeline CSV viewer for Linux, built with Electron. It opens filesystem timelines and Plaso super timelines, supports large files via offset indexing, search, and row tagging.

## Requirements

- Node.js 20+
- npm

## Development (Windows PowerShell)

```powershell
npm install
npm approve-scripts electron
npm rebuild electron
npm run dev
```

If `npm run dev` reports **Electron uninstall**, the Electron binary was not downloaded (usually because install scripts were blocked). Run `npm approve-scripts electron` and `npm rebuild electron`, then try again.

## Build

```powershell
npm run build:app   # compile to out/
npm run build       # compile and package (AppImage, deb, Windows portable)
npm run build:linux # compile and package Linux targets only (AppImage, deb)
```

Packaged output is written to `dist/`. On Windows, `npm run build` produces a portable `.exe`; Linux targets require WSL or a Linux host for full packaging tests.

## Features

- Opens Plaso **Super** and **Filesystem** timeline CSV formats
- Offset-based indexing for large files (up to 2 GB / 10 million rows)
- AG Grid infinite scroll with lazy row loading
- Column-scoped search with match filtering and progress feedback
- Super timeline row tagging persisted to `.tags.json` in userData
- JSON/XML pretty-print in field detail popup (double-click a cell)

## Project status

Phases 1–5 from `PHASE.md` are implemented. Phase 6 (packaging polish and acceptance testing) is in progress — builds succeed on Windows; manual validation with very large CSVs is recommended before release.

## Project layout

```text
src/
  main/       # Electron main process, workers, IPC
  preload/    # contextBridge API
  renderer/   # UI (plain TypeScript + AG Grid)
  shared/     # types and CSV utilities
test_files/   # sample CSV fixtures
resources/    # application icon (icon.png)
PHASE.md      # phased build plan
```

## Test data

Use `test_files/FILESYSTEM.csv` and `test_files/SUPER.csv` for initial validation.
