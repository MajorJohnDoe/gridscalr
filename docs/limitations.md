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
- Count types are fixed to door, window, radiator, fixture, and other. Custom count types and count quantities greater than one piece per object are not supported yet.
- The symbol library is built in and vector-only: custom symbol uploads and symbol quantities in the procurement report are not supported yet. Symbols can be resized by dragging a corner. The pictograms are original filled-vector interpretations, not certified SS-EN ISO 7010 reproductions.
- Quantity reports are available as CSV, XLSX and PDF. CSV uses comma separators because that is the documented interchange format, so Excel on a locale with another list separator may need an import step; the XLSX workbook does not have that problem.
- The split reference pane is read-only and always shows the same page as the primary canvas. Independent page navigation in the two panes is not supported.
- Revision comparison compares measurement and markup data plus the rendered source pages. It does not perform a semantic diff of the PDF's raw vector operators. Comparison visual pages show the source drawings; markup changes are listed in the difference table.
- A comparison opens the reference project's source drawings as well as the project file. If those drawings have moved, the reference cannot be loaded until they are restored or the project is reopened from its original location.
- Full-text search covers PDF text layers only. Scanned TIF pages and image-only PDF pages are not searchable until the OCR index is added.
