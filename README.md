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
```

## Project layout

```text
src/
  main/       # Electron main process, workers, IPC
  preload/    # contextBridge API
  renderer/   # UI (plain TypeScript + AG Grid)
  shared/     # types and CSV utilities
test_files/   # sample CSV fixtures
resources/    # application icon
PHASE.md      # phased build plan
```

## Test data

Use `test_files/FILESYSTEM.csv` and `test_files/SUPER.csv` for initial validation.
