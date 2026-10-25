# Workflows

GridScalr is used for two closely related jobs: recording what is on a drawing, and turning those records into quantities. The tools are the same; the order and the output differ.

| Role | Typical output |
| --- | --- |
| Operations technician (drifttekniker) | A marked-up drawing PDF for a work order, inspection or deviation report |
| Technical property manager (teknisk förvaltare) | A quantity takeoff with categories, rooms, waste and rounding for procurement |

Both workflows use the same local `.gridscalr` project. A drawing is never uploaded or overwritten.

## Operations technician (drifttekniker)

Use this workflow when you need to document a site visit, mark a deviation, or give a contractor a drawing with clear annotations.

### 1. Open and calibrate the drawing

1. Open the PDF or scanned TIF with **File → Open drawing…**.
2. Choose the pages you need in the page picker.
3. Calibrate page 1 against a known dimension, or enter the printed `1:N` scale in Properties.
4. Lock the scale if the drawing must not be recalibrated by mistake.

A calibrated page shows the scale in the status bar and the Reference calibration in Properties.

### 2. Measure what the job needs

Choose **Length** (`L`), **Area** (`A`) or **Count** (`C`). The context bar keeps the active measurement layer and the **New measurement** settings, so repeated measurements stay consistent. Check units, snapping and guides in the **Canvas** popover.

![Length tool active with the Layers panel and measurement context](screenshots/measure.png)

- Use Length for pipe runs, cable routes, skirting and other linear work.
- Use a rectangle or polygon area for floor, wall or ceiling areas.
- Use Count for doors, windows, radiators, fixtures and other objects.
- Use **Deduct** for shafts, openings and other areas that should not be ordered.

Measurements capture the page scale when they are created. They stay usable if the page is recalibrated later, unless you deliberately update existing measurements.

### 3. Mark the deviation

Drawing tools live on drawing layers, separately from measurements. A practical site layer can contain:

- a revision cloud around the affected area;
- a callout with the action or observation;
- a status stamp such as **INSPECTED**, **NOT APPROVED** or a custom status;
- a text note and arrow for access, clearance or a temporary fix.

![Revision cloud, callout and inspected stamp on a drawing layer](screenshots/markups.png)

Right-click or long-press the Cloud, Callout, Stamp and Arrow tools to choose variants, colours and presets. Every object can still be hidden or locked individually without changing the layer.

### 4. Export the work order

1. Choose **File → Export → Drawing PDF…**.
2. Select the current page, all pages or a page range.
3. Choose whole pages or a selected crop area.
4. Include the visible layers, labels, calibration line and, when useful, a legend.
5. Save the file under a new name.

![Drawing export with pages, layers, labels and legend options](screenshots/export.png)

The source drawing is never modified. GridScalr also refuses to save an export over any source document in the project.

### Field checklist

- The page scale is correct and locked when appropriate.
- Measurements use the intended category and room.
- Deviations are on a drawing layer, not mixed into the measurement layer.
- Hidden layers and items are intentional; hidden content is excluded from every export.
- The exported PDF has the pages, labels and legend the contractor needs.

## Technical property manager (teknisk förvaltare)

Use this workflow when the drawing set will become a quantity takeoff, budget or procurement list.

### 1. Build the drawing set

Add every floor or building part to one project. Select several pages in the page picker, or add a second PDF or TIF later with **Pages → Add pages…**.

New pages are appended after the existing pages. Existing page numbers and measurements do not move unless you explicitly delete a page.

### 2. Calibrate and lock the scales

Calibrate a typical page, then use **Apply to all pages** when the whole set shares the same drawing scale. Apply copies the scale but not the lock and skips pages that are already locked.

Use **Lock scale** once the scale is verified. This prevents accidental recalibration during the takeoff.

### 3. Measure by category and room

Check the length and area units in the **Canvas** popover. Set the project category and room from the **New measurement** button for each measurement. Room names autocomplete from names already used in the project.

- Measure gross floor area per room.
- Add deductions for shafts, openings and other non-orderable areas.
- Measure wall, facade, roof and ground quantities in their own categories.
- Count doors, windows, radiators and fixtures as pieces.

![Selected floor area with category, room and deduction controls in Properties](screenshots/hero.png)

Use **Shift**/`Ctrl`/`Cmd`-click or a marquee to select several measurements, then apply one category, room, area mode or count type in a single undoable action.

### 4. Review quantities and order settings

Open **View → Quantities…** (`Ctrl/Cmd+Alt+Q`). Each row combines one category, room and measurement type and shows gross, deduction, net, waste and order quantity.

![Quantities dialog with categories, rooms, deductions, waste and order quantities](screenshots/quantities.png)

Set the project waste percentage and rounding step under **Settings → Project settings → Quantities**. A category can override either value under **Settings → Manage categories…**. Rounding always goes up and order quantity is never lower than net.

Measurements without a page scale are excluded and reported in the dialog. Hidden items and hidden layers are also excluded by default.

### 5. Export the procurement report

Use **Quantities CSV** or **Quantity PDF** in the Quantities dialog, or **File → Export**.

- CSV is intended for spreadsheets and procurement tools. It uses UTF-8 with BOM, comma separators and point decimals.
- The PDF report is A4 portrait with category sections, subtotals, totals, repeated headers and page numbers.

Reports always cover every page and every category. Dialog filters only affect the live summary, not the exported report.

### 6. Keep the project reviewable

Use **View → Measurements…** (`Ctrl/Cmd+Shift+M`) to search, select and navigate every item across all pages. The list is also the quickest way to check that a room or category has not been missed.

![Measurements dialog with all pages, search and row actions](screenshots/measurements.png)

Save the `.gridscalr` project next to the drawing set. If the project or drawings are moved together, GridScalr follows the stored relative paths. If a source PDF has moved, it asks you to locate it and verifies the checksum before continuing.

### Review checklist

- Every floor and source document is included.
- Scales are calibrated and locked where they should be.
- Rooms and categories match the procurement structure.
- Deductions are inside the correct room and category.
- Waste and rounding are deliberate.
- Hidden content is intentional.
- The exported CSV or PDF matches the reviewed quantities.

## Related reference

- [Measure](user-guide.md#measure)
- [Draw and annotate](user-guide.md#draw-and-annotate)
- [Quantities](user-guide.md#quantities)
- [Save and export](user-guide.md#save-and-export)
