# Automation and the Command Layer

ElectronTimelineViewer v2 routes every file operation through a **command
registry** in `src/main/commands/`. The UI's IPC channels are thin wrappers
around the same functions, which means anything the UI can do is also
available programmatically. This document describes that surface.

> **Scope note:** in v2 the command layer is reachable from the renderer
> process only (via IPC). A localhost HTTP API and an MCP server that expose
> the same registry to external tools are planned for v3 — see
> [ROADMAP.md](../ROADMAP.md).

## Architecture

```
┌────────────┐   IPC (file:open, …)      ┌──────────────────┐
│  Renderer   │ ───────────────────────▶ │  IPC wrappers     │
│  (UI)       │   IPC (command:invoke)   │  src/main/        │
└────────────┘ ───────────────────────▶ │  ipcHandlers.ts   │
                                          └────────┬─────────┘
                                                   ▼
                                          ┌──────────────────┐
                                          │ Command registry  │
                                          │ src/main/commands │
                                          └────────┬─────────┘
                                                   ▼
                                     file sessions, indexer and
                                     search workers, tag store
```

- The registry is defined in `src/main/commands/index.ts`; request and
  response types live in `src/shared/commands.ts`.
- Commands never touch Electron UI directly. Progress events and error
  dialogs go through an injected `CommandContext`
  (`src/main/commands/context.ts`), so a headless host can replace them.

## Invoking commands from the renderer

The preload API exposes a generic dispatcher:

```ts
const response = await window.api.invokeCommand('app.status')
if (response.ok) {
  console.log(response.result) // { version: '2.0.0', openFiles: 1 }
} else {
  console.error(response.error)
}
```

Failures are returned as `{ ok: false, error: string }` rather than thrown.

## Command reference

| Command        | Request                                        | Response |
| -------------- | ---------------------------------------------- | -------- |
| `app.status`   | `{}`                                           | `{ version, openFiles }` |
| `file.open`    | `{ filePath }`                                 | `FileMetadata` (indexing starts in background) |
| `file.list`    | `{}`                                           | `FileMetadata[]` |
| `file.getRows` | `{ fileId, startRow, endRow, rowIndexMap? }`   | `RowData[]` |
| `file.search`  | `{ fileId, column, term }`                     | `{ matchingRowIndices }` |
| `search.all`   | `{ term }`                                     | `[{ fileId, fileName, matchCount, matchingRowIndices }]` |
| `tag.update`   | `{ fileId, rowIndex, tagged }`                 | `{ ok }` |
| `tag.save`     | `{ fileId }`                                   | `{ saved }` |
| `file.close`   | `{ fileId }`                                   | `{ closed }` |
| `rules.load`   | `{}`                                           | `{ xml }` — raw colorrules.xml content or `null` |

Notes:

- `file.open` returns immediately with `indexing: true` and `rowCount: 0`.
  Listen for the `file:index-complete` event (or poll `file.list`) before
  requesting rows.
- `file.search` with `column: "All Columns"` searches every column.
- `file.getRows` accepts an optional `rowIndexMap` (e.g. the
  `matchingRowIndices` from a search) to page through filtered results.

## Events

Commands emit progress through the context's `sendEvent`, which the Electron
shell forwards to the renderer:

| Channel               | Payload                             |
| --------------------- | ----------------------------------- |
| `file:index-progress` | `{ fileId, linesIndexed, phase }`   |
| `file:index-complete` | `{ fileId, rowCount }`              |
| `file:index-failed`   | `{ fileId }`                        |

## Adding a command

1. Add the request/response types to `CommandMap` in
   `src/shared/commands.ts`.
2. Implement the function in the appropriate module under
   `src/main/commands/`.
3. Register it in the `handlers` map in `src/main/commands/index.ts`,
   validating the payload at the boundary.
4. (Optional) add a dedicated IPC wrapper in `src/main/ipcHandlers.ts` if the
   UI needs a typed method on `window.api`.
