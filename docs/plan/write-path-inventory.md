# Write-path inventory

**Status:** Phase 0 inventory for the write-path hardening wave.
**Scope:** every `store.mutate(...)` call site in `src` on the `0.34.1` baseline.
**Purpose:** identify closures that still write project data inline, assign each a
command or a reviewed exception, and set a ratcheting gate for the remaining
work. This document changes no production code.

## Method

The tree was scanned for the literal call `store.mutate`. Each first argument
was read and classified:

- **command** — the closure only calls a model or feature function that owns the
  write, even when the closure assigns a local result variable.
- **inline** — the closure assigns or deletes a project, item, layer, category,
  settings, view or feature field directly, or mutates a project array in place
  (`push`, `splice`).
- **other** — no project write.

The baseline heuristic of 158 call sites is exact. Its inline estimate (~68) was
low: 77 closures write inline. Its “other” estimate (~24) was high: there are no
`other` closures. The heuristic counted local bookkeeping (`result = ...`),
creation-payload construction and early returns as other; all of those are
command-backed and are recorded in Appendix A.

## Totals

| Classification | Count |
| --- | ---: |
| Inline | 77 |
| Command | 81 |
| Other | 0 |
| **Total** | **158** |

| Batch | Inline closures |
| --- | ---: |
| 2a — Inspector item properties | 26 |
| 2b — Layers | 7 |
| 2c — Settings and project identity | 19 |
| 2d — Canvas and editors | 14 |
| 2e — Features, markups and assets | 11 |
| **Total** | **77** |

## Call sites by file

Every file with a `store.mutate` call site is listed. `Inline + command = total`
for each row and for the final row.

| File | Total | Inline | Command |
| --- | ---: | ---: | ---: |
| `src/app/selectionActions.ts` | 11 | 0 | 11 |
| `src/ui/inspector/measurement.ts` | 9 | 8 | 1 |
| `src/ui/inspector/drawing.ts` | 8 | 8 | 0 |
| `src/ui/inspector/style.ts` | 7 | 7 | 0 |
| `src/ui/layers/menu.ts` | 7 | 2 | 5 |
| `src/ui/inspector.ts` | 6 | 3 | 3 |
| `src/canvas/CanvasView.ts` | 5 | 1 | 4 |
| `src/canvas/pointer/contextMenu.ts` | 5 | 5 | 0 |
| `src/ui/markups/rows.ts` | 5 | 1 | 4 |
| `src/app/scaleFlows.ts` | 4 | 0 | 4 |
| `src/canvas/editors/textCommit.ts` | 4 | 3 | 1 |
| `src/features/schedules/ui/placement.ts` | 4 | 0 | 4 |
| `src/features/spaces/ui/dialog.ts` | 4 | 0 | 4 |
| `src/ui/layers/layerRow.ts` | 4 | 2 | 2 |
| `src/ui/settings/display.ts` | 4 | 4 | 0 |
| `src/ui/settings/metadata.ts` | 4 | 4 | 0 |
| `src/features/countTypes/ui.ts` | 3 | 1 | 2 |
| `src/features/fields/ui/fieldList.ts` | 3 | 0 | 3 |
| `src/features/schedules/ui/builderActions.ts` | 3 | 0 | 3 |
| `src/ui/inspector/symbol.ts` | 3 | 2 | 1 |
| `src/ui/layers/bulk.ts` | 3 | 0 | 3 |
| `src/ui/markups/views.ts` | 3 | 3 | 0 |
| `src/ui/settings/units.ts` | 3 | 3 | 0 |
| `src/canvas/pointer/draft.ts` | 2 | 2 | 0 |
| `src/features/fields/ui/fieldSets.ts` | 2 | 0 | 2 |
| `src/features/fields/ui/inspector.ts` | 2 | 0 | 2 |
| `src/features/measurementFlyout/controller.ts` | 2 | 0 | 2 |
| `src/features/spaces/ui/list.ts` | 2 | 0 | 2 |
| `src/features/takeoffSettings/ui/cards.ts` | 2 | 1 | 1 |
| `src/features/takeoffSettings/ui/tables.ts` | 2 | 0 | 2 |
| `src/ui/inspector/schedule.ts` | 2 | 0 | 2 |
| `src/ui/selectionMenu.ts` | 2 | 0 | 2 |
| `src/ui/settings/labels.ts` | 2 | 2 | 0 |
| `src/ui/settings/stamps.ts` | 2 | 2 | 0 |
| `src/app/App.ts` | 1 | 1 | 0 |
| `src/app/droppedDrawingFlows.ts` | 1 | 0 | 1 |
| `src/app/imageFlows.ts` | 1 | 1 | 0 |
| `src/app/pageActions.ts` | 1 | 0 | 1 |
| `src/app/projectImportFlows.ts` | 1 | 0 | 1 |
| `src/app/projectNameEditor.ts` | 1 | 1 | 0 |
| `src/canvas/editors/labels.ts` | 1 | 1 | 0 |
| `src/canvas/pointer/doubleClick.ts` | 1 | 1 | 0 |
| `src/canvas/pointer/itemFactory.ts` | 1 | 0 | 1 |
| `src/features/fields/ui/fieldDialog.ts` | 1 | 0 | 1 |
| `src/features/lineContinuation/controller.ts` | 1 | 1 | 0 |
| `src/features/pageMenu/ui.ts` | 1 | 1 | 0 |
| `src/features/railConnections/controller.ts` | 1 | 0 | 1 |
| `src/features/schedules/ui/csvImport.ts` | 1 | 0 | 1 |
| `src/features/schematics/ui/lineTypeDialog.ts` | 1 | 1 | 0 |
| `src/features/schematics/ui/railDialog.ts` | 1 | 1 | 0 |
| `src/features/schematics/ui/sheetFieldsDialog.ts` | 1 | 1 | 0 |
| `src/features/takeoffSettings/ui/objects.ts` | 1 | 0 | 1 |
| `src/ui/inspector/itemActions.ts` | 1 | 0 | 1 |
| `src/ui/inspector/label.ts` | 1 | 1 | 0 |
| `src/ui/inspector/multiSelection.ts` | 1 | 0 | 1 |
| `src/ui/layers/reorder.ts` | 1 | 0 | 1 |
| `src/ui/settings/project.ts` | 1 | 1 | 0 |
| `src/ui/topMenu.ts` | 1 | 1 | 0 |
| **Total** | **158** | **77** | **81** |

