## Summary

<!-- What changed, and why? -->

## Scope

- [ ] User-facing UI or workflow change
- [ ] Model, project format or migration change
- [ ] Export or report change
- [ ] Desktop shell or file I/O change
- [ ] Documentation only

## Documentation impact

- [ ] `docs/user-guide.md` is up to date
- [ ] `docs/workflows.md` is up to date for operations and property-management use
- [ ] `docs/shortcuts.md` and the README shortcut table are up to date
- [ ] `README.md` reflects navigation, menus, panels, exports or architecture changes
- [ ] Affected screenshots were regenerated with `npm run docs:capture`
- [ ] `Help → About` still reads its version and schema from the code
- [ ] No screenshot shows a previous interface

## Verification

- [ ] `npm run check:versions`
- [ ] `npm run check:docs`
- [ ] `npx tsc --noEmit`
- [ ] `npm test -- --run`
- [ ] `npm run build`
- [ ] `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
- [ ] `cargo check --manifest-path src-tauri/Cargo.toml`
- [ ] `npm run tauri build -- --no-bundle` (desktop shell changes)

## Notes for reviewers

<!-- Edge cases, manual checks, screenshots, follow-up work. -->
