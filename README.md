# ElectronTimelineViewer

GPL-licensed desktop timeline CSV viewer for Linux. It opens **filesystem timelines** and **Plaso super timelines**, handles large CSVs via offset indexing, and provides search, scrolling, and row tagging.

---

## Using the application

Once the app is running (see [Build on Linux](#build-on-linux) below), you can work with timeline CSVs as follows.

### Open a timeline

- **File → Open…** (Ctrl+O), or click the **+** tab button, or **drag and drop** a `.csv` file onto the window.
- Two formats are supported (detected automatically from the header row):
  - **Filesystem** — header starts with `Date,Size,Type,Mode,UID,GID,Meta,File Name`
  - **Super / Plaso** — header starts with `datetime,timestamp_desc,source,source_long,message,parser,display_name,tag`
- Sample files are in `test_files/FILESYSTEM.csv` and `test_files/SUPER.csv` for a first run.

### Browse and inspect

- Scroll the grid to move through rows (data is loaded in chunks; very large files are supported).
- While a large file is indexing, the tab shows **Indexing file…** with a line count.
- **Double-click** a cell to open a detail panel (JSON/XML in the `message` column is pretty-printed when possible).
- **View** menu — increase, decrease, or reset font size.

### Search

- Choose a column (or **All Columns**), enter a term, and click **Search**.
- Matching rows are highlighted; the status bar shows the match count.
- **Clear** or **Search → Clear Search** restores the full file.
- **Search → Search in All Tabs…** runs the same term across every open tab.

### Tags (Super timelines only)

- Use the **Tag** checkbox column on the right to mark rows.
- Unsaved tag changes show a `*` on the tab title.
- **File → Save Tags** (Ctrl+S) writes tags to your user data directory (see below).
- **File → Close Tab** (Ctrl+W) or closing the window prompts if tags are unsaved.

### Tag file location (Linux)

Tags are stored as JSON alongside your user profile, typically:

`~/.config/ElectronTimelineViewer/tags/<filename>.tags.json`

---

## Quick start (pre-built binary)

If you only want to **use** the app, download a build from [GitHub Releases](https://github.com/TazWake/Linux_TLE_Electron/releases) — no Node.js required.

**AppImage**

```bash
chmod +x ElectronTimelineViewer-*.AppImage
./ElectronTimelineViewer-*.AppImage
```

**Debian / Ubuntu (.deb)**

```bash
sudo dpkg -i electron-timeline-viewer_*_amd64.deb
electron-timeline-viewer
```

---

## Build on Linux

These steps are for building and running from source on a Linux machine (native or WSL).

### Prerequisites

| Requirement | Notes |
|-------------|--------|
| **Node.js 20.19+** (22 LTS recommended) | Node 18 is unsupported; you will see `npm WARN EBADENGINE` warnings. Check with `node -v`. Use [nvm](https://github.com/nvm-sh/nvm) and the repo `.nvmrc` (`nvm install && nvm use`). |
| **npm** 9+ | Bundled with Node. |
| **Git** | To clone the repository. |
| **Build tools** (for packaging) | On Debian/Ubuntu: `sudo apt install -y fakeroot dpkg rpm squashfs-tools` (AppImage/deb targets). |

### 1. Clone and install

```bash
git clone https://github.com/TazWake/Linux_TLE_Electron.git
cd Linux_TLE_Electron
npm install
```

If Electron’s binary did not download (error: *Electron failed to install correctly* or *Electron uninstall* when starting):

```bash
node node_modules/electron/install.js
```

### Run the app

You have three common paths. Pick one.

#### A. Development mode (recommended while coding)

Hot reload for the UI; rebuilds main/preload on change:

```bash
npm run dev
```

#### B. Production build in `out/`, run without packaging

`npm run build:app` **only compiles** TypeScript and bundles into `out/`. It does **not** produce a standalone AppImage or installable binary, and nothing in `out/` is executable on its own — you launch it with Electron from the project root:

```bash
npm run build:app
npm start
```

Equivalent:

```bash
npm run build:app
npm run preview
```

Both `npm start` and `npm run preview` load `out/main/index.js` (see `main` in `package.json`) and open the window. Use this to verify a production build before packaging.

**What `out/` contains**

```text
out/
├── main/           # Main process + worker scripts (indexing, search)
├── preload/        # Bridge exposed to the UI as window.api
└── renderer/       # HTML, CSS, and bundled UI (AG Grid)
```

#### C. Packaged installable build in `dist/`

Creates an AppImage and `.deb` you can copy to other machines:

```bash
npm run build:linux
```

Output (names may include the version from `package.json`):

```text
dist/
├── ElectronTimelineViewer-*.AppImage
└── electron-timeline-viewer_*_amd64.deb
```

Run the AppImage or install the `.deb` as in [Quick start](#quick-start-pre-built-binary).

On Windows, `npm run build` produces a portable `.exe` in `dist/` instead.

### Smoke test (optional)

Validates fixtures, compiles `out/`, and briefly launches Electron:

```bash
npm run smoke-test
```

---

## Build outputs at a glance

| Command | Output | How to run |
|---------|--------|------------|
| `npm run dev` | `out/` (dev build) | App starts automatically |
| `npm run build:app` | `out/` only | **Does not start the app** — run `npm start` or `npm run preview` |
| `npm run build:linux` | `dist/` (AppImage, `.deb`) | Run/install artifacts from `dist/` |
| `npm start` | Uses existing `out/` | After `npm run build:app` |

---

## Troubleshooting

**`npm WARN EBADENGINE` during `npm install`**  
Your Node version is too old. Upgrade to Node 20.19+ or 22 LTS, remove `node_modules`, and run `npm install` again. Warnings alone do not mean install failed unless npm exits with an error code.

**App window opens but File → Open does nothing**  
Restart with `npm run dev` after a clean `npm install`. Ensure `node_modules/electron/dist/electron` exists.

**Blank window after `npm start`**  
Run `npm run build:app` first. `out/renderer/index.html` must exist.

**Packaging fails on Linux**  
Install `fakeroot`, `dpkg`, and `squashfs-tools`. AppImage builds also need FUSE support on the host where you *run* the AppImage (not necessarily where you build it).

---

## Features

- Plaso **Super** and **Filesystem** timeline CSV formats
- Offset indexing for large files (up to 2 GB / 10 million rows)
- AG Grid infinite scroll with lazy row loading
- Column-scoped search with match filtering
- Super timeline row tagging (`.tags.json` in user data)
- JSON/XML pretty-print in field detail popup

## Project layout

```text
src/
  main/       # Electron main process, workers, IPC
  preload/    # contextBridge API (window.api)
  renderer/   # UI (TypeScript + AG Grid)
  shared/     # Types and CSV utilities
test_files/   # Sample FILESYSTEM.csv and SUPER.csv
resources/    # Application icon
out/          # Compiled app (after build:app) — launch with npm start
dist/         # Packaged installers (after build:linux)
PHASE.md      # Phased build plan
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Windows builds

Development and portable Windows builds are supported from the same repository. Use `npm run dev` and `npm run build` on Windows; see `electron-builder.yml` for targets. Linux packaging must be run on Linux or WSL (`npm run build:linux`).