## Migration rules

- One batch is one issue and one pull request; do not mix batches.
- Add the command and its tests first, then replace the closure with a single
  command call. The observable behaviour must not change.
- A command owns the whole write, including lock and layer-precedence checks,
  clamping, `updatedAt`, optional-field deletion and any loop over items.
- Every command returns whether it changed anything, so the caller keeps its
  existing toast, refresh and selection behaviour.
- No new inline closure is allowed. The gate in “Gate metric” is lowered after
  each batch.
- A command that needs a new file must stay under the 400-line limit; do not
  grow `src/model/commands.ts`, `src/model/layers.ts` or
  `src/features/schematics/model/sheetTemplate.ts`.

## Batch 2a — Inspector item properties

**Proposed module:** new `src/model/itemProperties.ts`.

The current item commands in `src/model/commands.ts` cover selection-level
visibility, locking, deletion, translation, colour, stroke width, status, image
mode, image opacity, label reset and custom values. They do not cover the
scalar property edits in the inspector. Put the single-item setters in one new
module, reuse `findItem`, `itemIsLocked`, `resolveItemColor` and the existing
clamp helpers, and make every setter a no-op for a locked item or a locked or
hidden layer where the current UI already disables the control.

**Test focus:** locked-item and locked-layer no-op; hidden-layer no-op where the
control is unavailable; colour fallback never black; optional fields deleted
rather than stored as `undefined`; clamp boundaries for font size, stroke
width, label size, depth and text-box size; highlight shape rewrite produces a
rectangle or polygon with the correct point count; count quantity `1` deletes
the field; room and label trim to `undefined`.

