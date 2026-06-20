# ElectronTimelineViewer

GPL-licensed desktop timeline CSV viewer for Linux and Windows, built with Electron. It opens filesystem timelines and Plaso super timelines, supports large files via offset indexing, search, and row tagging.

## Requirements

- Node.js 20+
- npm

## Deployment (end users)

Pre-built binaries are published on [GitHub Releases](https://github.com/TazWake/Linux_TLE_Electron/releases). Download the asset for your platform — no Node.js install required.

### Windows

1. Download `ElectronTimelineViewer-<version>.exe` from the latest release.
2. Run the portable executable. No installer is required; you may place the file anywhere (for example `C:\Tools\`).
3. Open a timeline CSV via **File → Open** or drag-and-drop onto the window.

### Linux

Linux builds (AppImage and `.deb`) are produced on a Linux host or WSL. When available on Releases:

**AppImage**

```bash
chmod +x ElectronTimelineViewer-<version>.AppImage
./ElectronTimelineViewer-<version>.AppImage
```

**Debian/Ubuntu (.deb)**

```bash
sudo dpkg -i electron-timeline-viewer_<version>_amd64.deb
electron-timeline-viewer
```

Tag files for Super timelines are stored under your user data directory (typically `~/.config/ElectronTimelineViewer/tags/` on Linux).

## Build from source (developers)

Clone the repository and install dependencies:

```powershell
git clone https://github.com/TazWake/Linux_TLE_Electron.git
cd Linux_TLE_Electron
npm install
```

If `npm run dev` reports **Electron failed to install correctly**, the Electron binary did not download (often because install scripts were blocked). Run:

```powershell
node node_modules/electron/install.js
npm run dev
```

### Development

```powershell
npm run dev
```

### Compile only

```powershell
npm run build:app   # output in out/
```

### Package for distribution

```powershell
npm run build       # Windows: portable .exe in dist/
npm run build:linux # Linux: AppImage and .deb in dist/ (requires Linux or WSL)
```

Packaged output is written to `dist/` by default.

If a previous build left files locked on Windows, build to an alternate folder:

```powershell
npx electron-builder --win portable --config.directories.output=release
```

### Smoke test

After `npm install`, validate fixtures, compilation, and a brief application launch:

```powershell
npm run smoke-test
```

For the launch step, either the development Electron binary or a packaged executable (`release/` or `dist/`) must exist. Run `npm run build` first if the dev binary is missing.

## Publishing a release (maintainers)

1. Bump `version` in `package.json` if needed.
2. Run tests and smoke test:

   ```powershell
   npm run smoke-test
   npm run build
   ```

   On Linux, also run `npm run build:linux` and attach AppImage/deb assets.

3. Commit and push with a signed commit:

   ```powershell
   git add .
   git commit -S -m "Release v1.0.0"
   git push origin main
   ```

4. Tag and create a GitHub release with binaries:

   ```powershell
   git tag -s v1.0.0 -m "ElectronTimelineViewer v1.0.0"
   git push origin v1.0.0
   gh release create v1.0.0 "dist/ElectronTimelineViewer 1.0.0.exe" --title "v1.0.0" --notes "Initial release. Windows portable build."
   ```

Replace paths and notes as appropriate when adding Linux artifacts.

## Features

- Opens Plaso **Super** and **Filesystem** timeline CSV formats
- Offset-based indexing for large files (up to 2 GB / 10 million rows)
- AG Grid infinite scroll with lazy row loading
- Column-scoped search with match filtering and progress feedback
- Super timeline row tagging persisted to `.tags.json` in userData
- JSON/XML pretty-print in field detail popup (double-click a cell)

## Project status

Phases 1–5 from `PHASE.md` are implemented. Phase 6 packaging is complete for Windows; Linux release artifacts should be built on a Linux host before publishing.

## Project layout

```text
src/
  main/       # Electron main process, workers, IPC
  preload/    # contextBridge API
  renderer/   # UI (plain TypeScript + AG Grid)
  shared/     # types and CSV utilities
scripts/      # smoke-test.mjs, create-icon.ps1
test_files/   # sample CSV fixtures
resources/    # application icon (icon.png)
PHASE.md      # phased build plan
```

## Test data

Use `test_files/FILESYSTEM.csv` and `test_files/SUPER.csv` for initial validation.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).
