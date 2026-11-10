# Known limitations


- Markup layers are stored in the project, not written into the PDF's own annotation or optional-content structures. The drawing PDF export bakes visible markups into page content as vectors.
- Operation card sheets use built-in templates only. Custom frames, image logos, automatic page numbering and automatic equipment tags are not supported yet. The page field is free text and is not renumbered when sheets are added or removed.
- Template field values are stored in the project and exported as searchable PDF text, but the in-app search does not index them. Page thumbnails and the read-only reference pane show the static frame without field values.
- Data-summary sheets have a fixed fifteen-column layout and a paper-dependent number of 9 mm rows (about 23 on A3 and 36 on A2). Columns cannot be added, removed or reordered; extra rows require another data-summary sheet. Cells are single-line and shrink to fit.
- Changing a sheet's paper is structural and cannot be undone. Field values, including table cells in rows that no longer fit, are retained and reappear when the larger paper is selected again.
- Text notes placed with the Text tool do not wrap; use `Shift+Enter` for an explicit line break or the Text box tool for a fixed-width box that wraps automatically. Text boxes support formatting per selected range, and the inline editor shows bold, italic, underline, size and colour while typing. Only text boxes store runs; callouts, clouds and plain text notes keep one style per item. Text boxes are transparent unless **White background** is enabled.
- There is no cloud sync, collaboration, or automatic update service.
- Concurrent edits are protected by a conditional save. The desktop app compares the file it loaded with the file on disk immediately before the rename and offers **Save as conflicted copy** by default, or **Compare with disk version**, **Reload from disk**, **Overwrite** and **Cancel**. A conflict therefore preserves both versions. A cloud client can still write to the file in the short window between the final hash check and the rename; that remains a limitation of any local compare-and-swap. The browser fallback downloads the project and cannot perform a conditional write.
- A reference PDF on a shared or cloud-synced folder can be changed or moved by someone else. GridScalr detects it and offers Reload, Use current, Relink and Copy into project, but a reference does not protect the working geometry until you choose one of those actions. A managed copy protects against the original moving or changing; it does not protect against someone editing the copy. The copy's SHA-256 remains authoritative and a changed copy is reported.
- The cloud and network recommendation is a path-segment heuristic: UNC paths starting with `\\` and folders named OneDrive, Dropbox, Google Drive, iCloud, Box, SharePoint, Nextcloud, ownCloud, Seafile, pCloud, MEGA, Yandex Disk or Nutstore. It can miss a renamed folder or flag an unrelated one. It only recommends **Copy drawing into project**; the user always chooses and reference stays valid.
- The managed-copy folder is always the sibling `<project>.drawings/` next to the project file. It is not user-selectable. Renaming the project file does not rename an existing drawings folder; the relative links keep working, and **Consolidate drawings…** can recreate copies under the new name if needed.
- **File → Save a copy…** writes only the project file. Managed drawings stay in the original project's `<project>.drawings/` folder, so the copy links back to them. Use **File → Package project…** when the copy must be self-contained.
- Managed copies are not synchronised, deleted or garbage-collected. Removing a document or detaching it from its source leaves the copy on disk, and **Consolidate drawings…** can leave unreferenced copies if a later copy fails. The project file stays valid; remove unused copies manually when the folder size matters.
- Relink by checksum searches only the project folder and its `<project>.drawings/` folder, never the whole file system. A drawing outside those folders must be picked manually.
- The source-status poll hashes a PDF once per path, size and stored checksum. A change that keeps the same byte size between polls is only detected after the app restarts or the file is reloaded; reopening the project runs a full checksum check.
- Reload and Relink refuse a drawing whose page count changed and point to **Replace source…** instead. The page mapping is never guessed.
- Drag-and-drop page reorder is enabled for every page, but the UI does not yet guide a cross-document reorder with a separate confirmation step. The data model supports it. Deleting, inserting, duplicating and reordering pages remain explicit structural actions that cannot be undone.
- Form fields and embedded PDF annotations are not editable.
- Measurements use the active page's scale; a manual scale or reference calibration can be applied to all pages with the same drawing scale.
- Snapping targets markup endpoints, midpoints, intersections and I/O rail rows. Snapping directly to the PDF drawing's vector geometry is a separate future feature.
- Schematic pipes do not build a connectivity graph. There is no automatic cable routing, junction detection or I/O extraction; control cables snap to rail rows and connection dots are placed explicitly.
- The line-type editor renames, recolours, reweights, adds and removes project media classes. A line type sets the colour, width and dash when a run is created; editing or deleting a class later does not restyle existing runs, so old drawings remain stable. Line type names and colours are project data, not a shared company standard.
- **Outside drawing area** and its fit action apply to template sheets. The action scales down and centres unlocked, visible objects; locked objects are left in place. Drawings on imported PDF pages have no sheet drawing area to fit into.
- Rectangle and ellipse quick areas can be moved and reshaped from their two opposite points but cannot be rotated.
- Images support PNG and JPEG only. They are embedded in the project and count toward its file size; there is no external `assets/` folder. Image cropping, filters, and colour correction are not available.
- TIF import supports 1-bit CCITT G3/G4 scans only. Colour, greyscale, LZW/Deflate-compressed, tiled, and JPEG-in-TIFF files are rejected with a message. TIF pages can be deleted like any other page but cannot be rearranged, and closing a TIF drawing's original file has no effect because the converted PDF is embedded.
- New sheets and imported pages append by default. They can be inserted at a position from the page menu. A page can be deleted explicitly: its items and page state are removed and later pages keep their stable IDs. Structural page operations are not undoable.
- Import pages from another project appends pages unless an insertion position is chosen and creates one destination layer per source layer identity, shared across the imported pages. The source project is read-only. A preflight lists pages, items, references, unreadable files, skipped pages, checksum warnings and page-count changes before anything changes. Imported pages keep optional source-project and revision provenance; it is context, not a signature. Only plain `.gridscalr`/JSON files are supported; extract `.gridscalr.zip` packages first. Import previews show the page background, not the markups. Undo keeps the imported PDF proxies in memory until the project is closed or replaced, which makes redo immediate.
- Deleting a page does not remove empty page-scoped layers that were created there. Remove them from the Layers panel when they are no longer needed.
- Custom count types use one of the five built-in vector glyphs. Uploaded or custom-drawn count artwork is not supported. A count can represent several pieces with **Pieces per object**.
- Count schedules for doors, windows and fixtures group counts by type, category and room. They do not store width, height, fire rating or other door/window schedule attributes; that remains a separate future feature.
- Statutory Swedish area classifications such as BTA, BRA, NTA and LOA are not calculated. Categories and rooms are user-defined grouping labels, not a statutory area model.
- The 1.0 Windows and macOS builds are unsigned. Windows shows SmartScreen warnings and macOS requires the user to approve the app through System Settings → Privacy & Security. Verify published SHA-256 checksums before running a download.
- The full user guide and workflows are English-only in 1.0. The Swedish UI includes a Swedish quick start and an explicit English fallback for the full guides.
- The symbol library is built in and vector-only: 52 facility signs and 156 stroke-only schematic symbols. Custom symbol uploads and symbol quantities in the procurement report are not supported yet. Symbols can be resized by dragging a corner. Tags are free text and are never numbered automatically. The pictograms are original vector interpretations, not certified SS-EN ISO 7010 reproductions and not reproductions of SS-EN ISO 14617, IEC 60617 or any other named schematic standard.
- Quantity reports are available as CSV, XLSX and PDF. CSV defaults to the app locale (Swedish uses semicolons and decimal commas) and can switch to Interchange (RFC 4180) in Preferences. XLSX uses numeric cells and is unaffected.
- The reference pane is read-only and follows the primary page. Independent page navigation in the two panes is not supported.
- Revision comparison compares measurement and markup data plus the rendered source pages. A raw PDF drawing reference has no markup data, so it supports side-by-side, overlay and a visual comparison PDF but no difference list. Neither mode performs a semantic diff of the PDF's raw vector operators.
- A revision comparison opens the reference project's source drawings as well as the project file. If those drawings have moved, the reference cannot be loaded until they are restored or the project is reopened from its original location.
- Radius, diameter and arc measurements are reported as **length** quantities; they do not create separate quantity types.
- Slope is measured from the two drawn points (rise over run). There is no elevation input for a slope between two real-world levels. Volume depth is entered in the project length unit, not measured from the drawing.
- OCR uses the bundled English (`eng`) and Swedish (`swe`) Tesseract models only. Other languages are not available, and OCR quality depends on scan resolution, contrast and skew.
- OCR runs on demand and can take several seconds per scanned page. The stored OCR index makes later searches fast, but re-running OCR replaces the page's stored words.
- While a project is open, source-file status checks that each drawing still exists and compares its byte size with the size recorded when it was linked. A change that keeps the same byte size is only detected by reopening the project or by the normal checksum check on open.
- Project saves replace the file with a single rename after flushing a temporary file. A folder or file system that cannot rename over an existing file, such as some read-only or network shares, refuses the save and keeps the previous project; save locally or use **File → Save a copy…**.
- Automatic rolling backups are stored in the local app data folder, keyed by project ID. They keep the three most recent saves for that project, are never added to recent files or packages, and are not uploaded or synced. Use **File → Save a copy…** when a portable backup is needed outside this computer.
- Project packages are standard unencrypted ZIP files. GridScalr does not encrypt or cryptographically sign them; the manifest checksums detect corruption and accidental changes, not deliberate tampering. Each managed drawing is included once; a package is a transport copy and does not change the live reference or managed-copy mode.
- Original TIF scans and quantity/drawing exports are opt-in when packaging and are off by default. The TIF document's embedded PDF is enough to open and edit the project; the scan is only needed as source material.
- Packaging and open-package extraction require the desktop app. In the browser fallback the commands are visible but disabled with a desktop-only note. Packages can still be unzipped manually and the `.gridscalr` file opened with **File → Open project…** in the desktop app.
- Optional package exports are generated in memory before the ZIP is written. Very large drawing exports can take a while and need temporary memory, but the source PDFs themselves are streamed in Rust.
- Package extraction refuses unknown archive entries. Do not add extra files to a package ZIP unless you also update its manifest; manual unzip and opening the project is not affected.
- Recovery autosave needs local IndexedDB or, as a fallback, localStorage space. It keeps the latest snapshot per project plus one previous, and up to ten structural checkpoints per project. When storage is full, GridScalr warns and keeps working but cannot keep a recovery snapshot until space is freed. A very large project can use substantial storage for these records.
- The sidecar project lock (`<project>.gridscalr.lock`) is advisory, not a guarantee. It warns when another live instance has the project open and defaults to read-only, but a cloud client or a sleeping laptop can delay the heartbeat. A crash can leave a stale lock for up to five minutes; a stale or corrupt lock never blocks opening and can be cleared explicitly. The conditional save remains the actual protection.
- A read-only session still allows in-memory viewing and editing so that content can be inspected and exported, but a normal Save or Save As is refused. Use **File → Save a copy…** to keep local changes; the original project file is not written.
- The integrity validator proves internal referential consistency, not external truth. It cannot confirm that a referenced drawing is the correct revision, that a PDF still matches its checksum without reading it, that managed-copy files still exist, or that quantities and measurements are commercially correct.
- Explicit repairs cover duplicate IDs, dangling references and stale OCR. Other problems are reported but not rewritten automatically, including image assets whose MIME and data disagree, invalid image or text-box geometry, dangling report metadata, invalid optional provenance, and unreferenced managed drawings. Review them manually or save a repaired copy only after the remaining issues are acceptable.
- Duplicate-ID repair keeps the first occurrence of an ID and renames later ones. References that used the duplicated ID cannot be attributed to a specific occurrence and remain attached to the first one. Review affected pages and markups before relying on the repaired copy.
- A load report and the project doctor use stable technical codes for dropped or repaired load entries. They describe what normalization did; they do not recover data that was never valid.
- The sidecar lock, file watcher, read-only enforcement and explicit take-over are desktop-only. The browser fallback keeps the scoped IndexedDB recovery store and downloads on Save; it has no lock file or disk-change banner.
- The desktop window draws its own title row on Windows and Linux, so the Windows 11 snap-layout flyout on hover over the maximize button is not shown. Aero snap by dragging the window to a screen edge, double-click to maximize and the system menu still work. macOS keeps the native traffic lights and title bar behaviour.
- File associations are registered by the installers only. The portable `gridscalr.exe` and the AppImage do not claim `.gridscalr`, and Linux associations depend on the desktop environment reading the installed `.desktop` file. GridScalr never claims `.pdf`.
- The AppImage does not yet pass the opened file, because Tauri's AppImage desktop entry omits the `%f` argument ([tauri-apps/tauri#16014](https://github.com/tauri-apps/tauri/issues/16014)). The `.deb` and `.rpm` packages ship a custom desktop entry and do pass it.
- Single instance uses a per-user channel (D-Bus on Linux). In a session without a session bus, or when the app is started from two different user accounts, a second launch starts a second window instead of focusing the first.
- The remembered window position is only restored when it still intersects a connected monitor; otherwise the operating system places the window. Window geometry is stored per user account and is not part of the project file.
- The packaged smoke test drives the app from inside: it covers launch, opening the demo, saving, reopening and the unsaved-changes prompt. Native file dialogs, menu clicks and drag-and-drop are not automated on any platform, and macOS has no WebDriver (`tauri-driver`) support at all; those paths stay in the manual install checklist.
- The demo project is copied to the app data folder on first use, and edits are saved to that copy rather than to the bundled fixture. Delete the `demo` folder under the app data directory (for example `%APPDATA%\com.gridscalr.desktop\demo` on Windows or `~/.local/share/com.gridscalr.desktop/demo` on Linux) to restore the bundled version. The demo is not available in the browser fallback.
- The language selector covers the interface, reports and export headings. A low-level filesystem failure shows a localized message and keeps the operating system's technical detail as a separate line.
- The static boot fallback in `index.html` is English until the selected catalog loads; it is replaced before the app starts, and startup failures after that point use the active language.
- Diagnostics and the local event log are stored on the computer only. There is no telemetry, crash reporting or upload, and the log keeps the last 80 entries with paths, drawing names and labels removed. Startup failures before the log is available are shown on the boot screen instead.
- The Linux GTK stack currently resolves `glib 0.18.5`, which has a medium-severity soundness advisory fixed in `glib 0.20.0`. GridScalr cannot upgrade it independently because Tauri's GTK 0.18 dependencies pin that generation. The Windows artifacts do not use this code path; revisit with a future Tauri/GTK upgrade.