| File | Fingerprint | Fields | Existing coverage | Proposed command | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/ui/inspector/measurement.ts` | `delete target.labelFit; target.updatedAt = …` | labelFit, updatedAt | Partial — `resetItemLabelPlacement` clears labelFit + offset + anchor | `releaseItemLabelFit(project, itemId)` | property |
| `src/ui/inspector/measurement.ts` | `target.labelSize = value; target.updatedAt = …` | labelSize, updatedAt | No; `clampLabelSize` only clamps | `setItemLabelSize(project, itemId, size)` | property |
| `src/ui/inspector/measurement.ts` | `delete target.labelSize; target.updatedAt = …` | labelSize, updatedAt | No | `clearItemLabelSize(project, itemId)` | property |
| `src/ui/inspector/measurement.ts` | `target.countType = typeSelect.value` | countType | No | `setItemCountType(project, itemId, type)` | property |
| `src/ui/inspector/measurement.ts` | `if (quantity > 1) target.countQuantity = quantity; else delete …` | countQuantity, updatedAt | No; `countQuantityOf` only reads | `setItemCountQuantity(project, itemId, quantity)` | property |
| `src/ui/inspector/measurement.ts` | `target.categoryId = categorySelect.value` | categoryId | No; `categoryForItem` only reads | `setItemCategory(project, itemId, categoryId)` | property |
| `src/ui/inspector/measurement.ts` | `target.areaMode = modeSelect.value` | areaMode | No | `setItemAreaMode(project, itemId, mode)` | property |
| `src/ui/inspector/measurement.ts` | `if (room) target.room = room; else delete target.room` | room | No; `normalizeRoom` only normalizes | `setItemRoom(project, itemId, room)` | property |
| `src/ui/inspector/drawing.ts` | `if (background.checked) target.textBackground = "white"; else delete …` | textBackground | No | `setItemTextBackground(project, itemId, enabled)` | property |
| `src/ui/inspector/drawing.ts` | `if (!raw \|\| !Number.isFinite(value) \|\| value <= 0) delete target.textBoxWidth; else …` | textBoxWidth | No | `setItemTextBoxWidth(project, itemId, width?)` | property |
| `src/ui/inspector/drawing.ts` | `if (!raw \|\| !Number.isFinite(value) \|\| value <= 0) delete target.textBoxHeight; else …` | textBoxHeight | No | `setItemTextBoxHeight(project, itemId, height?)` | property |
| `src/ui/inspector/drawing.ts` | `if (!raw \|\| !Number.isFinite(value) \|\| value <= 0) delete target.cloudRadius; else …` | cloudRadius | No | `setItemCloudRadius(project, itemId, radius?)` | property |
| `src/ui/inspector/drawing.ts` | `if (fillToggle.checked) { target.fillColor = …; target.opacity = … } else delete …` | fillColor, opacity | No | `setItemFillEnabled(project, itemId, enabled, defaultOpacity)` | property |
| `src/ui/inspector/drawing.ts` | `target.fillColor = next; target.opacity = target.opacity ?? 0.22` | fillColor, opacity | No | `setItemFillColor(project, itemId, color, defaultOpacity)` | property |
| `src/ui/inspector/drawing.ts` | `target.opacity = Number(opacityRange.value) / 100` | opacity | Partial — `setItemsOpacity` is image-only | `setItemOpacity(project, itemId, opacity)` | property |
| `src/ui/inspector/drawing.ts` | `target.highlightShape = …; target.points = [min, max] / four corners` | highlightShape, points | No | `setItemHighlightShape(project, itemId, shape)` | property |
| `src/ui/inspector/style.ts` | `target.color = next` | color | Partial — `setItemsColor` handles a selection | `setItemColor(project, itemId, color)` | property |
| `src/ui/inspector/style.ts` | `target.fontSize = Math.max(0.5, Math.min(300, value))` | fontSize | No; `clampTextSize` only clamps | `setItemFontSize(project, itemId, size)` | property |
| `src/ui/inspector/style.ts` | `target.strokeWidth = Number(width.value)` | strokeWidth | Partial — `setItemsStrokeWidth` handles a selection | `setItemStrokeWidth(project, itemId, width)` | property |
| `src/ui/inspector/style.ts` | `if (fillToggle.checked) { target.fillColor = …; target.opacity = … } else delete …` | fillColor, opacity, updatedAt | No | `setItemFillEnabled(project, itemId, enabled, defaultOpacity)` | property |
| `src/ui/inspector/style.ts` | `target.depth = Math.max(0.001, Math.min(1_000_000, value))` | depth, updatedAt | No | `setItemDepth(project, itemId, depth)` | property |
| `src/ui/inspector/style.ts` | `if (lineStyle.value === "dashed") target.lineStyle = "dashed"; else delete …` | lineStyle, updatedAt | No | `setItemLineStyle(project, itemId, style)` | property |
| `src/ui/inspector/style.ts` | `if (normalized === 0) delete target.rotation; else target.rotation = normalized` | rotation, updatedAt | No; `normalizeDegrees` only normalizes | `setItemRotation(project, itemId, degrees)` | property |
| `src/ui/inspector/symbol.ts` | `target.tag = value \|\| undefined; target.updatedAt = …` | tag, updatedAt | No | `setItemTag(project, itemId, tag)` | property |
| `src/ui/inspector/symbol.ts` | `target.tagOffset = { x: …, y: … }` | tagOffset, updatedAt | No | `setItemTagOffset(project, itemId, offset)` | property |
| `src/ui/inspector/label.ts` | `target.label = labelInput.value.trim() \|\| undefined` | label | No | `setItemLabel(project, itemId, label)` | property |

## Batch 2b — Layers

**Proposed module:** new `src/model/layerProperties.ts`.

`src/model/layers.ts` already owns layer creation, duplication, removal,
reordering and the per-page visible/locked flags. It has no setters for layer
name, colour or opacity, and no page-scoped clear. Keep those in a small layer
property module so `layers.ts` does not grow past its current 691 lines.

**Test focus:** rename trims and rejects an empty name; layer colour propagates
to every item exactly as today, including locked items, and never stores an
invalid colour; opacity clamps to the supported range; clear-on-page removes
only that page's items, leaves other pages and layers untouched, and is one undo
step; clearing does not leave the selection pointing at removed items; group
visibility and lock precedence is unchanged.

| File | Fingerprint | Fields | Existing coverage | Proposed command | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/ui/inspector.ts` | `layer.name = nameInput.value.trim()` | name | No | `renameLayer(project, layerId, name)` | property |
| `src/ui/inspector.ts` | `layer.color = next; for (const item of layer.items) item.color = next` | layer.color, item.color | No | `setLayerColor(project, layerId, color)` | lock/visibility, performance |
| `src/ui/inspector.ts` | `layer.opacity = Number(range.value) / 100` | opacity | No | `setLayerOpacity(project, layerId, opacity)` | property |
| `src/ui/layers/layerRow.ts` | `layer.name = input.value.trim()` | name | No | `renameLayer(project, layerId, name)` | property |
| `src/ui/layers/layerRow.ts` | `target.color = next; for (const item of target.items) item.color = next` | layer.color, item.color | No | `setLayerColor(project, layerId, color)` | lock/visibility, performance |
| `src/ui/layers/menu.ts` | `target.name = value` | name | No | `renameLayer(project, layerId, name)` | property |
| `src/ui/layers/menu.ts` | `target.items = target.items.filter((item) => item.pageId !== pageId)` | items | No; `removeItem` removes one item | `clearLayerItemsOnPage(project, layerId, pageId)` | selection, lock/visibility |

## Batch 2c — Settings and project identity

**Proposed modules:** new `src/model/projectSettings.ts` for display, snap,
unit and label settings; new `src/model/assets.ts` for report-logo lifecycle;
`setMetadataField` and `setMetadataNotes` in `src/model/metadata.ts`;
`setStampPresets` in `src/model/stamps.ts`; and `renameProject` in
`src/model/projectName.ts`.

Display, units, labels and stamps are scalar project settings. The two metadata
logo closures also delete an orphaned asset after scanning every item, which is
an asset-lifecycle rule rather than a form handler.

**Test focus:** typed setting keys (no arbitrary string writes); snap tolerance
and label size clamp; unit values round-trip through `LengthUnit`/`AreaUnit`;
project name normalizes and refuses empty; metadata fields trim; choosing or
removing a report logo keeps an asset still referenced by an image item and
deletes it only when unreferenced; stamp presets normalize on write.

