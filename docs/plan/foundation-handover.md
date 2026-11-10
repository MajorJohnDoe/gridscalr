# Foundation handover

**Purpose:** compact state between foundation phases. Each phase appends one
section. Detailed behaviour belongs in the user guide, architecture map and
findings log; this file records what landed, what is next and what a later phase
must know.

**Related:** [`robustness.md`](robustness.md), [`foundation-findings.md`](foundation-findings.md),
ADR [0010](../adr/0010-project-file-integrity.md)–[0013](../adr/0013-module-first-foundation.md),
epic [#59](https://github.com/MajorJohnDoe/gridscalr/issues/59).

## Phase 1 — Safe save

- **Issue:** [#153](https://github.com/MajorJohnDoe/gridscalr/issues/153) — closed.
- **PR:** [#160](https://github.com/MajorJohnDoe/gridscalr/pull/160) — squash-merged.
- **Commit:** `b745b3b` on `main`.
- **Schema:** unchanged (23). The file stamp is runtime state and is never
  serialized.

### Completed

- Runtime `ProjectFileStamp` (SHA-256, size, mtime), captured on open, after a
  successful save and on package open; cleared on reset.
- Rust `write_project_conditional` hashes the target immediately before the
  rename, rejects a mismatch with a structured `projectConflict` error, writes
  through a flushed sibling temp file, reads the file back and verifies bytes.
- Conflict dialog: **Save as conflicted copy** (default), **Compare with disk
  version**, **Reload from disk**, **Overwrite** (danger), **Cancel**.
  Conflicted copies use `<project> (conflicted copy YYYY-MM-DD HHMM).gridscalr`
  and never touch the disk file.
- Rolling three-file backups in app data keyed by project ID, plus
  **File → Back up now…** and **File → Restore backup…**. Restore opens an
  unsaved copy and never enters recents or packages.
- No-op saves skip the write. Failed saves restore relative document paths in
  memory. Browser fallback still downloads and explicitly does not claim a
  conditional write.

### Modules

```text
src/features/saveIntegrity/
  index.ts        public surface
  stamp.ts        ProjectFileStamp, no-op rule, conflicted-copy name
  conflict.ts     conflict classification and actions
  backup.ts       backup naming/retention helpers
  files.ts        Tauri/platform adapters
  ports.ts        host boundary
  controller.ts   save, conflict and backup orchestration
  ui.ts           conflict, compare and restore dialogs
src-tauri/src/project_write.rs   stamps, conditional write, read-back
src-tauri/src/project_backup.rs  rolling backup commands
```

`ProjectSession.saveProject()` delegates to the feature controller; `App.ts` and
`ProjectSession` remain wiring.

### Decisions

- Comparison in the conflict dialog is metadata-only for now (F-004).
- A missing target for an expected stamp is a conflict, not a silent recreate.
- Backups live in app data, not beside the project, and are keyed by project ID.

### New findings

- F-004 — conflict comparison is metadata-only (P2, deferred to Phase 6).
- F-005 — restored backups cannot resolve relative drawing links when opened
  with a null project path (P2, open).
- F-006 — backup history is keyed only by project ID (P2, open).

### Checks

Full AGENTS pre-commit list plus `npm run test:ui`, `test:import`,
`test:canvas`, `test:count`, `test:touch`, `test:visual`,
`cargo test --lib` and GitHub CI on Ubuntu, Windows and macOS. All green.

### Next

- Phase 2, [#154](https://github.com/MajorJohnDoe/gridscalr/issues/154) — scoped
  autosave, recovery chooser, advisory leases and read-only open. Phase 2 must
  consume the Phase 1 stamp rather than introduce a second file-identity model.
  The Phase 1 conflict dialog is reused for take-over/save conflicts.
