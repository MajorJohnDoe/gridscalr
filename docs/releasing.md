# Releasing GridScalr

Releases are cut manually by the maintainer. The Windows build produces the
portable executable, the NSIS installer and the MSI; no release job runs on a
schedule.

## 1. Prepare the version

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

On Windows, after downloading the artifact:

```powershell
Get-FileHash .\*.exe, .\*.msi -Algorithm SHA256 |
  Format-Table -AutoSize |
  Out-File SHA256SUMS.txt
```

The checksums are published with the release so users can verify an unsigned
download. The README explains why the build is not code-signed.

## 6. Publish

```bash
git tag v0.13.0
git push origin v0.13.0
gh release create v0.13.0 \
  --repo MajorJohnDoe/gridscalr \
  --title "GridScalr 0.13.0" \
  --notes-file release-notes.md \
  path/to/gridscalr.exe \
  path/to/GridScalr_0.13.0_x64-setup.exe \
  path/to/GridScalr_0.13.0_x64_en-US.msi \
  path/to/SHA256SUMS.txt
```

Mark the newest release as latest (`gh release edit v0.13.0 --latest`) if an older
tag was published afterwards.

## 7. Verify

```bash
gh release list --repo MajorJohnDoe/gridscalr
gh release view v0.13.0 --repo MajorJohnDoe/gridscalr
```

Open the release page, check that the README download link resolves to it, and
download one artifact to confirm the checksum.

## Notes

- Never publish a release from a working tree with uncommitted changes.
- Never overwrite a published release asset silently; cut a new patch version
  instead.
- The tags `v0.1.1`, `v0.1.2`, `v0.2.0`, `v0.3.0`, `v0.4.0`, `v0.6.1` and `v0.7.1`
  predate this document. Some of them have no GitHub Release.