| File | Fingerprint | Fields | Existing coverage | Proposed command | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/app/App.ts` | `project.settings.showGrid = !project.settings.showGrid` | settings.showGrid | No | `toggleDisplaySetting(project, "showGrid")` | property |
| `src/app/projectNameEditor.ts` | `current.name = value` | name | Partial — `normalizeProjectName` only normalizes | `renameProject(project, name)` | property |
| `src/ui/settings/display.ts` | `project.settings.showGrid = checked` | settings.showGrid | No | `setDisplaySetting(project, "showGrid", checked)` | property |
| `src/ui/settings/display.ts` | `project.settings.showCalibration = checked` | settings.showCalibration | No | `setDisplaySetting(project, "showCalibration", checked)` | property |
| `src/ui/settings/display.ts` | `project.settings.snapToGeometry = checked` | settings.snapToGeometry | No | `setDisplaySetting(project, "snapToGeometry", checked)` | property |
| `src/ui/settings/display.ts` | `project.settings.snapTolerancePx = value` | settings.snapTolerancePx | No | `setSnapTolerance(project, value)` | property |
| `src/ui/settings/labels.ts` | `project.settings.labelSize = value` | settings.labelSize | No; `clampLabelSize` only clamps | `setLabelSize(project, size)` | property |
| `src/ui/settings/labels.ts` | `project.settings.compactAreaLabels = checked` | settings.compactAreaLabels | No | `setCompactAreaLabels(project, enabled)` | property |
| `src/ui/settings/metadata.ts` | `next.metadata[key] = input.value.trim()` | metadata[key] | No; `normalizeProjectMetadata` only normalizes | `setMetadataField(project, key, value)` | property |
| `src/ui/settings/metadata.ts` | `next.metadata.notes = notes.value.trim()` | metadata.notes | No | `setMetadataNotes(project, notes)` | property |
| `src/ui/settings/metadata.ts` | `next.assets[asset.id] = asset; next.reportLogoAssetId = asset.id; if (!used) delete …` | assets, reportLogoAssetId | No | `setReportLogo(project, asset)` | performance |
| `src/ui/settings/metadata.ts` | `next.reportLogoAssetId = null; if (!used) delete next.assets[previous]` | reportLogoAssetId, assets | No | `clearReportLogo(project)` | performance |
| `src/ui/settings/project.ts` | `next.name = name` | name | Partial — `normalizeProjectName` only normalizes | `renameProject(project, name)` | property |
| `src/ui/settings/stamps.ts` | `current.settings.stampPresets = next` | settings.stampPresets | No; `normalizeStampPresets` only normalizes | `setStampPresets(project, presets)` | property |
| `src/ui/settings/stamps.ts` | `current.settings.stampPresets = next` | settings.stampPresets | No; `normalizeStampPresets` only normalizes | `setStampPresets(project, presets)` | property |
| `src/ui/topMenu.ts` | `project.settings[key] = !project.settings[key]` | settings[key] | No | `toggleDisplaySetting(project, key)` | property |
| `src/ui/settings/units.ts` | `project.settings.lengthUnit = length.value` | settings.lengthUnit | No | `setLengthUnit(project, unit)` | property |
| `src/ui/settings/units.ts` | `project.settings.areaUnit = area.value` | settings.areaUnit | No | `setAreaUnit(project, unit)` | property |
| `src/ui/settings/units.ts` | `project.settings.smartLengthUnits = checked` | settings.smartLengthUnits | No | `setSmartLengthUnits(project, enabled)` | property |

## Batch 2d — Canvas and editors

**Proposed modules:** new `src/model/itemText.ts` for text and annotation edits;
extend `src/model/itemProperties.ts` with label placement and geometry setters;
`src/features/schematics/model/sheetDocument.ts` gets the sheet-field command.

The text editor closures rewrite many optional fields in one step and must keep
the delete-versus-assign rules for bold, italic, underline, alignment, runs,
box size and rotation. Label placement is shared by the canvas menu and the
inspector, so both must call the same command.

**Test focus:** text edit applies value, colour, size, formatting, alignment,
runs and rotation in one undo step; clearing a format deletes the field; cloud
and callout edits keep box dimensions; stamp text recolours through
`stampStatusColor`; label reset, release, fit and anchor each clear the fields
they own; vertex insertion rejects an invalid segment; sheet-field writes reject
an unknown page or field; the gesture path revalidates the live layer hierarchy.

| File | Fingerprint | Fields | Existing coverage | Proposed command | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/canvas/pointer/contextMenu.ts` | `delete target.labelOffset; delete target.labelAnchor; delete target.labelFit; …` | labelOffset, labelAnchor, labelFit, updatedAt | Yes — `resetItemLabelPlacement` | `resetItemLabelPlacement(project, itemId)` | property |
| `src/canvas/pointer/contextMenu.ts` | `delete target.labelSize; target.updatedAt = …` | labelSize, updatedAt | No | `clearItemLabelSize(project, itemId)` | property |
| `src/canvas/pointer/contextMenu.ts` | `target.labelFit = placement; delete target.labelOffset; delete target.labelAnchor` | labelFit, labelOffset, labelAnchor, updatedAt | No | `setItemLabelFit(project, itemId, placement)` | property |
| `src/canvas/pointer/contextMenu.ts` | `delete target.labelFit; target.updatedAt = …` | labelFit, updatedAt | No | `releaseItemLabelFit(project, itemId)` | property |
| `src/canvas/pointer/contextMenu.ts` | `target.labelAnchor = { ...point }; target.updatedAt = …` | labelAnchor, updatedAt | No | `setItemLabelAnchor(project, itemId, point)` | property |
| `src/canvas/editors/textCommit.ts` | `item.text = value; item.textColor = …; … if (runsHaveFormatting) item.runs = runs` | text, textColor, fontSize, textBold, textItalic, textUnderline, textAlign, runs, updatedAt | No; `clampTextSize`, `normalizeColor`, `runsHaveFormatting` are helpers | `applyTextItemEdit(project, itemId, patch)` | property |
| `src/canvas/editors/textCommit.ts` | `item.text = value.trim() \|\| t(...); … textBoxWidth, textBoxHeight` | text, textColor, fontSize, textBold, textItalic, textUnderline, textAlign, textBoxWidth, textBoxHeight, updatedAt | No; same helpers | `applyTextItemEdit(project, itemId, patch)` | property |
| `src/canvas/editors/textCommit.ts` | `item.text = value; item.color = …; … if (rotation === 0) delete item.rotation` | text, color, fontSize, textBold, textItalic, textUnderline, textAlign, rotation, updatedAt | No; same helpers | `applyTextItemEdit(project, itemId, patch)` | property |
| `src/canvas/editors/labels.ts` | `item.label = value \|\| undefined; item.updatedAt = …` | label, updatedAt | No | `setItemLabel(project, itemId, label)` | property |
| `src/canvas/pointer/draft.ts` | `target.depth = value; target.updatedAt = …` | depth, updatedAt | No | `setItemDepth(project, itemId, depth)` | property |
| `src/canvas/pointer/draft.ts` | `target.text = text.trim() \|\| …; if (stamp) target.color = stampStatusColor(…)` | text, color, updatedAt | No; `stampStatusColor` is a helper | `setItemAnnotationText(project, itemId, text)` | property |
| `src/canvas/pointer/doubleClick.ts` | `item.points.splice(segment.index + 1, 0, insert); item.updatedAt = …` | points, updatedAt | No | `insertItemVertex(project, itemId, segmentIndex, point)` | property |
| `src/canvas/CanvasView.ts` | `sheetDocument.template.fields[editor.fieldId] = value` | template.fields | Partial — `templateDocumentForPage` resolves the document | `setSheetField(project, pageId, fieldId, value)` | property |
| `src/features/lineContinuation/controller.ts` | `live.item.points = merged; live.item.updatedAt = …` | points, updatedAt | Partial — `canContinuePolyline`, `mergeContinuedPoints` helpers | `continuePolyline(project, target, points) — or reviewed exception` | lock/visibility |

