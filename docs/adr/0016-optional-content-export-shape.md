# ADR 0016: Optional-content export shape

- Status: Implemented (0.28.0 phase 1, [#257](https://github.com/MajorJohnDoe/gridscalr/issues/257)); Acrobat and PDF-XChange verification pending maintainer review
- Date: 2026-11-13 (decided), 2026-11-15 (array form implemented)
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

0.25.0 wrote an Acrobat-style heading dictionary with `/Name` and a nested
`/Order`:

```text
[ << /Name (Group) /Order [ 12 0 R 13 0 R ] >> ]
```

Acrobat and most desktop readers show that as a collapsible folder. pdf.js,
which is Firefox's built-in viewer, only implements the array form. Its
`parseNestedOrder` in `pdf.worker.mjs` returns `null` for a dictionary entry, so
the heading is dropped and the groups inside it are appended to a nameless
fallback list — present and toggleable, but flat. The groups, their `/ON` state
and the marked content were correct; only the reader's list structure was lost.

The PDF we wrote was therefore a reader extension, and the interoperability
defect was ours. 0.28.0 writes the standard form.

## Decision

1. **Keep one OCG per layer with per-page marked content.** The coarser toggle
   is accepted and documented. Per-page groups are rejected for the reasons
   above. F-023 is closed as an accepted trade-off, not a defect.
2. **Emit the ISO array form for nesting.** `orderFor()` writes an inline
   `PDFArray` whose first element is the folder name as a string, followed by
   the group's own OCG (when it has one) and its child entries in tree order.
   The heading-dictionary form is no longer written.
3. **A group layer that owns items repeats its layer name on its own OCG.**
   The array form makes the heading a non-selectable name, not a group, so the
   group's content needs a selectable OCG inside it. The folder and that OCG
   both carry the layer's project name:

   ```text
   [ (Measurements) 12 0 R [ (Detail symbols) 13 0 R ] ]
   ^ folder label    ^ selectable OCG for the layer's own items
   ```

   A group that only groups layers has no OCG of its own and becomes a heading
   with children only.

   Rejected alternatives:

   - **Rename the heading** (for example `Measurements (group)`). It avoids the
     repeated name, but invents a label that is not stored in the project, needs
     a translated string for every locale, and makes the folder name differ from
     the layer the user sees in GridScalr. The heading is not selectable anyway,
     so the extra word only decorates a structural entry.
   - **Keep the group's own content outside the heading**, as a sibling before
     it. That reads as two top-level entries for one project layer, separates the
     group's own items from its folder, and breaks the "own content first, then
     children" rule the hierarchy otherwise follows.

   The repeated name is the only option that keeps one OCG per project layer,
   one `/ON` bit per layer, no invented text and the group's content inside its
   own folder. The cost is visible: a group with items shows a folder and a
   selectable entry of the same name, and the selectable entry toggles only that
   layer's own items, not its children. This is documented in the user guide.
4. The flattened drawing export stays the deterministic default. The OCG option
   stays opt-in. Hidden groups continue to remove their whole subtree, and a
   group with nothing visible is still never written.

## Verification

The array form is a standard structure, but reader behaviour is the reason the
change exists, so the form is verified against the parser the app itself uses
rather than only by inspecting bytes:

- `tests/pdfExport.test.ts` asserts that every `/Order` entry is either an OCG
  reference or an inline array whose first element is a string — no heading
  dictionary at any depth.
- The same export is parsed by the real pdf.js worker parser, and
  `parseNestedOrder`'s output is asserted in its own `{ name, order }` shape:
  `["Markups", { name: "Measurements", order: ["Measurements", "Detail symbols"] }]`,
  with no nameless fallback entry.
- Chrome/PDFium is exercised headlessly over the committed sample export where
  the environment allows a browser run.

Reader results for this phase:

| Reader | Result |
| --- | --- |
| pdf.js worker (Firefox engine) | Nesting preserved; no nameless fallback list. Asserted in `tests/pdfExport.test.ts`. |
| Chrome (PDFium) | Pending maintainer verification against the sample export. |
| Acrobat | Pending maintainer verification against the sample export. |
| PDF-XChange | Pending maintainer verification against the sample export. |

CI cannot run Acrobat or PDF-XChange. The sample export path is recorded in the
phase pull request; the desktop reader result is not claimed until it is checked.

## Consequences

- pdf.js and Firefox's built-in viewer now nest a group under its folder label
  instead of listing the groups flat.
- Exports written by 0.25.0–0.27.0 keep the heading-dictionary form and remain
  flat in pdf.js. Those are released artifacts, not project data; there is no
  migration and no reason to rewrite them.
- A group layer with its own items shows the folder label and a selectable entry
  of the same name in every reader. The selectable entry toggles that layer's own
  content; the children keep their own entries.
- The same OCGs, the same `/ON` state and the same marked content are written.
  Only `/Order` changes shape, so a stored export is not invalidated and the
  flattened default is untouched.
- Tests that assert the raw `/Order` tree keep asserting the tree, and one added
  assertion covers the serialized form, so a future form change updates one
  expectation instead of the nesting coverage.

## Enforcement

- `tests/pdfExport.test.ts` asserts the nested `/Order` tree, that a group's own
  content precedes its children, that an empty group is never written and that a
  hidden ancestor removes the subtree.
- The same file asserts the serialized `/Order` entry type (array versus
  dictionary) and the pdf.js `parseNestedOrder` shape.
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
