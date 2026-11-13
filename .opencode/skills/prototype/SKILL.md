---
name: Prototype
description: Build a throwaway prototype to answer a design question — a logic/state model as one self-contained HTML file, or several radical UI variations in a dev lab page. Use to sanity-check whether a state model feels right, to explore what a panel or dialog should look like, or to settle a layout question before committing to an issue.
---

# Prototype

A prototype is **throwaway code that answers a question**. The question decides the shape.

> **Repository context.** `AGENTS.md` is authoritative. A prototype is not a change: it never enters `src/`, never becomes a documented screen, and never ships. What ships is the decision it settled.
>
> Two repository rules constrain the artifacts: the UI has **no framework and no router** (TypeScript + HTML5 Canvas + Vite), so guidance written for routed React apps does not apply; and the screenshot manifest plus `tests/visual/` baselines are a documentation contract, so a prototype must never touch them.

## Pick a branch

Identify which question is being answered, using the user's prompt, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → [LOGIC.md](LOGIC.md). Build a single shareable HTML file (free-play buttons plus tabbed guided walkthroughs) that pushes the state machine through cases that are hard to reason about on paper, and that a non-developer can drive. **This branch is unmodified and applicable as written**: one file, no bundler, no server, opened by double-click, and it can import the real pure modules from `src/model` and `src/canvas` so the prototype exercises the actual rules rather than a re-implementation.
- **"What should this look like?"** → [UI.md](UI.md) for the *method* (several radically different variants, one switcher, judge against a populated screen). Its routing and framework mechanics do **not** apply here; use the repository's lab pattern below instead.

The two branches produce very different artifacts, so getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a model module → logic; a panel or dialog → UI) and state the assumption at the top of the prototype.

## The UI branch in this repository

The repo already has a prototype harness, so use it rather than inventing one:

- Put variants in `dev/<name>-lab.html`, following `dev/sheet-lab.html` and `dev/sheetLab.css`.
- Serve it with a `lab:<name>` script alongside the existing `lab:sheet` (`vite --port 1420 --strictPort --open /dev/<name>-lab.html`).
- Render every variant **on that one page**, switchable from a bar at the bottom, with a `?variant=` query param so a reload keeps the current one and a URL can be pasted into an issue.
- Import the real `src/styles/tokens.css` and the relevant panel stylesheet, so the variants are judged with real colours, real density and real type sizes rather than a neutral mock.
- Populate the variant with the demo project's real content (`fixtures/demo-project.gridscalr`), not lorem ipsum. An empty panel hides exactly the density problems you are trying to find.

`dev/` is covered by `format:check` and **not** by `check:i18n`, so a lab may use literal text while you are experimenting. Run `npm run format` before committing anything you keep.

## Rules that apply to both

1. **Throwaway from day one, and clearly marked as such.** Name it so a casual reader sees it is a prototype, not production. A logic prototype lives under `/tmp/opencode/prototypes/<slug>/` and never enters the repository. A UI lab lives in `dev/` and is deleted before the pull request unless you and the user deliberately keep it as a harness, the way `dev/sheet-lab.html` was kept — and if it is kept, it is a development tool, not a documented screen.
2. **Trivial to run.** A UI prototype starts from one command in the project's task runner (`npm run lab:<name>`). A logic demo is a single HTML file the user double-clicks. Either way, no thinking required to start it.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is _checking_, not something it should depend on. This app has real autosave, a recovery store and a save lease; a prototype must not write to any of them, and must not open or save a project file.
4. **Skip the polish.** No tests, no i18n, no error handling beyond what makes the prototype _runnable_, no abstractions. The point is to learn something fast.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed.
6. **Never touch the documentation contract.** No edits to `docs/screenshots/`, `docs/screenshots/manifest.json`, `tests/visual/` or `scripts/docs-capture-flow.mjs`. A prototype variant that looks right is evidence for an issue; it is not a screenshot.
7. **Capture it when done.** Fold any validated decision into the real code, then record the answer — the verdict and the question it settled — on the implementation issue or in an ADR. The repository keeps the validated decision, not the prototype.

## Exit criteria

The prototype is done when the user can state the decision it settled in one sentence. If that sentence is still missing, the prototype was not the bottleneck: the question was underspecified, and `grilling` is the better tool.