## Batch 2e — Features, markups and assets

**Proposed modules:** extend `src/model/countTypes.ts`, `src/model/pages.ts`
and `src/model/lineTypes.ts`; add a new `src/model/markupsViews.ts` for the
three view operations; add commands in `src/features/takeoffSettings/model.ts`
and `src/features/schematics/model/sheetDocument.ts`; extend
`src/model/images.ts` with `addImageItem`.

Feature-owned data stays with the feature. Markups views are project data, so
their add, upsert and replace operations belong in the markups model, not in
`src/ui/markups/views.ts`. The image flow writes an asset and an item in one
mutation; keep them one undo step.

**Test focus:** count-type glyph is a valid glyph; page location trims and
deletes an empty building or floor; summary-card visibility is preserved by id;
line types normalize colour and width and keep the active id valid; rail rows
drop empty labels; sheet fields replace only the target template; markups view
add, upsert and replace keep ids unique, preserve order and clear the active
view when it was removed; image asset and item are written together and the
asset has a stable id.

| File | Fingerprint | Fields | Existing coverage | Proposed command | Risk |
| --- | --- | --- | --- | --- | --- |
| `src/features/countTypes/ui.ts` | `if (target) target.glyph = value` | countTypes[].glyph | No | `setCountTypeGlyph(project, id, glyph)` | property |
| `src/features/pageMenu/ui.ts` | `if (nextBuilding) record.state.building = nextBuilding; else delete …` | pages[].state.building, pages[].state.floor | No | `setPageLocation(project, pageId, location)` | property |
| `src/features/takeoffSettings/ui/cards.ts` | `if (target) target.visible = input.checked` | settings.summary.cards[].visible | No | `setSummaryCardVisible(project, id, visible)` | property |
| `src/features/schematics/ui/lineTypeDialog.ts` | `current.lineTypes = next` | lineTypes | No | `setLineTypes(project, lineTypes)` | property |
| `src/features/schematics/ui/railDialog.ts` | `target.rows = next; target.showBadges = …; target.showLegend = …` | rows, showBadges, showLegend, updatedAt | No | `setRailRows(project, itemId, options)` | property |
| `src/features/schematics/ui/sheetFieldsDialog.ts` | `if (target?.template) target.template.fields = next` | template.fields | Partial — `templateDocumentForPage` resolves the document | `setSheetFields(project, pageId, fields)` | property |
| `src/ui/markups/views.ts` | `current.markupsViews.push(view)` | markupsViews | No; `viewFromSettings`, `uniqueMarkupsViewName` are helpers | `addMarkupsView(project, view)` | property |
| `src/ui/markups/views.ts` | `current.markupsViews[index] = next; else current.markupsViews.push(next)` | markupsViews | No | `upsertMarkupsView(project, view)` | property |
| `src/ui/markups/views.ts` | `current.markupsViews = kept.map(...)` | markupsViews | No | `replaceMarkupsViews(project, views)` | selection, property |
| `src/ui/markups/rows.ts` | `item.label = value \|\| undefined; item.updatedAt = …` | label, updatedAt | No | `setItemLabel(project, itemId, label)` | property |
| `src/app/imageFlows.ts` | `project.assets[asset.id] = asset; addItem(project, layer.id, item)` | assets, items | Partial — `addItem` writes the item; asset registration is local | `addImageItem(project, layerId, asset, item)` | property |

