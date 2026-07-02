# Roadmap

Features intentionally deferred from version 2. They are recorded here so the
deferral is a visible, deliberate decision rather than an omission.

## Version 3 candidates

- **HTTP JSON API / MCP server.** The v2 command layer
  (see [docs/AUTOMATION.md](docs/AUTOMATION.md)) is the foundation. v3 adds a
  localhost-only, token-protected HTTP adapter and/or an MCP stdio server on
  top of the same command registry, so external tools and AI agents can drive
  the viewer without touching its internals.
- **Session save/restore** (equivalent to Timeline Explorer's `.tle_sess`):
  reopen a set of files with tags, search terms, and layout intact.
- **Export**: write the current filtered view to CSV or XLSX.
- **Conditional-formatting GUI.** v2 ships XML colour rules
  (`colorrules.xml`); v3 adds an in-app editor for creating and testing rules
  without hand-editing XML.
- **Column grouping / drag-to-group**, Timeline Explorer style.
- **Additional input formats**: TSV, then XLSX (first sheet).

## Not currently planned

- Windows/macOS packaging (the app runs there in development, but Linux —
  SIFT Workstation in particular — is the supported target).
- Editing CSV data in place. The viewer is intentionally read-only apart from
  tagging, which is stored in a sidecar file.
