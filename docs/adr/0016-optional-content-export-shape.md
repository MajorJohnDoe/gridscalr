# ADR 0016: Optional-content export shape

- Status: Accepted (decision); the `/Order` form change is deferred to a follow-up issue
- Date: 2026-11-13
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0014](0014-layer-hierarchy.md), [0015](0015-colour-scan-storage.md)

## Context

The drawing export can write visible project layers as PDF optional-content
groups (`src/pdf/export/ocg.ts`). It is opt-in, the flattened page content is
unchanged, and hidden layers, hidden ancestors and hidden items are never
written. Two shape questions were left open by 0.25.0 and are answered here.

### Page scope (F-023)

One OCG is created per exported layer, and marked content is written only on the
pages where that layer is visible. A reader toggles the group for the whole file,
so a layer visible on page 1 and hidden on page 2 is wrapped only on page 1 but
disappears from page 2 as well when the user clears the group.

The alternative is one group per layer **and page** (`Layer — Page 3`). That
multiplies the layer list by the page count: a 40-page export with 15 layers
becomes 600 entries, the layer hierarchy cannot be expressed across page-scoped
copies, and a rename or regroup in GridScalr would no longer map onto one reader
entry. Nothing about the exported artwork improves, because the flattened default
already contains exactly the visible geometry.

### Nesting form (F-087)

ISO 32000-1 Table 101 defines nesting in `/OCProperties /D /Order` as a **nested
array whose first element is a name string**, followed by the groups and nested
arrays inside it:

```text
[ (Group) 12 0 R [ (Child) 13 0 R ] ]
```

The writer instead emits an Acrobat-style heading dictionary with `/Name` and a
nested `/Order`:

```text
[ << /Name (Group) /Order [ 12 0 R 13 0 R ] >> ]
```

Acrobat and most desktop readers show that as a collapsible folder. pdf.js,
which is Firefox's built-in viewer, only implements the array form. Its
`parseNestedOrder` in `pdf.worker.mjs` returns `null` for a dictionary entry, so
the heading is dropped and the groups inside it are appended to a nameless
fallback list — present and toggleable, but flat. The groups, their `/ON` state
and the marked content are correct; only the reader's list structure is lost.

The PDF we write is therefore a reader extension, and the interoperability defect
is ours: the standard form nests in both pdf.js and Acrobat.

## Decision

1. **Keep one OCG per layer with per-page marked content.** The coarser toggle
   is accepted and documented. Per-page groups are rejected for the reasons
   above. F-023 is closed as an accepted trade-off, not a defect.
2. **Emit the ISO array form for nesting.** The heading-dictionary form is not
   the format we will ship long term; the array form is the one every
   spec-compliant reader implements, including the one the app itself uses to
   render PDFs.
3. **The change is not made in 0.27.0.** It is a small writer change, but it
   carries a product decision and a verification cost that do not belong in a
   documentation phase:
   - In the array form the heading is a non-selectable name, not a group. A
     group layer that also owns items therefore needs its own content as a
     selectable OCG **inside** the heading, which duplicates the layer name
     unless the follow-up decides to name the heading differently, or to keep
     the group's own content outside the heading. That is a visible choice in
     every reader's layer list and needs a sample in front of a user.
   - Acrobat is the reader that motivated the dictionary form. Replacing it must
     be verified in Acrobat, PDF-XChange, Chrome and Firefox on the same export
     before the form is switched, and CI cannot do that.
   - The current commit is a documentation decision; changing the artifact in
     the same commit would leave the release notes describing two export
     behaviours at once.
   The follow-up issue tracks the writer change, the name rule for a group with
   its own content, and the reader verification:
   [#257](https://github.com/MajorJohnDoe/gridscalr/issues/257).
4. The flattened drawing export stays the deterministic default. The OCG option
   stays opt-in. Hidden groups continue to remove their whole subtree, and a
   group with nothing visible is still never written.

## Consequences

- Until the follow-up lands, Firefox and other pdf.js viewers list nested
  groups flat. This is written in `docs/limitations.md` and the user guide so a
  user does not read it as a missing layer.
- A future change to the array form keeps the same `/ON` state and marked
  content, so stored exports are not invalidated; only the reader's list
  structure changes.
- Tests that assert the raw `/Order` tree must keep asserting the tree, not the
  serialized form, so the form change updates one expectation instead of the
  nesting coverage.

## Enforcement

- `tests/pdfExport.test.ts` asserts the nested `/Order` tree, that a group's own
  content precedes its children, that an empty group is never written and that a
  hidden ancestor removes the subtree.
- The follow-up must add an assertion on the serialized `/Order` entry type
  (array versus dictionary) and a pdf.js-shaped nesting fixture.
- `docs/limitations.md` and `docs/user-guide.md` describe the shipped reader
  behaviour.

## Non-goals

- Per-page OCGs, a second optional-content configuration, or a per-layer
  visibility model in the export.
- Making OCG export the default, or changing the flattened page content.
- Reading optional content back into the project.

## Related

- Findings F-023 and F-087.
- ADR [0014](0014-layer-hierarchy.md) — why nesting is a heading for a group
  layer at all.
- Issue [#238](https://github.com/MajorJohnDoe/gridscalr/issues/238),
  follow-up [#257](https://github.com/MajorJohnDoe/gridscalr/issues/257).