## Gate metric

Recommended metric: **inline `store.mutate` closures per file**. Add
`scripts/check-write-sites.mjs` and `tests/writePathGate.test.ts`. The checker
finds each `store.mutate` first argument and counts a closure as inline when it
assigns or deletes a member rooted at the closure parameter, at a `findItem`
result, at a `.find(...)` result, or mutates a project array in place. It does
not count local declarations or a command result assigned to a local variable.

Wire the check into `npm run check:modules` (or a dedicated
`npm run check:write-sites` in the local gate and CI). Fail on a new inline
closure, a raised budget without a reviewed reason, or a stale exception.

### Per-file budgets

Current counts are the measured baseline. Target is after the batch lands.

| File | Current | Target |
| --- | ---: | ---: |
| `src/ui/inspector/drawing.ts` | 8 | 0 |
| `src/ui/inspector/measurement.ts` | 8 | 0 |
| `src/ui/inspector/style.ts` | 7 | 0 |
| `src/canvas/pointer/contextMenu.ts` | 5 | 0 |
| `src/ui/settings/display.ts` | 4 | 0 |
| `src/ui/settings/metadata.ts` | 4 | 0 |
| `src/canvas/editors/textCommit.ts` | 3 | 0 |
| `src/ui/inspector.ts` | 3 | 0 |
| `src/ui/markups/views.ts` | 3 | 0 |
| `src/ui/settings/units.ts` | 3 | 0 |
| `src/canvas/pointer/draft.ts` | 2 | 0 |
| `src/ui/inspector/symbol.ts` | 2 | 0 |
| `src/ui/layers/layerRow.ts` | 2 | 0 |
| `src/ui/layers/menu.ts` | 2 | 0 |
| `src/ui/settings/labels.ts` | 2 | 0 |
| `src/ui/settings/stamps.ts` | 2 | 0 |
| `src/app/App.ts` | 1 | 0 |
| `src/app/imageFlows.ts` | 1 | 0 |
| `src/app/projectNameEditor.ts` | 1 | 0 |
| `src/canvas/CanvasView.ts` | 1 | 0 |
| `src/canvas/editors/labels.ts` | 1 | 0 |
| `src/canvas/pointer/doubleClick.ts` | 1 | 0 |
| `src/features/countTypes/ui.ts` | 1 | 0 |
| `src/features/lineContinuation/controller.ts` | 1 | 1 |
| `src/features/pageMenu/ui.ts` | 1 | 0 |
| `src/features/schematics/ui/lineTypeDialog.ts` | 1 | 0 |
| `src/features/schematics/ui/railDialog.ts` | 1 | 0 |
| `src/features/schematics/ui/sheetFieldsDialog.ts` | 1 | 0 |
| `src/features/takeoffSettings/ui/cards.ts` | 1 | 0 |
| `src/ui/inspector/label.ts` | 1 | 0 |
| `src/ui/markups/rows.ts` | 1 | 0 |
| `src/ui/settings/project.ts` | 1 | 0 |
| `src/ui/topMenu.ts` | 1 | 0 |

### Reviewed exceptions

| File | Inline | Reason |
| --- | ---: | --- |
| `src/features/lineContinuation/controller.ts` | 1 | Gesture-time polyline continuation. The closure re-reads the live item and layer and revalidates `canContinuePolyline` against the hierarchy inside the mutation; a command may still replace it in 2d, but this is the one closure that may stay inline if the command adds latency to a pointer gesture. |
| `src/canvas/pointer/itemFactory.ts` | 0 | Creation payload only: geometry, style defaults and the item object are built in the closure; `ensureActiveLayer` and `addItem` own the project write. Allowed under a payload-only exception, never as a project-field write. |
| `src/canvas/editors/textCommit.ts` (create branch) | 0 | Same creation-payload exception as `itemFactory`; the three edit branches above are inline and must move to `applyTextItemEdit`. |
| `src/features/railConnections/controller.ts` | 0 | Builds a connection-symbol item and calls `addItem`; the project write is command-owned. |

The gate should report inline writes separately from payload writes. If it
cannot distinguish them, list the three creation files as explicit payload
exceptions with a fixed maximum rather than raising their inline budget.

## Ambiguous closures and decisions

- `src/app/imageFlows.ts` writes an asset and an item in the same mutation.
  Either add `addImageItem(project, layerId, asset, item)` or add a separate
  `registerImageAsset(project, asset)` and keep both calls in one mutation.
  Decide whether an unreferenced asset may exist before choosing.
- `src/ui/layers/menu.ts` clear-on-page currently deletes every item on the page
  after the layer-lock UI guard. It does not skip individually locked items.
  A command must preserve that behaviour unless the product decision changes.
- `src/ui/inspector.ts` and `src/ui/layers/layerRow.ts` recolour locked items
  when the layer colour changes. A command must preserve that, or the change
  becomes a behaviour change rather than a refactor.
- `src/canvas/CanvasView.ts` writes a sheet field through
  `templateDocumentForPage`; the schematics feature should own this command even
  though the editor is opened from the canvas.
- `src/features/schematics/ui/lineTypeDialog.ts` replaces the whole
  `lineTypes` array and then repairs the active line type in the UI. The command
  should validate and write the array; the caller keeps the active-id repair.

## Appendix A — command-backed call sites

These closures write only through a model or feature command. They are listed so
that the 158-call-site total is auditable.

