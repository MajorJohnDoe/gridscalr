# Releasing GridScalr

Releases are cut manually by the maintainer. One tag builds Windows, macOS and
Linux artifacts with checksums; no release job runs on a schedule and the GitHub
Release is still published by hand from tested artifacts.

## 1. Prepare the version

Create or update `docs/release-notes/<version>.md`. It is used for the GitHub
Release notes and linked from the landing site.

The app version must match in all three files:

- `package.json`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

After changing the Rust crate version, run `cargo check --manifest-path
src-tauri/Cargo.toml` and commit the resulting `src-tauri/Cargo.lock` change.

The project-file `schemaVersion` is independent of the app version. Do not bump
the schema because the app version changed.

Update the current version line at the top of `docs/roadmap.md`.

## 2. Documentation pass

```bash
npm run docs:demo
npm run docs:capture
GRIDSCALR_DOCS_STRICT=1 npm run check:docs
```

`docs:capture` writes the app version into `docs/screenshots/manifest.json` and
regenerates the five `theme-*.png` images used by the README and the landing
site, so run it after the version bump. Review the screenshots for a previous
interface and confirm that every theme is still visible and correctly named.

## 3. Checks

```bash
npm run check:versions
npm run check:docs
npm run format:check
npm run lint
npm run check:i18n
npx tsc --noEmit
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
npm run site:build
npm run site:check
```

Commit and push `main`, then confirm that CI is green before tagging. CI builds
the desktop shell on Ubuntu, Windows and macOS, so platform-specific code is
compiled before the tag exists.

## 4. Cross-platform build

Push the tag (the **Release build** workflow starts on `v*`), or run the same
workflow manually when rehearsing:

```bash
VERSION=0.18.0
git tag "v$VERSION"
git push origin "v$VERSION"
gh run list --repo MajorJohnDoe/gridscalr --workflow "Release build"
```

One run produces four artifacts from the same commit:

| Artifact | Contents |
| --- | --- |
| `gridscalr-windows` | `gridscalr.exe` (portable), `GridScalr_<version>_x64-setup.exe` (NSIS), `GridScalr_<version>_x64_en-US.msi` |
| `gridscalr-macos` | `GridScalr_<version>_universal.dmg`, `GridScalr_<version>_universal.app.zip` |
| `gridscalr-linux` | `GridScalr_<version>_amd64.AppImage`, `GridScalr_<version>_amd64.deb`, `gridscalr_<version>_amd64.tar.gz` |
| `gridscalr-checksums` | `SHA256SUMS.txt`, merged from the three platform files |

The macOS job builds `universal-apple-darwin`, so one DMG runs on Intel and
Apple Silicon. Linux packages are built on Ubuntu 22.04 and the AppImage is a
portable x86_64 build. No artifact is code-signed or notarized.

Each platform job also runs the packaged app with `--smoke-test <dir>`: the app
opens its bundled demo, saves, reopens, checks the unsaved-changes prompt and
writes `result.json` before exiting with code 0 or 1. A failing smoke test fails
the build before any artifact is uploaded. Native dialogs and menu clicks are
covered by the manual install checks in step 7, not by the smoke test.

Download the artifacts:

```bash
gh run download <run-id> --repo MajorJohnDoe/gridscalr
```

## 5. Checksums

Each platform job writes `SHA256SUMS-windows.txt`, `SHA256SUMS-macos.txt` or
`SHA256SUMS-linux.txt` covering exactly its own files. The checksum job merges
them into one `SHA256SUMS.txt` that is published with the release, so a user can
verify any download from the same file.

Download the `gridscalr-checksums` artifact and confirm that the merged file
lists every file from the other three artifacts. To verify:

```powershell
Get-FileHash .\GridScalr_<version>_x64-setup.exe -Algorithm SHA256
```

```bash
shasum -a 256 GridScalr_<version>_universal.dmg
sha256sum GridScalr_<version>_amd64.AppImage
```

