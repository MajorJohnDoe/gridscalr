# ADR 0014: Layer hierarchy

- Status: Accepted
- Date: 2026-11-12
- Deciders: GridScalr maintainer
- Supersedes: none
- Related: [0010](0010-project-file-integrity.md), [0011](0011-page-list-and-source-replacement.md), [0013](0013-module-first-foundation.md)

## Context

Layers are flat. Every layer is a `measure` or `draw` layer with its own
visibility, lock, colour, opacity, items, optional home page and optional
per-page overrides. Large projects therefore cannot group related layers:
twenty measurements on one floor are twenty sibling rows, and a drawing export
cannot express that they belong together.

Markups already has grouping and the PDF export already writes one optional
content group (OCG) per exported layer, so the missing piece is a persisted
hierarchy that the model, the Layers panel and the OCG writer can all use.

Three constraints shape the decision:

- Flat projects must keep their current behaviour exactly. A project without a
  hierarchy may not change rendering, hit-testing, export or saved JSON.
- The project file is the source of truth and must stay backward compatible.
  Schema changes need a deterministic migration and a committed
  previous-schema fixture.
- A hidden layer already means "nothing on it renders, hit-tests or exports",
  and a locked layer already means "visible and exportable, but not editable".
  A hierarchy must extend those rules, not invent parallel ones.

## Decision

### Data shape

A hierarchy is an optional `parentId` on `Layer`.

```ts
interface Layer {
  id: string;
  parentId?: string; // absent means a root layer
  // unchanged: name, kind, visible, locked, opacity, color, items,
  // pageState, homePageId
}
```

There is no separate group entity and no `isGroup` flag. A layer that other
layers point at is a group; a group is otherwise an ordinary layer and may hold
its own items. This keeps one entity, one ID space and one page-scope model, so
existing code that iterates `project.layers` still sees every layer and every
item exactly once.

Rejected alternatives:

- **A `LayerGroup` entity.** It needs its own ID set, page scope, colour,
  deletion and integrity rules, and every existing layer lookup would need a
  second branch.
- **Nested `children` arrays.** Moving one layer between parents rewrites two
  subtrees, a malformed tree silently loses whole branches, and a flat project
  would still serialize a different shape.
- **An `isGroup` flag.** Flag and reference can disagree. "A layer with
  children" cannot.

### Tree order

Sibling order is the order of layers in the existing `project.layers` array.
There is no separate `order` field and no adjacency requirement.

- A root is any layer whose `parentId` is absent, missing, cross-kind or part of
  a cycle.
- Children are ordered by their index in `project.layers`.
- Tree order is a depth-first walk: every parent, then its children in array
  order, recursively. For a flat project the walk is exactly the array order.
- Paint order and OCG order keep following the array (`draw` before `measure`,
  the existing `normalizeLayerOrder` rule), not the tree walk. A hierarchy
  groups layers for visibility, locking, listing and export structure; it does
  not silently change z-order, and nesting a layer never moves it in front of
  or behind its siblings.

### Inheritance

Effective state is resolved from the layer and all its ancestors:

```text
effectiveVisible(layer, page) = ownVisible(layer, page) AND every ancestor visible on page
effectiveLocked(layer, page)  = ownLocked(layer, page)  OR  any ancestor locked on page
```

- A hidden group hides its whole subtree. Hidden items still never render,
  hit-test, export or hit-test through a hidden group.
- A locked group locks its whole subtree. Locked items stay visible and
  exportable but cannot be moved, edited or deleted.
- A child's own state can only narrow visibility and widen locking. A visible
  or unlocked child never overrides a hidden or locked ancestor.
- The group's own items resolve against the group's own state, which already
  includes its ancestors. There is no special case for a group's own content.
- Resolution is cycle-safe: an ancestor chain that reaches a repeated layer is
  cut at the cycle and the affected layers are treated as roots.

The rule is implemented once in `src/model/layerHierarchy.ts`. In 10a the
selection resolver, the item visibility/lock commands and move-to-layer use it,
so a locked or hidden group protects its items in every bulk action. The canvas,
hit-testing, Layers list and PDF export call sites take the same helper in 10b,
where the hierarchy can also be created. With no hierarchy the walk is the layer
itself, so flat behaviour is unchanged.

Phase 10a lands the model, the validation, the migration and the tests. Phase
10b lands the Layers panel (drag nesting, collapse, inherited-state indicators)
and wires effective state into the canvas and the nested OCG export. Until that
UI exists there is no in-app way to create a hierarchy, so a 10a build cannot
regress flat rendering.

### Page scope

Page scope stays exactly what it is for a flat layer: `homePageId` marks where a
layer was created, `pageState[pageId]` overrides visibility or locking on one
page, and a layer without an override applies everywhere.

- Inheritance uses each layer's state **on the page being resolved**, so a group
  hidden only on page 2 hides its subtree only on page 2.
- A group's page scope is independent of its children's page scope. A child
  scoped to page 1 may sit under a group created on page 3. A group with no page
  state is an all-pages group.
- Page scope is never a visibility signal by itself: a group that does not list
  a page is not "hidden" there, it simply has no page-specific override.
- Deleting a page removes the page's overrides and items from every layer in
  the subtree, exactly as it does for flat layers. A group whose own page
  references are gone but which still has a surviving descendant is kept as an
  empty group, so deleting one page cannot orphan or silently flatten a subtree.

### Delete and cleanup

**Deleting a layer deletes its whole subtree, and a parent with children
requires an explicit confirmation.**

- The model returns a deletion plan (layer count, child count, item count) so the
  dialog can state what will be removed. The confirmation is UI; the model
  function cascades deterministically once it is called.
- Items on every deleted layer are deleted with that layer. A group's own items
  follow the same rule; there is no hidden "promote items" path.
