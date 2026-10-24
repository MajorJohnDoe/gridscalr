# GridScalr User Guide

GridScalr is a local-first desktop app for measuring PDF and TIF drawings and turning those measurements into procurement quantities. Everything runs on your computer. Drawings are read from disk and are never uploaded.

This guide follows the current interface. For a printable shortcut list, open **Help → Keyboard shortcuts** or read [shortcuts.md](shortcuts.md).

## Quick start

1. Choose **File → New project…** or **File → Open drawing…**.
2. Pick a PDF or a scanned TIF drawing.
3. Calibrate the page against a known dimension, or enter the printed scale.
4. Choose a measurement tool and draw on the plan.
5. Review **View → Quantities…**.
6. Save the project with **File → Save**.

The welcome screen also offers **Open drawing**, **Open project**, **Restore last session**, and up to ten recent files.

## The interface

GridScalr uses a compact, drawing-first layout.

- **Menu bar** – File, Edit, View, Settings, and Help.
- **Tool rail** – Select, pan, calibrate, measurement, and drawing tools.
- **Left panel** – Pages and Layers only. Collapse it with the chevron in the panel header, `Ctrl/Cmd+\`, or **View → Sidebar**.
- **Canvas** – the drawing, markups, selection handles, and inline editors.
- **Properties** – the current page scale, the active layer, and the selected item. Collapse it with **View → Properties**.
- **Status bar** – calibration state, cursor coordinates, zoom controls, page navigation, active layer, and a local-only indicator.

Panels remember their width and collapsed state between sessions.

## Open drawings and projects

### New project

**File → New project…** starts a fresh project from a drawing. If the current project has unsaved changes, GridScalr asks before discarding them.

### Open a drawing

**File → Open drawing…** (`Ctrl/Cmd+O`) opens a PDF or TIF. With no project open, this creates a new project.

With a project already open, the drawing is **added after the existing pages**. GridScalr asks for confirmation and shows how many pages will be added. New sheets never change existing page numbers unless you explicitly delete a page.

### Open a project

**File → Open project…** (`Ctrl/Cmd+Shift+O`) opens a `.gridscalr` file. The source PDFs are referenced by path and SHA-256; if a PDF has moved, GridScalr asks you to locate it.

### Recent files

**File → Open recent** lists the ten most recent projects and drawings. The welcome screen shows the same list. Use **Clear recent list** to remove the entries. Recent files require the desktop app; the browser preview cannot reopen local paths.

### TIF drawings

Scanned drawings in **TIF/TIFF** are imported as real pages with their own paper size and scale. The format is detected from the file contents, not the extension.

- 1-bit CCITT Group 3 or Group 4 scans are embedded losslessly, without re-encoding.
- The page size comes from the scan's DPI tags. DPI gives the paper size, not the drawing scale, so calibrate against a known dimension as usual. If the scan has no resolution tags, 300 DPI is assumed and a warning is shown.
- Multi-page TIFFs become several pages. Reduced-resolution preview images are skipped. Orientation tags 1, 3, 6, and 8 are honoured.
- The converted PDF is embedded in the `.gridscalr` file, so the project keeps working even if the original scan is moved.
- Limits: 400 megapixels per page and 200 MB per file. Other compressions (LZW, Deflate, JPEG-in-TIFF), tiled TIFFs, and colour or greyscale scans are rejected with a message.

### Delete a page

If you imported the wrong drawing, delete the page from the **Pages** tab:

1. Right-click the page card and choose **Delete page…**, or select the page and use **Delete page…** in the panel footer.
2. Confirm the warning.

Deleting a page:

- Removes all measurements, highlights, images, and page scale stored on that page.
- Moves measurements and page state on later pages down one page number.
- Keeps every earlier page on its existing number.
- Deletes the source document reference when its last remaining page is removed. The original PDF or TIF file on disk is never modified.
- Cannot be undone.

A project must keep at least one page. New drawings are still always added at the end.

## Set the page scale

A page scale is required for real-world length and area values. The scale is stored per page.

### Calibrate against a known dimension

1. Choose **Calibrate** in the tool rail, or open **Properties → Scale → Calibrate**.
2. Click the two ends of a dimension with a known real-world length.
3. Enter the length and choose its unit (mm, cm, m, in, ft, or yd).
4. Optionally apply the scale to every page and update existing measurements.

### Enter a printed scale

Choose **Properties → Scale → Manual scale…** and enter the printed drawing ratio as `1:N`. Presets for 1:50, 1:100, 1:200, and 1:400 are available.

Manual scale assumes the PDF page is at its physical paper size: 1 mm on paper equals N mm in the real world. It replaces a reference calibration on the affected pages and draws no reference line or calibration label.

### Apply and lock

- **Apply to all pages** copies the scale but not the lock, and skips locked pages.
- **Lock scale** prevents changing the scale through calibration, manual scale, editing, or clearing. The lock is undoable and does not affect measurements, exports, zoom, or page navigation.
- Clearing a page scale does not delete measurements. Measurements created while a page was calibrated keep a scale snapshot and their original values.

Measurements without a scale are shown in PDF points (`pt` / `pt²`) and are excluded from quantity totals.

## Measure

Measurements are added to the active **measurement layer**. Choose the target layer in the context bar or the Layers tab. New measurements use a **0.75 pt** paper-space line weight; change it in **Properties → Stroke width** from 0.25 to 8 pt. The line weight is stored per item and is used by the PDF export.

### Length

Choose **Length** (`L`) and click each vertex. Press `Enter` or double-click to finish. Hold `Shift` to constrain the angle.

### Area

Choose **Area** (`A`) and select **Polygon**, **Rectangle**, or **Ellipse** in the context bar.

- **Polygon** works click-by-click. Click around the perimeter, then click the first vertex or press `Enter` to close it.
- **Rectangle** and **Ellipse** are quick areas drawn by dragging from one corner to the opposite corner.
- Hold `Shift` while dragging a quick area to make a square or circle.
- Choose **Add** or **Deduct** before drawing. Deductions are subtracted inside the same category and room.

### Count

Choose **Count** (`C`), pick a door, window, radiator, fixture, or other object type, and click the plan. Every count is exactly `1 pcs` and carries a built-in vector symbol.

### Category and room

While a measurement tool is active, the context bar shows the category and room for new measurements. The last choice is kept for the next measurement. Room names autocomplete from rooms already used in the project.

Change a measurement's category, room, area mode, or count type later in **Properties**, or for several selected measurements at once.

### Snapping

When **Snap to geometry** is enabled under **Settings → Project settings**, point placement can lock to:

- Endpoints and corners of visible markup segments
- Segment midpoints
- Intersections between straight markup segments

The snap marker names the target type. Hidden items and hidden layers never provide snap targets; locked but visible items do. Set the snap distance in Settings from 2 to 24 screen pixels.

## Draw and annotate

Use the pen, line, arrow, rectangle, ellipse, highlight, cloud, callout, stamp, delta, and text tools. Drawing items are added to the active **drawing layer**. Drawing layers render below measurement layers, so measurement labels stay readable.

Hold `Shift` while drawing lines, arrows, rectangles, or ellipses to constrain angles or proportions.

### Revision cloud

Choose **Revision cloud** (`D`) and click each corner. Close the shape on the first point or press `Enter`. The cloud can be reshaped with its vertex handles. Double-click the cloud, use **Edit text…** in Properties, or right-click it to edit its text box.

Every cloud gets an attached text box with a leader arrow to the cloud edge. Select the cloud and drag the round label handle, or drag inside the text box, to move the box independently. When the whole cloud is moved, the box keeps its relative position. Its font size, width, height, and scallop size are in Properties; empty width/height means automatic sizing.

Clouds use the current drawing colour and line weight. Scallop size follows the cloud size automatically; set an exact **Scallop size** in Properties if you want smaller or larger arcs. The text box is optional. Its font size, width, and height can be changed in the context bar and Properties; leave the width or height empty for automatic sizing.

### Callout

Choose **Callout** (`N`). Click the object the callout should point at, then click where the text box should sit. Enter the text and press **Apply**. The leader ends in a filled arrow exactly at the target. Double-click the callout or right-click it to edit the text later. Font size and optional text box width/height are available in Properties; empty width/height means automatic sizing.

### Stamp

Choose **Stamp** (`S`) and select a preset in the context bar. Click the plan to place it. **Custom…** lets you type a one-off status, and double-clicking or right-clicking a placed stamp edits only that stamp, not the preset list.

Stamp colours follow common statuses: **APPROVED** is green, **NOT APPROVED** is red, **FOR INFORMATION** is blue, **INSPECTED** is violet, and **REVISED** is orange. The same colours are recognised for **GODKÄND**, **EJ GODKÄND**, **FÖR KÄNNEDOM**, **BESIKTIGAD**, and **REVIDERAD**. Custom statuses keep the current stamp colour. Stamps use a bold, letter-spaced label.

Project stamp presets are managed under **Settings → Project settings → Stamps**. App defaults for new projects are stored locally on the computer; new projects inherit them, while each project keeps its own list.

### Revision delta

Choose **Revision delta** (`Y`), enter the revision number or letter in the context bar, and click to place the triangle. Double-click or right-click the delta to edit its revision text. An optional date can be entered as its label in Properties.

### Text notes

Choose **Text** (`T`) and click the plan. The inline editor accepts multiple lines:

- `Enter` commits the text.
- `Shift+Enter` inserts a line break.
- `Esc` cancels the edit.
- Clicking outside the editor also commits.

The floating strip beside the editor sets font size, colour, and rotation. Double-click an existing text note with the Select or Text tool to reopen it.

### Resize and rotate

Select a text note, arrow, rectangle, ellipse, or other drawing item to reveal handles.

- Drag a corner or edge handle to resize. Text corner handles scale the font size.
- Drag the round handle above the selection to rotate. Hold `Shift` to snap to 15° increments.
- Line, arrow, pen, and highlight rotation is baked into their points; text, rectangles, and ellipses store a rotation angle.
- Measurement geometry stays vertex-editable from its points. Rectangle and ellipse quick areas expose their two opposite defining points and have no rotation handle.

Each drag or inline edit is one undo step.

## Images

Use **File → Import image…** or the context bar to add a PNG or JPEG. `Ctrl/Cmd+V` also inserts an image when the clipboard contains one; when it does not, the same shortcut pastes markups.

- Images are embedded in the project, so the `.gridscalr` file stays portable.
- Each image is limited to 20 MB and 4000 px on its longest side. Larger images are proportionally downscaled.
- PNG transparency is preserved. JPEG files are re-encoded at quality 0.85 when resizing or size reduction is needed.
- A new image is placed on the current page and on a visible, unlocked drawing layer.
- Choose **Background** mode to place the image above the PDF but below every markup, or **Annotation** mode to use normal layer order.
- Properties exposes opacity, rotation, layer, visibility, lock state, duplicate, and delete. Corner handles resize proportionally; side handles change one dimension.
- Images follow the same visibility and locking rules as other items.

## Layers

Open the **Layers** tab in the left panel.

- **Eye** shows or hides a layer.
- **Lock** prevents moving, editing, and deleting its items.
- Click the colour swatch to change the layer colour.
- Double-click the name to rename the layer.
- Drag layers within their group to reorder them.
- Use **+ Measure layer** or **+ Drawing layer** to add layers.
- Move the selected item to another layer from Properties or the right-click menu.

Measurement layers and drawing layers stay separate. The **Layer** picker in the context bar shows which layer receives new items. If the active layer is hidden or locked, the picker shows a warning. Choosing a tool automatically switches to a visible, unlocked layer of the matching kind.

Hidden items do not render, hit-test, or export. Locked items stay visible and exportable but cannot be moved, edited, or deleted.

## Select and edit

Use the Select tool (`V`) to:

- Click one markup.
- `Shift`/`Ctrl`/`Cmd`-click to add or remove markups.
- Drag on empty canvas to marquee-select everything inside the box.
- Move selected items together.

Properties shows the selection and offers bulk actions:

- Move all selected items of one kind to another layer.
- Set a common colour and line weight.
- Hide or show the selection.
- Lock or unlock the selection.
- Duplicate or delete the selection.

When every selected item is a measurement, Properties also offers:

- Setting one category or one room. Leave the room field empty and choose **Apply** to clear rooms.
- Setting **Add** or **Deduct** when every selected measurement is an area.
- Setting one object type when every selected measurement is a count.

Locked measurements are skipped by bulk edits and reported in a toast. Every bulk action is one undo step, even across layers.

### Clipboard

The internal clipboard supports `Ctrl/Cmd+C`, `X`, and `V`, and `Ctrl/Cmd+D` duplicates the selection. Pasting on another page keeps the original PDF coordinates; pasting on the same page offsets the copy by 12 pt. Duplicate uses the same offset. The clipboard is in memory only and is not shared with the operating system.

### Find and navigate measurements

Open **View → Measurements…** (`Ctrl/Cmd+Shift+M`) for a searchable list of every measurement and drawing.

- Filter by current or all pages.
- Search by label, type, layer, category, room, or count type.
- Click a row to go to its page and select it.
- Use the eye and lock buttons for per-item visibility and locking.
- Right-click a row for copy, cut, duplicate, hide/show, lock/unlock, move to layer, and delete.
- Use **Select all** for the current filter.

## Highlight modes

The **Highlight** tool (`G`) has three modes in the context bar:

- **Pen** – the original freehand highlighter.
- **Rectangle** – drag a translucent highlight box.
- **Polygon** – click a translucent highlight area and close it with `Enter` or the first point.

Existing projects keep their freehand highlights; new highlights use the selected mode.

## Quantities

Open **View → Quantities…** (`Ctrl/Cmd+Alt+Q`) to summarise the measurements currently included by the filters.

Each row covers one category, room, and measurement type and shows gross, deduction, net, waste, order quantity, and item count. Category and room headers provide subtotals, and a total row summarises each measurement type.

- Filter by current or all pages, one category, a room substring, or any combination of measurement layers.
- Hidden items and hidden layers are excluded by default and reported in a note. Locked items are included.
- **Include hidden items and layers** counts them in the live dialog.
- Area deductions are subtracted inside the same category and room only. If a deduction exceeds its gross area, the net is clamped to zero and the row shows a warning.
- Length and area values use the project units, including yd². Counts always use pcs.
- Measurements without a scale are excluded and counted in a note.

Quantities are derived from the current items every time the data changes and are never stored in the project file.

### Waste and rounding

Set project defaults under **Settings → Project settings → Quantities**:

- **Waste** is a percentage of net, from 0 to 100.
- **Rounding step** controls how order quantities round up. A step of 0 means no rounding.
- A category can override either value in **Settings → Manage categories…**. Leave a field empty to inherit the project default.
- Rounding always goes up. Counts always round to whole pcs even when another step is configured.
- Order quantity is never lower than net.

### Export quantity reports

Use the **CSV** or **PDF** buttons in the Quantities dialog, or **File → Export → Quantities to CSV / Quantity report (PDF)**.

Reports cover every page and every category, exclude hidden items and hidden layers, and include locked items. Dialog filters do not affect the exported report. Reports are generated on demand and never stored in the project file.

- CSV is UTF-8 with BOM, comma delimiters, CRLF line endings, point decimals, three decimals for length and area, and whole numbers for counts.
- The PDF report is A4 portrait with category sections, subtotals, totals, repeated table headers, page numbers, a hidden-item notice, and a warning for clamped deductions.

## Save and export

### Save

- **File → Save** (`Ctrl/Cmd+S`) writes a `.gridscalr` project file.
- **File → Save as…** (`Ctrl/Cmd+Shift+S`) writes to a new path.

The source PDF is never overwritten. Autosave keeps a recovery snapshot in local storage.

### Export

**File → Export** contains:

- **Drawing PDF…** – opens the drawing export dialog. Choose whole pages or a selected area, current page / all pages / a page range, visible layers, labels, the calibration line, and an optional legend. The export writes `<project>-markups.pdf`.
  **Selected area** enters a one-off crop mode. Drag a rectangle, adjust it with the handles, then press `Enter` or **Use area**. `Esc` cancels. The crop is stored relative to the page and applied to every selected page.

  Hidden layers are listed but disabled. Hidden items are always excluded; locked items are exported.

  **Legend** adds a separate A4 page at the end of the export.
- **View as PNG** – exports the rendered page and markup layers at the current view.
- **Markups to CSV** – exports page, type, layer, label, computed value, unit, details, and PDF-coordinate vertices.
- **Quantities to CSV** – writes `<project>-quantities.csv` for spreadsheets and procurement tools.
- **Quantity report (PDF)** – writes `<project>-quantities.pdf`.
- **Project to JSON** – exports the project payload without requiring a `.gridscalr` extension.

All export formats exclude hidden items and hidden layers. Locked items are still exported. Selection handles, hover states, and vertex markers are editing aids and are never included in an export.

## Settings

Open **Settings → Project settings…** (`Ctrl/Cmd+,`).

- **Page scale** – shows the current page's calibration or manual scale and whether it is locked. Change it in **Properties → Scale**.
- **Units** – length and area units for the project.
- **Display** – show grid, show scale line, snap to geometry, and snap distance.
- **Quantities** – default category, waste percentage, and rounding step.
- **Stamps** – edit the project's stamp presets, edit the app defaults used by new projects, and copy between them.
- **Manage categories…** – rename, reorder, delete, and override waste/rounding per category.
- **Reset panel layout** – restores the default sidebar and Properties widths and expands both panels.

Project settings are stored in the `.gridscalr` file and are undoable while the project is open. Interface preferences such as collapsed panels are stored locally and are not part of the project.

## Help

- **Help → User guide** (`F1`) opens this guide inside the app.
- **Help → Keyboard shortcuts** (`?`) opens the shortcut reference.
- **Help → About GridScalr** shows the installed version.

The help content is bundled with the application. It does not use the network.

## Project files

A `.gridscalr` file is UTF-8 JSON. It contains document references, per-page calibrations, settings, categories, layers, markup items, and embedded images. Referenced PDFs are not embedded; a TIF's converted PDF is embedded because the scan cannot be read directly at render time.

New sheets are always added after the existing pages. Deleting a page is a separate, explicit action: measurements and page scale on that page are removed, later measurements move down one page number, and the operation cannot be undone. Pages cannot be inserted or reordered.

Schema version 8 is the current format. Older projects load normally and are migrated when opened.

## Keyboard and mouse

The full list is in **Help → Keyboard shortcuts** and in [shortcuts.md](shortcuts.md). Common actions:

- `V` select, `H` pan, `K` calibrate, `L` length, `A` area, `C` count.
- `P` pen, `I` line, `U` arrow, `R` rectangle, `O` ellipse, `G` highlight, `T` text.
- `Enter` finishes a shape; `Esc` cancels a draft, clears the selection, or returns to Select.
- `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` redo.
- `Ctrl/Cmd+0` fit page, `Ctrl/Cmd+1` actual size.
- `PageUp` / `PageDown` change page.
- `Space` + drag pans temporarily.

## Troubleshooting

### The scale looks wrong

Check that the page is calibrated or has the correct manual `1:N` ratio, and that the page scale is not locked. Applying a scale to all pages skips locked pages.

### A measurement is missing from quantities

Hidden items, hidden layers, and measurements without a scale are excluded by default. Check the quantity notice and enable **Include hidden items and layers** only when you deliberately want them counted.

### A PDF cannot be exported

Encrypted source PDFs cannot be flattened without their owner password. GridScalr shows a warning instead of writing a partial file.

### A TIF is rejected

Only 1-bit CCITT Group 3/4 scans are supported. Re-scan colour, greyscale, LZW/Deflate, tiled, or JPEG-in-TIFF images as a supported bilevel TIFF or as a PDF.

### Recent files do not open in the browser

Browser development mode uses the file picker and downloads. Native paths, recent files, and atomic save require the desktop app.

### The window fails to start

Restart the app and make sure Microsoft Edge WebView2 is up to date. On Linux, check the Tauri prerequisites in the README. The boot screen can show technical details for a bug report.
