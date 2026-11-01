# Releasing GridScalr

Releases are cut manually by the maintainer. The Windows build produces the
portable executable, the NSIS installer and the MSI; no release job runs on a
schedule.

> The published 0.x flow is Windows-only. The 0.17.0 milestone extends the workflow
> to Windows, macOS and Linux. Update this checklist with the cross-platform
> artifacts, checksums and clean-install tests before the first cross-platform
> release.

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

`docs:capture` writes the app version into `docs/screenshots/manifest.json`, so
run it after the version bump. Review the screenshots for a previous interface.

## 3. Checks

```bash
npm run check:versions
npm run check:docs
npm run format:check
npm run lint
npx tsc --noEmit
npm test -- --run
npm run build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo check --manifest-path src-tauri/Cargo.toml
```

Commit and push `main`, then confirm CI is green before tagging.

## 4. Windows build

Run the **Windows build** workflow manually or push the tag (the workflow starts
on `v*`). It uploads the `gridscalr-windows` artifact containing:

- `gridscalr.exe` (portable)
- `GridScalr_<version>_x64-setup.exe` (NSIS)
- `GridScalr_<version>_x64_en-US.msi`

## 5. Checksums

The Windows workflow creates `SHA256SUMS.txt` from the portable executable, NSIS
installer and MSI, then uploads it with the artifact. Download the artifact and
confirm that `SHA256SUMS.txt` lists all three files.

To verify after downloading, for example:

```powershell
Get-FileHash .\GridScalr_<version>_x64-setup.exe -Algorithm SHA256
```

Compare the value with the matching line in `SHA256SUMS.txt`. The checksums are
published with the release so users can verify an unsigned download. The README
explains why the build is not code-signed.

## 6. Publish

Set `VERSION` to the version in `package.json`, then tag and publish from the
staged Windows artifacts:

```bash
VERSION=0.16.1
git tag "v$VERSION"
git push origin "v$VERSION"
gh release create "v$VERSION" \
  --repo MajorJohnDoe/gridscalr \
  --title "GridScalr $VERSION" \
  --notes-file "docs/release-notes/$VERSION.md" \
  path/to/gridscalr.exe \
  path/to/GridScalr_${VERSION}_x64-setup.exe \
  path/to/GridScalr_${VERSION}_x64_en-US.msi \
  path/to/SHA256SUMS.txt
```

Mark the newest release as latest (`gh release edit "v$VERSION" --latest`) if an
older tag was published afterwards.

## 7. Verify

```bash
gh release list --repo MajorJohnDoe/gridscalr
gh release view "v$VERSION" --repo MajorJohnDoe/gridscalr
```

Open the release page, check that the README download link resolves to it, and
download one artifact to confirm the checksum.

## 8. Update the landing site

The landing site is updated for every tagged release, not for ordinary pull
requests. Do this after the GitHub Release is published so the site never links to
a missing asset.

1. Update `site/release.json` with `version`, `releasedAt`, `tag`, `releaseUrl`,
   `notesUrl` and the `installerUrl`, `msiUrl`, `portableUrl` and `checksumsUrl`
   asset links for the published release.
2. Review any release-specific copy on `site/index.html`, `site/sv/index.html` and
   the feature pages. Version text is injected from `site/release.json`.
3. Run:

   ```bash
   npm run site:build
   npm run site:check
   ```

4. Commit and push `main`, then confirm that the **Pages** workflow succeeded.

5. Verify the live pages and the download links:

   ```text
   https://majorjohndoe.github.io/gridscalr/
   https://majorjohndoe.github.io/gridscalr/sv/
   https://majorjohndoe.github.io/gridscalr/features/
   https://majorjohndoe.github.io/gridscalr/sv/funktioner/
   ```

   Both language pairs should load, the language switch should work, the version
   should match the release, and the download buttons should open the published
   assets.

## Notes

- Never publish a release from a working tree with uncommitted changes.
- Never overwrite a published release asset silently; cut a new patch version
  instead.
- The tags `v0.1.1`, `v0.1.2`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v0.6.1` and `v0.7.1`
  predate this document. Some of them have no GitHub Release.