## Large-project performance

The **reference project** is generated deterministically by
`npm run bench:large` from the demo takeoff: 150 pages, 15,000 markup items,
60 embedded images and a serialized project around 8 MB. Source PDF bytes are
not duplicated in the benchmark; the Rust package tests exercise the streaming
1 GB path separately. Override the shape with `GRIDSCALR_BENCH_PAGES`,
`GRIDSCALR_BENCH_ITEMS` and `GRIDSCALR_BENCH_IMAGES`.

The budgets below are measured on the development machine with Chromium 1248,
Node 24 and the browser fallback. Run the benchmark on each release platform
before a release candidate; a regression beyond a budget blocks the release.

| Measure | Budget | Notes |
| --- | --- | --- |
| p95 edit latency | under 100 ms | A single history-tracked mutation in the reference project. |
| Project open | under 10 s | Parsing and store setup; PDF rendering is separate and progressive. |
| Autosave | under 2 s | Debounce plus the IndexedDB recovery write. |
| Page switch | under 100 ms | Store page change without waiting for a render. |
| Memory | under 2 GB | Desktop app working set while the reference project is open. |
| UI freeze | under 2 s | Longer operations need progress and cancel. |

Undo history is adaptive: it keeps up to 80 snapshots for small projects and
shrinks towards four snapshots when a single serialized snapshot exceeds the
48-million-character budget. A very large project therefore keeps a shorter
undo history rather than exhausting memory.

The Markups table renders only the rows near its viewport, canvas rendering
skips items outside the visible viewport, and autosave stores one serialized
snapshot with a skip when nothing changed since the previous write. These are
the tested 1.0 limits; there is no promise of unlimited project size.
