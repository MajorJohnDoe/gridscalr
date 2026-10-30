# Known limitations


- Markup layers are stored in the project, not written into the PDF's own annotation or optional-content structures. The drawing PDF export bakes visible markups into page content as vectors.
- Text notes do not wrap inside a fixed text box; use `Shift+Enter` for an explicit line break.
- There is no cloud sync, collaboration, or automatic update service.
- Form fields and embedded PDF annotations are not editable.
- Measurements use the active page's scale; a manual scale or reference calibration can be applied to all pages with the same drawing scale.
- Snapping targets markup endpoints, midpoints, and intersections only. Snapping directly to the PDF drawing's vector geometry is a separate future feature.
- Rectangle and ellipse quick areas can be moved and reshaped from their two opposite points but cannot be rotated.
- Images support PNG and JPEG only. They are embedded in the project and count toward its file size; there is no external `assets/` folder. Image cropping, filters, and colour correction are not available.
- TIF import supports 1-bit CCITT G3/G4 scans only. Colour, greyscale, LZW/Deflate-compressed, tiled, and JPEG-in-TIFF files are rejected with a message. TIF pages can be deleted like any other page but cannot be rearranged, and closing a TIF drawing's original file has no effect because the converted PDF is embedded.
- New sheets are always added after the existing pages. A page can be deleted explicitly: its measurements and page scale are removed, later measurements move down one page number, and the operation is not undoable. Pages cannot be inserted or reordered.
- Custom count types use one of the five built-in vector glyphs. Uploaded or custom-drawn count artwork is not supported. A count can represent several pieces with **Pieces per object**.
- The symbol library is built in and vector-only: custom symbol uploads and symbol quantities in the procurement report are not supported yet. Symbols can be resized by dragging a corner. The pictograms are original filled-vector interpretations, not certified SS-EN ISO 7010 reproductions.
- Quantity reports are available as CSV, XLSX and PDF. CSV uses comma separators because that is the documented interchange format, so Excel on a locale with another list separator may need an import step; the XLSX workbook does not have that problem.
- The reference pane is read-only and follows the primary page. Independent page navigation in the two panes is not supported.
- Revision comparison compares measurement and markup data plus the rendered source pages. A raw PDF drawing reference has no markup data, so it supports side-by-side, overlay and a visual comparison PDF but no difference list. Neither mode performs a semantic diff of the PDF's raw vector operators.
- A revision comparison opens the reference project's source drawings as well as the project file. If those drawings have moved, the reference cannot be loaded until they are restored or the project is reopened from its original location.
- Radius, diameter and arc measurements are reported as **length** quantities; they do not create separate quantity types.
- Slope is measured from the two drawn points (rise over run). There is no elevation input for a slope between two real-world levels. Volume depth is entered in the project length unit, not measured from the drawing.
- OCR uses the bundled English (`eng`) and Swedish (`swe`) Tesseract models only. Other languages are not available, and OCR quality depends on scan resolution, contrast and skew.
- OCR runs on demand and can take several seconds per scanned page. The stored OCR index makes later searches fast, but re-running OCR replaces the page's stored words.
- The Linux GTK stack currently resolves `glib 0.18.5`, which has a medium-severity soundness advisory fixed in `glib 0.20.0`. GridScalr cannot upgrade it independently because Tauri's GTK 0.18 dependencies pin that generation. The Windows artifacts do not use this code path; revisit with a future Tauri/GTK upgrade.
