# ADR 0011: Explicit page order and source replacement

- Status: Accepted
- Date: 2026-11-10
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

GridScalr currently derives pages from the `documents` array and stores page
references as a 1-based global number:

- `MarkupItem.page`;
- `Layer.homePage`;
- `Layer.pageState` keys;
- `Project.pages` keys.

Every structural operation has to renumber those references. Deleting a page
remaps later items and page state; importing appends at the end; pages cannot be
inserted or reordered. The append-only rule protects the numeric references, but
it is too rigid for production work.

Real drawing sets change:

- an architect issues a revision where sheets A and B swap places;
- a sheet is added or removed in the middle;
- a user wants to start from an empty project and import pages from several
  sources;
- a user wants to drag pages into a different order.

Strict append-only forces users to rebuild large parts of a project. The root
cause is not the append rule; it is numeric page identity.

## Decision

Introduce an explicit page list with stable page IDs.

```ts
type PageId = string;

interface PageRecord {
  id: PageId;
  documentId: string;
  /** 1-based page inside the source document. */
  localPage: number;
  state: PageState;
}

interface MarkupItem {
  pageId: PageId;
}

interface Layer {
  homePageId?: PageId;
  pageState?: Record<PageId, LayerPageState>;
}
```

Rules:

1. `Project.pages` is an ordered `PageRecord[]`. Page numbers are derived from
   the array order; they are display data, not identity.
2. Items and layers reference `PageId`. No persistent reference uses a numeric
   page index.
3. A project may have zero documents and zero pages. Empty projects are valid
   for schema 24 and later and can be filled by importing pages.
4. Import appends by default. The import dialog may insert at a chosen position.
5. Drag-and-drop reorder changes the page list. Items and layers stay attached
   to their `PageId`.
6. Delete removes the page record, its items and its layer page state. Later
   pages are not renumbered in stored data.
7. Duplicate creates a new `PageId`; insert adds a page record at the chosen
   index.
8. A page deletion must not leave an empty layer pointing at a different page.
   Remove the layer when it loses its last page, or prompt for cleanup.
9. Revision comparison matches pages by `PageId` first, then by document and
   local page.
10. Append-only remains the default import behaviour, but it is no longer a
    model law.

### Source replacement

A new source document may have the same pages in a different order, an added
page or a missing page. Do not build a revision DAG for this.

1. The user chooses **Replace source…** for a document.
2. The app reads the new page count, checksum and page sizes.
3. The app shows a mapping from old page to new page with previews.
4. The default mapping is the same page index; the user can remap.
5. Mapped pages keep their `PageId`, items and page state.
6. Unmatched old pages stay on the old `DocumentRef` as **superseded** until the
   user reviews them. Their items are preserved.
7. Add the new `DocumentRef`, or update the old one when every page is mapped.
8. Warn when page size, calibration or drawing scale changes.
9. Removing superseded pages is an explicit cleanup action with a recovery
   checkpoint.

The superseded-document approach preserves unmatched pages without a revision
tree. A file hash is enough to identify the new source; no `revisionId` or
parent relationship is needed.

## Migration

Schema 23 → 24:

1. Build the page list from the document order and `excludedPages`.
2. Assign a new `PageId` to each included page.
3. Map `MarkupItem.page`, `Layer.homePage` and `Layer.pageState` keys to
   `PageId`.
4. Move `Project.pages[number]` into the matching `PageRecord.state`.
5. Report invalid page references instead of silently remapping them.
6. Write schema 24 and keep all existing migration tests for schemas 1–23.

The migration is deterministic for a given input file and has a fixture for the
previous schema.

## Consequences

- Page insert, reorder, delete and source replacement become safe.
- Empty projects become a supported starting point.
- Every call site that reads `item.page` must use a page-number resolver or
  `PageId` lookup. This is a large, mechanical refactor.
- Reports and exports continue to display page numbers, but the numbers can
  change after a reorder.
- Markups views and filters remain based on the current page, not a stored
  number.
- The append-only product rule is removed from `AGENTS.md` and replaced with an
  explicit page-order rule.
- A page deletion still needs a clear confirmation and recovery checkpoint.

## Enforcement

- Migration and round-trip tests for schema 23 → 24.
- Stateful tests over insert, delete, duplicate, reorder, source replacement and
  undo/redo.
- Invariant checks for every item `pageId`, layer `homePageId` and page-state
  key.
- Empty-project tests for save, load, canvas, reports and import.
- Comparison tests with inserted and reordered pages.

## Related

- [`docs/plan/robustness.md`](../plan/robustness.md)
- ADR [0010](0010-project-file-integrity.md)
- ADR [0012](0012-source-storage-modes.md)
- PR [#152](https://github.com/MajorJohnDoe/gridscalr/pull/152)
- Issue [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53)
