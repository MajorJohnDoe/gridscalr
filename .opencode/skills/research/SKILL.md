---
name: Research
description: Investigate a question against high-trust primary sources and capture the findings as a cited Markdown file. Use when the user wants a topic researched, PDF/TIFF/Tauri/security facts gathered, or the reading legwork delegated to a background agent.
---

Spin up a **background sub-agent** (`subagent` with `agent: "general"`, `background: true`) to do the research, so you keep working while it reads. Start it with a fresh context window.

> **Repository context.** `AGENTS.md` is authoritative. Research is evidence, not a decision: a finding that changes behaviour still becomes an issue, and a load-bearing conclusion still becomes an ADR.

Its job:

1. Investigate the question against **primary sources** (official docs, source code, specs, first-party APIs), not a secondary write-up of them. Follow every claim back to the source that owns it. For this repository the primary sources are usually: the PDF 32000 specification, the PDF.js source, the TIFF 6.0 specification and ITU T.4/T.6, the Tauri 2 documentation and its Rust/WebView2 issue tracker, the `pdf-lib`/`jsPDF`-equivalent source actually in use, GitHub advisories, and the relevant standard for a symbol or drawing convention.
2. Write the findings to a single Markdown file, citing each claim's source.
3. Save it to `docs/research/<topic>.md`, creating the directory on first use. That is the repository's convention for research notes; do not scatter them elsewhere, and do not put them under `docs/plan/` (that is for in-flight work) or `docs/adr/` (that is for decisions).

## Rules for this repository

- **No customer material.** Do not quote a real drawing, project file, path or customer name. Use `fixtures/industrial-plan.pdf` and the demo project.
- **Cite or drop it.** An uncited claim is a hypothesis; label it as one or leave it out. A research note that mixes sourced fact with the researcher's opinion is worse than no note, because the next agent cannot tell them apart.
- **State the version.** This app is Tauri 2, Vite, TypeScript 7 with the `@typescript/typescript6` alias, PDF.js, and a Rust 1.87 toolchain. A fact about a different major version is not a fact about this one; record the exact version the source describes.
- **Note the expiry.** Say what would invalidate the finding — a dependency bump, a Tauri release, a specification revision — so a later reader knows when to re-check.
- **`check:docs` applies.** The note lives under `docs/`, so `npm run check:docs` will validate its links and anchors. Keep relative links resolvable, and run the check before you finish.
- **Do not act.** The note records what is true; it does not edit `src/`, the schema, or a dependency. Propose the change and let the user decide.