Compare the values with `SHA256SUMS.txt`. The builds are unsigned, so the
checksum is the only integrity check a user has; the README explains why.

## 6. Publish

Set `VERSION` to the version in `package.json`, then publish from the downloaded
artifacts:

```bash
VERSION=0.18.0
gh release create "v$VERSION" \
  --repo MajorJohnDoe/gridscalr \
  --title "GridScalr $VERSION" \
  --notes-file "docs/release-notes/$VERSION.md" \
  gridscalr.exe \
  "GridScalr_${VERSION}_x64-setup.exe" \
  "GridScalr_${VERSION}_x64_en-US.msi" \
  "GridScalr_${VERSION}_universal.dmg" \
  "GridScalr_${VERSION}_universal.app.zip" \
  "GridScalr_${VERSION}_amd64.AppImage" \
  "GridScalr_${VERSION}_amd64.deb" \
  "gridscalr_${VERSION}_amd64.tar.gz" \
  SHA256SUMS.txt
```

Mark the newest release as latest (`gh release edit "v$VERSION" --latest`) if an
older tag was published afterwards.

## 7. Verify a clean install on all three platforms

- **Windows 10/11:** run the NSIS installer, confirm SmartScreen explains the
  unsigned build, then check that the Start menu entry, `.gridscalr` association
  and uninstall work. Also run the portable executable once.
- **macOS (Intel and Apple Silicon if available):** open the DMG, drag
  GridScalr to Applications, and approve the unsigned app through **System
  Settings → Privacy & Security → Open Anyway**. Confirm that Finder opens a
  `.gridscalr` project and that the app is universal (`file` or **About This
  Mac** on an Apple Silicon machine).
- **Linux x86_64:** install the `.deb` with `sudo apt install
  ./GridScalr_<version>_amd64.deb`, run the AppImage after `chmod +x`, and
  unpack the tarball. Confirm that the desktop entry passes the file to
  GridScalr when opening a `.gridscalr` from the file manager.

```bash
gh release view "v$VERSION" --repo MajorJohnDoe/gridscalr
```

Open the release page, check that every asset downloads, and compare one file
per platform with `SHA256SUMS.txt`.

## 8. Update the landing site

The landing site is updated for every tagged release, not for ordinary pull
requests. Do this after the GitHub Release is published so the site never links
to a missing asset.

1. Update `site/release.json` with `version`, `releasedAt`, `tag`, `releaseUrl`,
   `notesUrl` and the Windows `installerUrl`, `msiUrl`, `portableUrl` and
   `checksumsUrl`.
2. Add the platform-specific fields for the published assets. The site only
   renders them when they are present, so a Windows-only release stays valid:
   - `macosDmgUrl`, `macosZipUrl`
   - `linuxAppImageUrl`, `linuxDebUrl`, `linuxTarballUrl`
3. Review any release-specific copy on `site/index.html`, `site/sv/index.html`
   and the feature pages. Version text is injected from `site/release.json`.
4. Run:

   ```bash
   npm run site:build
   npm run site:check
   ```

5. Commit and push `main`, then confirm that the **Pages** workflow succeeded.
6. Verify the live pages and the download links:

   ```text
   https://majorjohndoe.github.io/gridscalr/
   https://majorjohndoe.github.io/gridscalr/sv/
   https://majorjohndoe.github.io/gridscalr/features/
   https://majorjohndoe.github.io/gridscalr/sv/funktioner/
   ```

   Both language pairs should load, the language switch should work, the version
   should match the release, and every download button should open a published
   asset.

## Notes

- Never publish a release from a working tree with uncommitted changes.
- Never overwrite a published release asset silently; cut a new patch version
  instead.
- Artifacts from the workflow are kept for 14 days. Publish the GitHub Release
  from them within that window, or re-run the workflow for the same tag.
- The tags `v0.1.1`, `v0.1.2`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v0.6.1` and `v0.7.1`
  predate this document. Some of them have no GitHub Release.
