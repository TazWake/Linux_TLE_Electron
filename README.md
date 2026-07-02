# ElectronTimelineViewer

GPL-licensed desktop timeline CSV viewer for Linux, inspired by Eric Zimmerman's Timeline Explorer. It opens **filesystem timelines**, **Plaso super timelines** (including custom/dynamic column layouts), and **generic CSV files**, indexes large files via line offsets, and provides per-file and cross-file search, row tagging, cell copying, colour rules, and JSON/XML inspection.

**Project status (July 2026):** Version 2 in active development. **Linux AppImage and `.deb` packages** are published on [GitHub Releases](https://github.com/TazWake/Linux_TLE_Electron/releases) (no Node.js required). You can also run from source with `npm run dev` — useful on SIFT Workstation and for development. Features deferred to version 3 are tracked in [ROADMAP.md](ROADMAP.md).

---

## Install from a release (Linux)

Download the latest release from [GitHub Releases](https://github.com/TazWake/Linux_TLE_Electron/releases). Each tagged release includes an **AppImage** and a **`.deb`** for `amd64`.

**AppImage**:

```bash
chmod +x ElectronTimelineViewer-*.AppImage
./ElectronTimelineViewer-*.AppImage
```

AppImage execution requires [FUSE](https://github.com/AppImage/AppImageKit/wiki/FUSE) on the host where you run the app.

**Debian / Ubuntu (.deb)**:

```bash
sudo dpkg -i electron-timeline-viewer_*_amd64.deb
electron-timeline-viewer
```

If the packaged app misbehaves, try a newer release or [run from source](#run-from-source-on-linux) with `ETV_DEBUG=1 npm run dev` and check the terminal for `[ETV]` lines.

---

## Using the application

Once the app is running (from a [release package](#install-from-a-release-linux) or [from source](#run-from-source-on-linux)), you can work with timeline CSVs as follows.

### Open a timeline (or any CSV)

- **File → Open…** (Ctrl+O), click the **+** tab button, or **drag and drop** a `.csv` onto the window. Multiple files can be open at once, each in its own tab.
- The format is detected automatically from the header row:
  - **Filesystem** — the mactime layout `Date,Size,Type,Mode,UID,GID,Meta,File Name`
  - **Super / Plaso** — any header containing the core columns `datetime`, `timestamp_desc`, `source`, and `message`, in any order and with any extra columns (psort output headers are user-configurable)
  - **Generic** — any other parseable CSV header with at least two columns; column names are taken directly from the file
- Designed for files up to **2 GB / 10 million rows** each. Memory is bounded by the line-offset index (roughly 8 bytes per row per file).
- Sample files in `test_files/`: `FILESYSTEM.csv`, `SUPER.csv`, `SUPER_DYNAMIC.csv`, and `GENERIC.csv`.

### Browse and inspect

- Scroll the grid to move through rows. Files with up to 50,000 rows load into a client-side grid; larger files use infinite scroll with chunked loading.
- While indexing, the tab shows **Indexing file…** with a line count.
- **Double-click** a cell (after the grid has finished loading) to open the field detail panel. JSON and XML are pretty-printed — including payloads **embedded inside surrounding text**, such as Sysmon-for-Linux `<Event>` documents inside journal messages.
- **Right-click** a cell for **Copy Cell**, **Copy Row**, or **Copy Row with Headers** (tab-separated). **Ctrl+C** copies the focused cell.
- **View** menu — increase, decrease, or reset font size. Row heights scale with the font.
- **View → Date/Time Format** — display datetime columns as ISO seconds (default), ISO with sub-second (nanosecond-padded) precision, or the original file values. Display-only: values are reformatted by string manipulation and timezones are never shifted.

### Search

- Choose a column (or **All Columns**), enter a term, and click **Search**.
- Matching rows are highlighted; the status bar shows the match count.
- **Clear** or **Search → Clear Search** restores the full file.
- **Search → Find in All Files…** (Ctrl+Shift+F) searches every open file, shows per-file hit counts, and clicking a result jumps to that tab with the matches applied as its filter.

### Tags (all formats)

- Every file gets a **Tag** checkbox column (pinned right). Super timelines reuse their existing `tag` column; other formats get a synthetic one.
- Unsaved tag changes show a `*` on the tab title.
- **File → Save Tags** (Ctrl+S) writes tags to your user data directory (see below).
- **File → Close Tab** (Ctrl+W) or closing the window prompts if tags are unsaved.

### Tag file location (Linux)

Tags are stored as JSON under your user profile, typically:

`~/.config/electron-timeline-viewer/tags/<filename>.tags.json`

### Colour rules

Rows can be colour-coded from an XML rules file. On first run the app creates a commented example at:

`~/.config/electron-timeline-viewer/colorrules.xml`

```xml
<ColorRules>
  <Rule name="Deleted files" column="File Name" match="contains"
        value="(deleted)" background="#ffe0e0"/>
  <Rule name="Auth failures" column="*" match="regex"
        value="authentication failure|failed password" background="#ffd7d7" foreground="#5c0000"/>
</ColorRules>
```

- `column` is a header name (case-insensitive) or `*` for any column; `match` is `contains` (default), `equals`, or `regex`.
- Rules apply in file order; the first match wins. Tagged rows and search highlighting take precedence.
- Edit the file and use **View → Reload Colour Rules** to apply changes without restarting. Invalid rules are skipped and logged, never fatal.

### Automation

Every file operation goes through a typed command registry in the main process; the UI is just one client of it. See [docs/AUTOMATION.md](docs/AUTOMATION.md) for the command reference. An HTTP/MCP adapter on top of the same registry is planned for v3 ([ROADMAP.md](ROADMAP.md)).

---

## Run from source on Linux

Use this path for development, SIFT Workstation troubleshooting, or if the release packages do not run on your host.

### Prerequisites

| Requirement | Notes |
| --- | --- |
| **Node.js 20.19+** (22 LTS recommended) | **Do not use the distro `node` package on SIFT/Ubuntu** — it is often Node 12. Install Node 22 with [nvm](https://github.com/nvm-sh/nvm) and the repo `.nvmrc` (`nvm install && nvm use`). |
| **npm** 9+ | Bundled with Node from nvm. |
| **Git** | To clone the repository. |
| **Display** | A working desktop session (`echo "$DISPLAY"` should print e.g. `:0`). |

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

If Electron’s binary did not download (error: *Electron failed to install correctly* when starting):

```bash
node node_modules/electron/install.js
```

### 2. Run in development mode

Hot reload for the UI; rebuilds main/preload on change:

```bash
npm run dev
```

For troubleshooting file open or grid issues, enable debug logging (also opens DevTools):

```bash
ETV_DEBUG=1 npm run dev
```

Watch the terminal for `[ETV]` lines while opening a file.

### 3. Production build in `out/` (optional)

`npm run build:app` compiles TypeScript and bundles into `out/`. It does **not** produce a standalone installer. Launch with Electron from the project root:

```bash
npm run build:app
npm start
```

**What `out/` contains**

```text
out/
├── main/           # Main process + worker scripts (indexing, search)
├── preload/        # Bridge exposed to the UI as window.api
└── renderer/       # HTML, CSS, and bundled UI (AG Grid)
```

### Smoke test (optional)

Compiles the shared modules and tests them directly (format detection, CSV fallback parsing, colour rules, embedded JSON/XML extraction), validates fixtures, builds `out/`, and briefly launches Electron:

```bash
npm run smoke-test
```

---

## Build commands

| Command | Output | Notes |
| --- | --- | --- |
| `npm run dev` | `out/` (dev build) | Development; starts automatically. |
| `npm run build:app` | `out/` only | Does not start the app — run `npm start` afterward. |
| `npm start` | Uses existing `out/` | After `npm run build:app`. |
| `npm run smoke-test` | — | Fixture parse, build, brief Electron launch. |
| `npm run build:linux` | `dist/` | Local AppImage + `.deb` (same targets as CI releases). |

Release builds are produced by the GitHub Actions workflow when a `v*` tag is pushed; artifacts are attached to the matching [release](https://github.com/TazWake/Linux_TLE_Electron/releases).

On Windows, `npm run dev` and `npm run build:app` work for development; Linux is the primary target platform.

---

## Troubleshooting

### `SyntaxError: Unexpected token '?'` during `npm install`

This almost always means **Node.js is too old** (common on SIFT: `node -v` shows `v12.22.9` from `/usr/bin/node`). Electron 35 requires **Node 20.19+**.

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

### `npm WARN EBADENGINE` during `npm install`

Your Node version is too old. You need **20.19+**; **22 LTS** is recommended:

```bash
nvm install 22
nvm use 22
node -v
rm -rf node_modules
npm install
```

The repo includes a `.nvmrc` (22); from the project directory you can also run `nvm install && nvm use`.

### `npm warn deprecated` (boolean, glob, etc.)

These come from **transitive dev dependencies** of Electron and electron-builder. This project uses npm `overrides` to pull newer `rimraf`, `glob`, `form-data`, and `undici` where possible. You may still see deprecation warnings from Electron tooling — that is npm registry noise, not evidence your install is broken.

A successful install ends with `Install complete.` from the postinstall script.

### `npm audit` reports high severity vulnerabilities

Most findings refer to **Electron itself** (the desktop runtime). Resolving them requires a major Electron upgrade. Do **not** run `npm audit fix --force` unless you intend to upgrade Electron major versions.

### `libva error` / app exits immediately after `Using preload script`

On SIFT and many forensic VMs, VA-API/GPU drivers are missing or broken. Current builds disable hardware acceleration on Linux automatically. After `git pull`:

```bash
nvm use 22
rm -rf out
npm run dev
```

The terminal should **stay running** and a window should open within a few seconds.

If it still exits:

```bash
echo "$DISPLAY"
ELECTRON_ENABLE_LOGGING=1 npm run dev
```

`echo "$DISPLAY"` must print something (e.g. `:0`) on a local desktop. Over plain SSH without X forwarding, Electron cannot open a window.

To force software rendering:

```bash
LIBGL_ALWAYS_SOFTWARE=1 npm run dev
```

On a machine with working GPU drivers, re-enable acceleration with `ETV_ENABLE_GPU=1 npm run dev`.

**`atom_cache` messages** — harmless Chromium log noise once the window is open.

### “Application API failed to load” on startup

The preload script did not attach `window.api`. Remove stale build output and restart:

```bash
rm -rf out
npm run dev
```

The terminal must show `Using preload script: .../out/preload/index.mjs` and must **not** show `Preload failed`.

### Blank popup with “Copy to Clipboard” / “Close” over the grid

This was the **field detail overlay** opening incorrectly (not an Electron crash). Current builds:

- Keep the overlay hidden until you **double-click** a cell with real content
- Ignore accidental double-clicks for 800 ms after the grid mounts (file-dialog clicks often land on the grid)
- Dismiss with **Close**, **Escape**, or a click on the dimmed backdrop

If the grid loads but the overlay still appears, `git pull`, `rm -rf out`, and run with `ETV_DEBUG=1 npm run dev`. Paste any `[ETV] renderer:` lines from the terminal.

### CSV open / grid issues

Run with debug logging:

```bash
ETV_DEBUG=1 npm run dev
```

Expected sequence when opening `test_files/FILESYSTEM.csv`:

```text
[ETV] open: begin /path/to/FILESYSTEM.csv
[ETV] open: detected format filesystem
[ETV] index: starting worker ...
[ETV] open: indexed FILESYSTEM.csv
[ETV] renderer: grid mounting FILESYSTEM.csv
[ETV] ipc: → file:get-rows
[ETV] ipc: ← file:get-rows ok
[ETV] renderer: grid mounted FILESYSTEM.csv
```

IPC handlers do not throw (errors log as `[ETV] ... FAILED`). Super-timeline rows with embedded XML quotes use relaxed CSV parsing plus a fallback parser.

### “Unable to index file — Cannot convert undefined to a BigInt”

Fixed in current builds. Update, remove stale output, and reinstall:

```bash
git pull
rm -rf out node_modules
npm install
npm run dev
```

### Blank window after `npm start`

Run `npm run build:app` first. `out/renderer/index.html` must exist.

### Release AppImage or `.deb` will not start

- **AppImage:** ensure FUSE is available (`libfuse2` on many Debian/Ubuntu systems).
- **GPU / VM issues:** same as [libva error](#libva-error--app-exits-immediately-after-using-preload-script) — try `LIBGL_ALWAYS_SOFTWARE=1 ./ElectronTimelineViewer-*.AppImage` or run from source with `ETV_DEBUG=1 npm run dev`.
- **`.deb`:** after install, launch `electron-timeline-viewer` from a terminal and note any errors.

---

## Features (v2)

- **Filesystem**, **Plaso Super** (fixed or dynamic columns), and **generic CSV** formats with headers taken from the file
- Multiple files open simultaneously in tabs; offset indexing for large files (up to 2 GB / 10 million rows each)
- AG Grid with client-side model (≤50,000 rows) or infinite scroll (larger files)
- Column-scoped search per file, plus **Find in All Files** with per-file hit counts and click-to-filter
- Row tagging for every format (`.tags.json` in user data)
- Cell/row copy via context menu and Ctrl+C
- JSON/XML pretty-print in the field detail popup, including payloads embedded in surrounding text
- Colour rules from `colorrules.xml` with live reload
- Datetime display formats (ISO seconds, ISO sub-second, original) with no timezone shifting
- Font size control with dynamic row heights
- Typed command layer for automation ([docs/AUTOMATION.md](docs/AUTOMATION.md))

Deferred to version 3 (HTTP/MCP API, session save/restore, export, rule editor GUI, column grouping, TSV/XLSX input): see [ROADMAP.md](ROADMAP.md).

## Project layout

```text
src/
  main/       # Electron main process, workers, IPC wrappers
    commands/ # Command registry — the automation surface
  preload/    # contextBridge API (window.api)
  renderer/   # UI (TypeScript + AG Grid)
  shared/     # Types, CSV utilities, colour rules, command schema
docs/         # AUTOMATION.md — command layer reference
test_files/   # Sample FILESYSTEM, SUPER, SUPER_DYNAMIC, GENERIC CSVs
resources/    # Application icon
out/          # Compiled app (after build:app) — launch with npm start
dist/         # Local packages (after build:linux)
PHASE.md      # Phased build plan
ROADMAP.md    # Features deferred to version 3
```

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

## Windows development

The repository can be developed on Windows (`npm run dev`, `npm run build:app`). Linux is the primary deployment target; release packages are built via `.github/workflows/release-linux.yml` and `electron-builder.yml`.
