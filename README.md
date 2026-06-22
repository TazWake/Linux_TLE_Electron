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
| **Node.js 20.19+** (22 LTS recommended) | **Do not use the distro `node` package on SIFT/Ubuntu** — it is often Node 12 (`node -v` shows `v12.x`). That is too old and `npm install` will fail. Install Node 22 with [nvm](https://github.com/nvm-sh/nvm) and the repo `.nvmrc` (`nvm install && nvm use`). |
| **npm** 9+ | Bundled with Node from nvm. |
| **Git** | To clone the repository. |
| **Build tools** (for packaging) | On Debian/Ubuntu: `sudo apt install -y fakeroot dpkg rpm squashfs-tools` (AppImage/deb targets). |

**SIFT Workstation / Ubuntu:** check Node **before** `npm install`:

```bash
node -v
which node
```

You need `v20.19.0` or newer (prefer `v22.x`). If you see `v12.x` from `/usr/bin/node`, install nvm and Node 22 first (see [Troubleshooting](#syntaxerror-unexpected-token--during-npm-install)).

### 1. Clone and install

```bash
git clone https://github.com/TazWake/Linux_TLE_Electron.git
cd Linux_TLE_Electron
nvm install && nvm use    # skip if you already have Node 22 active
node -v                   # must be >= 20.19.0
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

### `SyntaxError: Unexpected token '?'` during `npm install`

This almost always means **Node.js is too old** (common on SIFT Workstation: `node -v` shows `v12.22.9` from `/usr/bin/node`). Electron 35 and the build tools require **Node 20.19+**.

```bash
node -v
which node
```

Upgrade with nvm, then reinstall:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
cd ~/test/Linux_TLE_Electron   # your clone path
nvm install 22
nvm use 22
node -v                        # should show v22.x.x
rm -rf node_modules
npm install
```

The project `preinstall` script blocks install on unsupported Node and prints this guidance automatically.

**`npm WARN EBADENGINE` during `npm install`**  
Your Node version is too old (Node 18 is common on Ubuntu LTS). Check what you are running:

```bash
node -v
```

You need **20.19+**; **22 LTS** is recommended. Upgrade with [nvm](https://github.com/nvm-sh/nvm), then reinstall dependencies:

```bash
nvm install 22
nvm use 22
node -v
rm -rf node_modules
npm install
```

The repo includes a `.nvmrc` (22); from the project directory you can also run `nvm install && nvm use`.

Warnings alone do not mean install failed unless `npm install` exits with a non-zero code.

**`npm warn deprecated` (boolean, glob, etc.)**  
These come from **transitive dev dependencies** of Electron and electron-builder (tools used to compile and package the app). They are **not** shipped in the AppImage or `.deb`.

This project uses npm `overrides` to pull newer `rimraf`, `glob`, `form-data`, and `undici` where possible. You may still see a `boolean` or `glob` deprecation warning from Electron tooling; the `glob` author deprecates all releases below the latest — that is npm registry noise, not evidence your install is broken.

A successful install ends with `Install complete.` from the postinstall script and an `audited N packages` summary — not with an error exit code.

**`npm audit` reports high severity vulnerabilities**  
Most remaining findings refer to **Electron itself** (the desktop runtime used only while developing or packaging). Resolving them requires a major Electron upgrade and is tracked separately from application code. Overrides address several **build-tool** advisories (`form-data`, `undici`). Treat audit output as a maintenance signal for developers, not as a flaw in the GPL application users install. Do **not** run `npm audit fix --force` unless you intend to upgrade Electron major versions.

**`npm warn allow-scripts` (npm 11+)**  
npm is noting that install scripts (Electron, esbuild) were not pre-approved on your machine. Run `npm approve-scripts electron esbuild` if your environment requires it. This is a local npm policy message, not an application error.

**`libva error` / app exits immediately after `Using preload script`**

On SIFT and many forensic VMs, VA-API/GPU drivers are missing or broken. Chromium logs `libva error: vaGetDriverNameByIndex()` and may **quit before any window appears**, returning you to the shell prompt.

Current builds disable hardware acceleration on Linux automatically. After `git pull`, try:

```bash
nvm use 22
rm -rf out
npm run dev
```

The terminal should **stay running** (no immediate shell prompt) and a window should open within a few seconds.

If it still exits:

```bash
echo "$DISPLAY"
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

`echo "$DISPLAY"` must print something (e.g. `:0`) when using a local desktop session. Over plain SSH without X forwarding, Electron cannot open a window.

To test GPU drivers are the issue, force software rendering:

```bash
LIBGL_ALWAYS_SOFTWARE=1 npm run dev
```

On a machine with working GPU drivers, you can re-enable acceleration with `ETV_ENABLE_GPU=1 npm run dev`.

**`atom_cache` messages** — harmless Chromium log noise once the window is open.

**“Application API failed to load” on startup**  
The preload script did not attach `window.api`. Remove stale build output and restart:

```bash
rm -rf out
npm run dev
```

The terminal must show `Using preload script: .../out/preload/index.mjs` and must **not** show `Preload failed`.

**App freezes with a “Copy” / “Close” error dialog (empty message)**

Electron on Linux shows this broken modal when an IPC handler **throws** (often a CSV parse error on `file:get-rows`). Current builds:

- Never throw from IPC handlers (errors go to the terminal as `[ETV]` lines)
- Use relaxed CSV parsing plus a Super-timeline fallback parser
- Skip row loads until indexing has finished

After `git pull`, run with debug logging and watch the terminal while opening a file:

```bash
ETV_DEBUG=1 npm run dev
```

You should see lines like:

```text
[ETV] open: begin /path/to/FILESYSTEM.csv
[ETV] open: detected format filesystem
[ETV] index: starting worker ...
[ETV] open: indexed FILESYSTEM.csv
[ETV] ipc: → file:get-rows
```

If something fails, paste the `[ETV] ... FAILED` lines (not just the `libva` line).

If `[ETV] ipc: ← file:get-rows ok` appears but the window still freezes, the failure is in the **renderer** (usually AG Grid). With `ETV_DEBUG=1`, DevTools opens automatically and the terminal shows `[ETV renderer]` lines. Current builds set `theme: 'legacy'` on AG Grid v33 because the UI imports the CSS theme files (`ag-theme-quartz`).

**App freezes with a “Copy” / “Close” error dialog when opening a Super CSV**  
Usually a row-parse failure on Sysmon/XML `message` fields (unquoted embedded `"` characters). Current builds use relaxed CSV parsing for Plaso exports. Update, `rm -rf out`, and `npm run dev`. If a row still fails, check the terminal for `file:get-rows failed` — the grid will stay responsive instead of locking the window.

**“Unable to index file — Cannot convert undefined to a BigInt”**  
Fixed in current builds (`fs.readSync` return value was mis-handled in indexer workers). Update the repo, remove stale output, and rebuild:

```bash
git pull
rm -rf out node_modules
npm install
npm run dev
```

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
