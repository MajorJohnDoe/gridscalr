# ADR 0004: Cross-platform release and unsigned builds

- Status: Accepted
- Date: 2026-11-01
- Deciders: GridScalr maintainer
- Supersedes: none

## Context

GridScalr is a Tauri desktop application. Windows installers are published today;
macOS and Linux can be built from source but have no automated artifacts. The 1.0
goal is to ship files for all three platforms.

The maintainer has accepted unsigned 1.0 artifacts for now. Windows SmartScreen and
macOS Gatekeeper therefore remain part of the installation experience and must be
documented honestly.

## Decision

### Platforms and artifacts

| Platform | Architecture | Artifacts |
| --- | --- | --- |
| Windows | x64 | NSIS installer, MSI, portable `.exe` |
| macOS | Universal Intel + Apple Silicon | DMG, `.app.zip` |
| Linux | x86_64 | AppImage, deb, tar.gz |

Linux ARM64, Windows ARM64 and separate macOS architectures can be added later if
the universal build or demand requires them.

### Release flow

- A tag matching `v*` builds every platform.
- The release build is a GitHub Actions matrix using the native runners.
- Each platform produces its own checksums, plus a combined checksum file when the
  artifacts are assembled.
- Publishing a GitHub Release remains a manual maintainer step from tested
  artifacts; no automatic release job is added without a separate decision.
- Pull requests that touch the desktop shell run a non-bundled desktop build on the
  Windows, macOS and Linux matrix.
- Release candidates are tested on clean machines before `latest`.

### Unsigned distribution

- Windows artifacts are not code-signed for 1.0. The README, website and release
  notes explain SmartScreen and SHA-256 verification.
- macOS artifacts are not signed or notarized for 1.0. Gatekeeper requires the user
  to approve the app through System Settings → Privacy & Security; the README and
  release notes must explain this with current macOS wording.
- Linux artifacts are distributed without a signature; checksums are published.

Signing and notarization are tracked separately and must not block 1.0 unless the
decision changes.

### Website and metadata

`site/release.json` must describe per-platform assets. The site must:

- list all three platforms and their files,
- never link to an unpublished asset,
- distinguish unsigned builds,
- keep the current release metadata updated for every tag.

## Consequences

- The release workflow and documentation grow from one platform to three.
- macOS universal builds need both Rust targets and careful testing.
- Gatekeeper friction is real but visible and documented.
- CI time and runner cost increase.
- Future signing/notarization can be inserted into the same workflow without
  changing artifact names or the site structure.

## Enforcement

- `docs/releasing.md` documents the per-platform verification.
- `AGENTS.md` requires the site release metadata update for every tag.
- A release is not complete until all declared platform artifacts and checksums
  exist and the live download links resolve.

## Related issues

- [#41](https://github.com/MajorJohnDoe/gridscalr/issues/41) — cross-platform builds
- [#53](https://github.com/MajorJohnDoe/gridscalr/issues/53) — 1.0 hardening
- [#56](https://github.com/MajorJohnDoe/gridscalr/issues/56) — signing and notarization