- Deleting the last layer of a kind still creates the default layer for that
  kind, as it does today.
- When the active layer is inside the deleted subtree, the active layer falls
  back to the first remaining layer of the same kind, then any remaining layer.
- `removeLayer` keeps its signature and cascades. A single-layer delete would
  otherwise leave children pointing at a missing parent.
- Page deletion and empty-layer cleanup use a keep rule instead of the deletion
  plan: a layer is kept when it has its own page reference **or any surviving
  descendant**. A subtree with no remaining page reference is removed as a unit.

Promoting children on delete was rejected: it changes the meaning of the action,
splits sibling order across the removed node, and makes "delete folder" and
"delete layer" two different gestures with no visible warning.

### Invalid references

Hierarchy references are validated, reported and preserved. They are never
silently dropped, remapped or reparented.

| Case | Code | Tree treatment |
| --- | --- | --- |
| `parentId` names no layer | `missingLayerParent` | layer is a root |
| parent chain repeats a layer | `layerParentCycle` | each layer in the cycle is a root |
| `parentId` is the layer itself | `layerParentCycle` | layer is a root |
| child and parent have different `kind` | `layerParentKindMismatch` | child is a root |
| two layers share an ID | `duplicateLayerId` | existing rename rule |

- The validator reports the issue. The load report carries it in `issues`, so
  the project doctor shows it and diagnostics stay path-free.
- The stored `parentId` is kept as-is so a later repair or a newer build can see
  the original value. The tree walk is what treats it as a root.
- The project-doctor `danglingReferences` repair clears a missing, cross-kind or
  cyclic `parentId` and records a `rewrite` change per layer; it never deletes a
  layer to fix a reference.
- Duplicate layer IDs keep the existing normalization rule: the first occurrence
  keeps the ID, later duplicates are renamed deterministically and reported as
  `repairedLayerId`. Children keep referring to the stored ID, which resolves to
  the first occurrence. This is documented and reported, not silent.

### Migration and IDs

Schema 25 → 26 adds the optional `parentId`.

- Existing layer IDs are preserved. No layer, item, page, document, category or
  view ID changes.
- No ID is generated by the migration, so there is no random component to make
  a second run differ. Every schema 1–25 layer becomes a root because
  `parentId` did not exist before schema 26.
- A `parentId` marker in a schema 25 or older file is ignored, because the field
  did not exist then; this is reported as `repairedLayerParent` rather than
  trusted.
- Schema 26 normalizes `parentId` as a trimmed non-empty string and keeps an
  unresolved value for validation. A malformed (non-string) value is ignored
  and reported as `repairedLayerParent`.
- Migration is pure over the raw JSON and produces the same project for the same
  input. Round-trip parse → serialize → parse preserves IDs and parent links.

### OCG nesting intent (phase 10b, not built here)

The drawing export currently writes one OCG per exported layer and lists them
flat in `/OCProperties /D /Order`. With a hierarchy the intent is:

- keep one OCG per layer that actually draws visible content, so the flattened
  page content and the deterministic default export are unchanged;
- express the visible hierarchy in `/OCProperties /D /Order` with nested
  heading dictionaries (`/Name` plus a nested `/Order`) for group layers, in
  tree order;
- never emit a group that has no visible content;
- keep the flattened PDF as the default and the OCG option opt-in, as today.

That work needs its own tests against a real PDF structure and is deliberately
out of scope for 10a.

## Consequences

- Flat projects are byte-identical: no `parentId` is written, tree order equals
  array order and effective state equals own state.
- One persisted optional string per grouped layer. No new entity, no new ID
  space, no second ordering field.
- A group may hold items, so no existing item needs to move to become groupable.
- Grouping does not affect z-order; a user who expects a group to restack
  layers will be surprised, and the Layers panel documentation must say so.
- Cycle-safe resolution is required wherever an ancestor walk happens. The
  shared `src/model/layerHierarchy.ts` module is the only place allowed to walk
  parents.
- A cascading layer delete is more destructive than a flat layer delete; the
  confirmation must name the child and item counts.
- Deleting a page can leave an intentionally empty group. That is a valid state,
  not corruption.
- Schema 26 is the second consecutive additive schema change; the migration
  ladder grows to seven structural steps but no existing fixture changes
  meaning.

## Enforcement

- Schema 25 → 26 migration tests, a committed schema-25 fixture, a schema-26
  fixture and the whole schema 1–26 corpus.
- Round-trip and determinism tests: parse twice and serialize → parse produce the
  same layer IDs, `parentId` values, item IDs and page IDs.
- Invalid parent, cycle, self-parent and cross-kind tests assert the issue code
  and that every layer and item survives the load.
- Inheritance tests cover a hidden ancestor, a locked ancestor, per-page
  overrides, three levels and a group with its own items.
- Page-delete and source-replacement tests assert that page-scoped children
  cascade by page ID and that no surviving child points at a removed parent.
- Deletion tests assert the plan counts, the cascade, the active-layer fallback
  and that the default layer of a kind is recreated.
- Flat tests assert that a project without `parentId` has identical tree order,
  effective state and serialized JSON shape.

## Non-goals

- The Layers panel tree UI, drag nesting, collapse, multi-select and
  inherited-state indicators (phase 10b).
- Nested OCG export and its PDF tests (phase 10b).
- Markups folders, cross-project layer libraries and automatic layer merging on
  import.
- Reordering a layer across parents as a single undo step beyond the existing
  layer reorder primitives.

## Related

- [`docs/project-file.md`](../project-file.md)
- [`docs/plan/robustness.md`](../plan/robustness.md) §7.5
- [`docs/plan/foundation-findings.md`](../plan/foundation-findings.md)
- Issue [#193](https://github.com/MajorJohnDoe/gridscalr/issues/193)
