# Third-party notices

GridScalr is distributed under the MIT License (see `LICENSE`). The application
bundles or links the components below. Their licenses apply to those components,
not to the GridScalr source code.

The full license texts ship with each package in `node_modules/` and in the
upstream repositories. If you distribute a GridScalr build, keep this file and
the upstream notices with it.

## Runtime libraries

| Component | Version source | License | Upstream |
| --- | --- | --- | --- |
| PDF.js (`pdfjs-dist`) | `package.json` | Apache-2.0 | https://github.com/mozilla/pdf.js |
| pdf-lib | `package.json` | MIT | https://github.com/Hopding/pdf-lib |
| fflate | `package.json` | MIT | https://github.com/101arrowz/fflate |
| Tesseract.js and tesseract.js-core | `package.json` | Apache-2.0 | https://github.com/naptha/tesseract.js |
| English and Swedish Tesseract traineddata | `package.json` | MIT | https://github.com/naptha/tessdata |
| @pdf-lib/fontkit | `package.json` | MIT | https://github.com/Hopding/fontkit |
| Tauri (`tauri`, plugins) | `src-tauri/Cargo.toml` | MIT OR Apache-2.0 | https://github.com/tauri-apps/tauri |
| Rust crate dependencies | `src-tauri/Cargo.lock` | MIT / Apache-2.0 (per crate) | https://crates.io |

PDF.js is Apache-2.0. Its `LICENSE` file is part of the `pdfjs-dist` package and
must be preserved in binary distributions. Tesseract.js and its WebAssembly core
are Apache-2.0 and are bundled with their upstream license files; the English and
Swedish traineddata files are MIT-licensed.

## Embedded fonts

| Font | License | Notes |
| --- | --- | --- |
| Liberation Sans Regular and Bold | SIL Open Font License 1.1 | Bundled through `pdfjs-dist/standard_fonts` and embedded into exported PDFs |

The font files are not modified. Their license texts are included in the
`pdfjs-dist` package.

## Artwork

- The GridScalr mark (`src-tauri/icons/app-icon.svg`) is original artwork for
  this project and is covered by the MIT License.
- The built-in facility symbols are original filled-vector illustrations drawn
  for GridScalr. They are not certified reproductions of SS-EN ISO 7010 or any
  other standard, and they must not be used as a substitute for legally required
  safety signage.

## Development-only dependencies

Vitest, Playwright, Prettier, TypeScript, Vite and the Tauri CLI are development
dependencies. They are not part of the distributed application, but their
licenses still apply to the repository. See `package.json` and
`package-lock.json`.