| File | Fingerprint | Command |
| --- | --- | --- |
| `src/app/droppedDrawingFlows.ts` | `commitProjectImport(project, prepared)` | `commitProjectImport` |
| `src/app/pageActions.ts` | `removed = removeDocumentAndPages(next, documentId)` | `removeDocumentAndPages` |
| `src/app/projectImportFlows.ts` | `const result = commitProjectImport(project, prepared, …)` | `commitProjectImport` |
| `src/app/scaleFlows.ts` | `changed = setPageCalibration(project, pageId, calibration, …)` | `setPageCalibration` |
| `src/app/scaleFlows.ts` | `setPageScaleLocked(project, pageId, locked)` | `setPageScaleLocked` |
| `src/app/scaleFlows.ts` | `moved = fitDrawing(current, page)` | `fitDrawing` |
| `src/app/scaleFlows.ts` | `cleared = clearPageCalibration(project, pageId)` | `clearPageCalibration` |
| `src/app/selectionActions.ts` | `deleted = deleteItems(project, refs).changed` | `deleteItems` |
| `src/app/selectionActions.ts` | `refs = pageId ? pasteItems(project, pageId) : []` | `pasteItems` |
| `src/app/selectionActions.ts` | `setItemsImageMode(project, store.ui.selection, mode)` | `setItemsImageMode` |
| `src/app/selectionActions.ts` | `setItemsOpacity(project, store.ui.selection, opacity)` | `setItemsOpacity` |
| `src/app/selectionActions.ts` | `refs = duplicateItems(project, store.ui.selection, 12)` | `duplicateItems` |
| `src/app/selectionActions.ts` | `result = moveItemsToLayer(project, store.ui.selection, layerId)` | `moveItemsToLayer` |
| `src/app/selectionActions.ts` | `Object.assign(result, setItemsVisible(project, store.ui.selection, visible))` | `setItemsVisible` |
| `src/app/selectionActions.ts` | `Object.assign(result, setItemsLocked(project, store.ui.selection, locked))` | `setItemsLocked` |
| `src/app/selectionActions.ts` | `setItemsStrokeWidth(project, store.ui.selection, width)` | `setItemsStrokeWidth` |
| `src/app/selectionActions.ts` | `setItemsColor(project, store.ui.selection, color)` | `setItemsColor` |
| `src/app/selectionActions.ts` | `result = applyMeasurementBulkEdit(project, store.ui.selection, patch)` | `applyMeasurementBulkEdit` |
| `src/canvas/CanvasView.ts` | `changed = setPageCalibration(project, pageId, calibration, …)` | `setPageCalibration` |
| `src/canvas/CanvasView.ts` | `setPageCalibration(project, pageId, next, …)` | `setPageCalibration` |
| `src/canvas/CanvasView.ts` | `deleted = deleteItems(project, store.ui.selection).changed` | `deleteItems` |
| `src/canvas/CanvasView.ts` | `translateItems(project, store.ui.selection, dx, dy)` | `translateItems` |
| `src/canvas/editors/textCommit.ts` | `ensureActiveLayer(project, "draw", …); addItem(project, layer.id, item)` | `ensureActiveLayer + addItem` |
| `src/canvas/pointer/itemFactory.ts` | `ensureActiveLayer(project, layerKind, pageId); addItem(project, layer.id, item)` | `ensureActiveLayer + addItem` |
| `src/features/countTypes/ui.ts` | `renameCountType(next, id, input.value)` | `renameCountType` |
| `src/features/countTypes/ui.ts` | `const result = removeCountType(next, id)` | `removeCountType` |
| `src/features/fields/ui/fieldDialog.ts` | `applied = updateField(current, draft) / createField(…)` | `updateField / createField` |
| `src/features/fields/ui/fieldList.ts` | `removed = deleteField(project, field.id).removed` | `deleteField` |
| `src/features/fields/ui/fieldList.ts` | `moved = moveField(project, field.id, -1)` | `moveField` |
| `src/features/fields/ui/fieldList.ts` | `moved = moveField(project, field.id, 1)` | `moveField` |
| `src/features/fields/ui/fieldSets.ts` | `updateFieldSet(current, next) / createFieldSet(…)` | `updateFieldSet / createFieldSet` |
| `src/features/fields/ui/fieldSets.ts` | `removed = deleteFieldSet(project, setId)` | `deleteFieldSet` |
| `src/features/fields/ui/inspector.ts` | `setItemCustomValue(project, item.id, field.id, next)` | `setItemCustomValue` |
| `src/features/fields/ui/inspector.ts` | `applied = applyFieldSet(current, item.id, select.value).applied` | `applyFieldSet` |
| `src/features/measurementFlyout/controller.ts` | `const created = addCountPreset(next, …)` | `addCountPreset` |
| `src/features/measurementFlyout/controller.ts` | `removeCountPreset(next, presetId)` | `removeCountPreset` |
| `src/features/railConnections/controller.ts` | `addItem(current, layerId, dot)` | `addItem` |
| `src/features/schedules/ui/builderActions.ts` | `result = draft.id ? updateSchedule(current, draft) : createSchedule(current, draft)` | `updateSchedule / createSchedule` |
| `src/features/schedules/ui/builderActions.ts` | `const result = createSchedule(current, { …draft, id: undefined, … })` | `createSchedule` |
| `src/features/schedules/ui/builderActions.ts` | `if (placementCount(current, id) > 0) deletePlacementsForSchedule(current, id)` | `deletePlacementsForSchedule` |
| `src/features/schedules/ui/csvImport.ts` | `applied = applyScheduleCsvImport(project, plan).applied` | `applyScheduleCsvImport` |
| `src/features/schedules/ui/placement.ts` | `created = createPlacement(entry, { … })` | `createPlacement` |
| `src/features/schedules/ui/placement.ts` | `created = createSchedule(current, standardScheduleDraft(current)).schedule` | `createSchedule` |
| `src/features/schedules/ui/placement.ts` | `createSchedule(entry, …); createPlacement(entry, …)` | `createSchedule / createPlacement` |
| `src/features/schedules/ui/placement.ts` | `changed = updatePlacement(project, itemId, {` | `updatePlacement` |
| `src/features/spaces/ui/dialog.ts` | `const result = createRoomsFromText(current, …)` | `createRoomsFromText` |
| `src/features/spaces/ui/dialog.ts` | `linked = linkMeasurements(project, space.id, ready).linked` | `linkMeasurements` |
| `src/features/spaces/ui/dialog.ts` | `for (const ref of refs) if (unlinkMeasurement(project, ref)) unlinked += 1` | `unlinkMeasurement` |
| `src/features/spaces/ui/dialog.ts` | `applied = updateSpace(project, draft) / createSpace(project, draft)` | `updateSpace / createSpace` |
| `src/features/spaces/ui/list.ts` | `const result = deleteSpace(current, space.id)` | `deleteSpace` |
| `src/features/spaces/ui/list.ts` | `moved = moveSpace(current.spaces, space.id, direction)` | `moveSpace` |
| `src/features/takeoffSettings/ui/cards.ts` | `setCategorySummaryRole(…) / setCountTypeSummaryRole(…)` | `setCategorySummaryRole / setCountTypeSummaryRole` |
| `src/features/takeoffSettings/ui/objects.ts` | `created = addCountType(next, normalizeCountTypeName(addName.value), "other") !== null` | `addCountType` |
| `src/features/takeoffSettings/ui/tables.ts` | `deletePlacementsForSchedule(…); deleteSchedule(…)` | `deletePlacementsForSchedule / deleteSchedule` |
| `src/features/takeoffSettings/ui/tables.ts` | `copyName = duplicateSchedule(current, schedule.id)?.name ?? ""` | `duplicateSchedule` |
| `src/ui/inspector/itemActions.ts` | `moveItemToLayer(project, layer.id, item.id, layerSelect.value)` | `moveItemToLayer` |
| `src/ui/inspector/measurement.ts` | `resetItemLabelPlacement(project, item.id)` | `resetItemLabelPlacement` |
| `src/ui/inspector/multiSelection.ts` | `setItemsStatus(` | `setItemsStatus` |
| `src/ui/inspector/schedule.ts` | `updatePlacement(project, item.id, { [key]: input.checked })` | `updatePlacement` |
| `src/ui/inspector/schedule.ts` | `created = continuePlacement(project, item.id, nextStart, {` | `continuePlacement` |
| `src/ui/inspector/symbol.ts` | `setItemsStatus(` | `setItemsStatus` |
| `src/ui/inspector.ts` | `setLayerVisibleOnPage(layer, pageId, !layerVisibleOnPage(…))` | `setLayerVisibleOnPage` |
| `src/ui/inspector.ts` | `setLayerLockedOnPage(layer, pageId, !layerLockedOnPage(…))` | `setLayerLockedOnPage` |
| `src/ui/inspector.ts` | `removeLayer(project, active.id)` | `removeLayer` |
| `src/ui/layers/bulk.ts` | `setLayerVisibleOnPage(target, pageId, visible)` | `setLayerVisibleOnPage` |
| `src/ui/layers/bulk.ts` | `setLayerLockedOnPage(target, pageId, locked)` | `setLayerLockedOnPage` |
| `src/ui/layers/bulk.ts` | `for (const id of totals.roots) removeLayer(current, id)` | `removeLayer` |
| `src/ui/layers/layerRow.ts` | `setLayerVisibleOnPage(target, pageId, !layerOwnVisible(…))` | `setLayerVisibleOnPage` |
| `src/ui/layers/layerRow.ts` | `setLayerLockedOnPage(target, pageId, !layerOwnLocked(…))` | `setLayerLockedOnPage` |
| `src/ui/layers/menu.ts` | `if (size.layers > 1) duplicateLayerSubtree(…) else duplicateLayer(…)` | `duplicateLayerSubtree` |
| `src/ui/layers/menu.ts` | `moveLayer(current, layerId, 1)` | `moveLayer` |
| `src/ui/layers/menu.ts` | `moveLayer(current, layerId, -1)` | `moveLayer` |
| `src/ui/layers/menu.ts` | `moveLayerOutOfGroup(current, layerId)` | `moveLayerOutOfGroup` |
| `src/ui/layers/menu.ts` | `deleteLayerSubtree(current, layerId)` | `deleteLayerSubtree` |
| `src/ui/layers/reorder.ts` | `changed = moveLayersInTree(project, ids, plan)` | `moveLayersInTree` |
| `src/ui/markups/rows.ts` | `const result = moveItemsToLayer(project, [ref], target)` | `moveItemsToLayer` |
| `src/ui/markups/rows.ts` | `setItemsStatus(project, targets, status.value ? (status.value as InspectionStatus) : null)` | `setItemsStatus` |
| `src/ui/markups/rows.ts` | `setItemsVisible(project, [ref], next)` | `setItemsVisible` |
| `src/ui/markups/rows.ts` | `setItemsLocked(project, [ref], next)` | `setItemsLocked` |
| `src/ui/selectionMenu.ts` | `created = continuePlacement(current, placement.id, next, {` | `continuePlacement` |
| `src/ui/selectionMenu.ts` | `setItemsStatus(project, store.ui.selection, status)` | `setItemsStatus` |
