# ADR 0010: Project-file integrity and concurrent editing

- Status: Accepted
- Date: 2026-11-10
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

GridScalr is local-first. The `.gridscalr` project references source PDF/TIF
drawings by path and SHA-256 and is itself the source of truth for pages,
layers, measurements, symbols, counts and quantities.

A project file can change outside GridScalr while it is open. The common case is
a cloud-synced folder that is opened on two computers: the second save
overwrites the first without warning. The same risk exists on network shares,
with two app windows, and after a crash where an older in-memory project is
saved over a newer file.

The current save path is atomic but unconditional:

- `saveProject()` serialises the project and writes it;
- `atomic_write()` flushes a temporary file and renames it over the target;
- no step reads the current disk version before the rename;
- autosave stores one IndexedDB record under the key `current`;
- there is no lock, session marker or recovery comparison.

Atomicity prevents a half-written file. It does not prevent last-writer-wins.

## Decision

Treat every project save as a compare-and-swap against the file version the
editor loaded.

1. **File stamp.** Capture SHA-256, size and mtime when a project is opened and
   after every successful save. The hash is authoritative; mtime is a fast
   pre-check.
2. **Conditional write.** Add a Rust command that re-reads and hashes the target
   immediately before the rename. A mismatch returns a structured conflict
   error. The browser fallback keeps download-based saving and does not claim a
   conditional write.
3. **Conflict dialog.** The default action is **Save as conflicted copy**.
   Secondary actions are **Compare with disk version**, **Reload from disk**,
   **Overwrite** and **Cancel**. No silent overwrite.
4. **Read-back.** After writing, read the file back, hash it and verify the
   written bytes.
5. **Backups.** Keep automatic rolling backups in app data, keyed by project ID.
   Keep structural-operation checkpoints separately. Provide an explicit
   **Backup now…** action and a **Restore backup…** flow that opens the backup
   as a copy by default. Do not create an automatic `.bak` beside a
   cloud-synced project.
6. **Autosave.** Store one record per project identity and instance, with the
   base file hash. Never auto-restore a recovery snapshot over a changed disk
   file. The single `current` record is retired.
7. **Open-elsewhere warning.** Use a sidecar lease file with instance ID, opened
   time, heartbeat, project hash, host label and app version. A live lease
   offers **Open read-only** (default), **Take over** or **Cancel**. A stale
   lease is information, never a block. The lease is advisory; the conditional
   write is the guarantee.
8. **No revision DAG.** A file hash, size and mtime are enough for the first
   version. Do not add `revisionId`, `parentRevisionId` or a git-like history.
9. **No unnecessary saves.** A Save with no dirty changes does not rewrite the
   file.
10. **Relative paths.** A failed save must restore the in-memory relative
    document paths; serialisation must not leave the open project pointing at a
    path that was never written.

## Implementation constraints

- The conditional check and the rename belong in Rust, close to each other.
- The conflict response carries the current hash, size and mtime so the UI can
  describe the disk version.
- Backups exclude packages and recent-file lists.
- Recovery records are pruned by age and count.
- The source-drawing write guard still applies to every save, backup, export and
  package path.
- Lock files are never deleted unless the current instance owns them.

## Consequences

- A second machine cannot silently lose the first machine's work.
- A user can recover from a bad save or a crash without relying on the cloud
  provider.
- The app gains conflict, backup and recovery UI, plus a new Rust command.
- Autosave storage grows slightly because records are scoped per project.
- The desktop and browser fallbacks behave differently; the documentation must
  say so.
- A lock file is still only a warning. Sleeping laptops and cloud clients make
  it unreliable.

## Enforcement

- `docs/plan/robustness.md` records the phases and invariants.
- Tests cover an external file change between open and save, conflicted copies,
  overwrite, reload, read-back failure, two-project autosave and failed-save
  relative paths.
- Rust tests cover conditional writes and a crash between temporary write and
  rename.
- `AGENTS.md` makes conditional writes and conflict preservation mandatory.

## Related

- [`docs/plan/robustness.md`](../plan/robustness.md)
- ADR [0011](0011-page-list-and-source-replacement.md)
- ADR [0012](0012-source-storage-modes.md)
- Issue [#44](https://github.com/MajorJohnDoe/gridscalr/issues/44)
- Issue [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53)
