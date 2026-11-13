---
name: Diagnosing Bugs
description: Disciplined diagnosis loop for hard GridScalr bugs and performance regressions — build a feedback loop that goes red on the bug, minimise it, hypothesise, instrument, fix, regression-test. Use when the user says "diagnose" or "debug this", or reports something broken, throwing, failing or slow.
---

# Diagnosing Bugs

A discipline for hard bugs. Skip phases only when explicitly justified.

When exploring the codebase, read `docs/glossary.md` to get a clear mental model of the relevant modules, and check the ADRs in the area you're touching.

> **Repository context.** `AGENTS.md` is authoritative. A fix that breaks a product invariant is not a fix. Record a correct diagnosis that has no safe seam in `docs/plan/foundation-findings.md` rather than widening the bug.

## Redact

This skill has you show commands, outputs and captured artifacts. **Redact every secret and every drawing path first**: write `<REDACTED>` in its place. Build loops against env vars, so the credential stays in the environment rather than in what you show. Captured artifacts carry auth headers: quote only the lines that carry the signal.

GridScalr-specific: never paste a customer drawing path, a project path containing a customer name, or the contents of a `.gridscalr` file from a real job. Use `fixtures/industrial-plan.pdf` instead. Diagnostics in the app already sanitise paths through `src/model/pathText.ts`; keep that property when you quote output.

If the redacted output is not enough to diagnose the bug, say so and ask the user.

## Phase 1: Build a feedback loop

**This is the skill.** Everything else is mechanical. If you have a **tight** pass/fail signal for the bug (one that goes red on _this_ bug), you will find the cause; bisection, hypothesis-testing, and instrumentation all just consume it. If you don't have one, no amount of staring at code will save you.

Spend disproportionate effort here. **Be aggressive. Be creative. Refuse to give up.**

### Ways to construct one, in roughly this order

This repository already has the harness. Reach for the existing loop before inventing one:

1. **Failing test** at whatever seam reaches the bug: `npx vitest run tests/<file>.test.ts`, or the focused `tests/robustness/` suite for save, lease, page-identity and migration bugs.
2. **A pure-model harness.** Most maths lives in `src/model` and `src/canvas` as pure functions with no DOM — viewport, calibration, geometry, quantity, layer hierarchy. A 20-line script under `/tmp/opencode/` driving the real function is often the tightest loop available.
3. **Pointer-level canvas script.** `npm run test:canvas` and `scripts/canvas-regression.mjs` drive real gestures. Copy one case, narrow it to the failing gesture.
4. **Headless browser script** via Playwright against the browser fallback (`npm run dev`): `npm run test:ui`, `test:import`, `test:count`, `test:touch`, `test:csp`. Assert on canvas output, DOM and console.
5. **Visual diff.** `npm run test:visual` against the committed baselines for shell and dialog regressions; failures write actual and diff images to `visual-regression-failures/`.
6. **CLI invocation with a fixture input**, diffing output against a known-good snapshot: `npm run fixture`, `npm run docs:demo`, `fixtures/legacy/` for migration bugs.
7. **Replay a captured trace.** Save a real payload — a project JSON, a TIFF directory, a PDF page — and replay it through the code path in isolation.
8. **Property / fuzz loop.** If the output is "sometimes wrong", run seeded random inputs. `tests/fuzz.test.ts` shows the pattern and the seeds.
9. **Bisection harness.** `git bisect run` with one of the above as the predicate.
10. **Differential loop.** Same input through the current build and a known-good tag, diffing the outputs — effective for PDF export and raster output.
11. **Desktop shell loop.** `npm run tauri build -- --no-bundle` then `--smoke-test <dir>`, which opens the bundled demo, renders a page through the PDF.js worker, runs OCR, saves and reopens. This is the only loop that covers WebView2, the Tauri path guard and native file I/O.
12. **Performance loop.** `npm run bench:history` and `npm run bench:large` against the budgets in `docs/limitations.md`. Measure before you fix.
13. **HITL bash script.** Last resort. If a human must click, drive _them_ with `scripts/hitl-loop.template.sh` so the loop is still structured. Captured output feeds back to you.

Build the right feedback loop, and the bug is 90% fixed.

### Tighten the loop

Treat the loop as a product. Once you have _a_ loop, **tighten** it:

- Can I make it faster? (Cache setup, skip unrelated init, narrow the test scope.)
- Can I make the signal sharper? (Assert on the specific symptom, not "didn't crash".)
- Can I make it more deterministic? (Pin time, seed RNG, isolate filesystem, freeze network.)

A 30-second flaky loop is barely better than no loop; a 2-second deterministic one is tight, a debugging superpower.

### Non-deterministic bugs

The goal is not a clean repro but a **higher reproduction rate**. Loop the trigger 100×, parallelise, add stress, narrow timing windows, inject sleeps. A 50%-flake bug is debuggable; 1% is not, so keep raising the rate until it's debuggable.

Concurrency bugs in this codebase usually live in the save lease, autosave, and the renderer/document cache. `tests/robustness/` holds the seeded competing-save sequences; start there rather than writing your own.

### When you genuinely cannot build a loop

Stop and say so explicitly. List what you tried. Ask the user for: (a) access to whatever environment reproduces it, (b) a redacted captured artifact (project file, log, trace, screen recording with timestamps), or (c) permission to add temporary instrumentation. Do **not** proceed to hypothesise without a loop.

The one common exception: a bug that only exists on Windows or macOS. Then the loop is CI's `desktop` matrix or a `tauri build` on the affected platform, and you should say so instead of guessing from Linux.

### Completion criterion: a tight loop that goes red

Phase 1 is done when the loop is **tight** and **red-capable**: you can name **one command** (a script path, a test invocation, a curl) that you have **already run at least once** (show the invocation and its output, redacted), and that is:

- [ ] **Red-capable**: it drives the actual bug code path and asserts the **user's exact symptom**, so it can go red on this bug and green once fixed. Not "runs without erroring"; it must be able to _catch this specific bug_.
- [ ] **Deterministic**: same verdict every run (flaky bugs: a pinned, high reproduction rate, per above).
- [ ] **Fast**: seconds, not minutes.
- [ ] **Agent-runnable**: you can run it unattended; a human in the loop only via `scripts/hitl-loop.template.sh`.

If you catch yourself reading code to build a theory before this command exists, **stop: jumping straight to a hypothesis is the exact failure this skill prevents.** No red-capable command, no Phase 2.

## Phase 2: Reproduce + minimise

Run the loop. Watch it go red as the bug appears.

Confirm:

- [ ] The loop produces the failure mode the **user** described, not a different failure that happens to be nearby. Wrong bug = wrong fix.
- [ ] The failure is reproducible across multiple runs (or, for non-deterministic bugs, reproducible at a high enough rate to debug against).
- [ ] You have captured the exact symptom (error message, wrong output, slow timing) so later phases can verify the fix actually addresses it.

### Minimise

Once it's red, shrink the repro to the **smallest scenario that still goes red**. Cut inputs, callers, config, data, and steps **one at a time**, re-running the loop after each cut, and keep only what's load-bearing for the failure.

Why bother: a minimal repro shrinks the hypothesis space in Phase 3 (fewer moving parts left to suspect) and becomes the clean regression test in Phase 5.

Done when **every remaining element is load-bearing**: removing any one of them makes the loop go green.

Do not proceed until you have reproduced **and** minimised.

## Phase 3: Hypothesise

Generate **3–5 ranked hypotheses** before testing any of them. Single-hypothesis generation anchors on the first plausible idea.

Each hypothesis must be **falsifiable**: state the prediction it makes.

> Format: "If <X> is the cause, then <changing Y> will make the bug disappear / <changing Z> will make it worse."

If you cannot state the prediction, the hypothesis is a vibe: discard or sharpen it.

**Show the ranked list to the user before testing.** They often have domain knowledge that re-ranks instantly ("we just deployed a change to #3"), or know hypotheses they've already ruled out. Cheap checkpoint, big time saver. Don't block on it; proceed with your ranking if the user is AFK.

## Phase 4: Instrument

Each probe must map to a specific prediction from Phase 3. **Change one variable at a time.**

Tool preference:

1. **Debugger / REPL inspection** if the env supports it. One breakpoint beats ten logs.
2. **Targeted logs** at the boundaries that distinguish hypotheses.
3. Never "log everything and grep".

**Tag every debug log** with a unique prefix, e.g. `[DEBUG-a4f2]`. Cleanup at the end becomes a single grep. Untagged logs survive; tagged logs die.

**Perf branch.** For performance regressions, logs are usually wrong. Instead: establish a baseline measurement (timing harness, `performance.now()`, profiler, query plan), then bisect. Measure first, fix second. The project budgets are in `docs/limitations.md`.

## Phase 5: Fix + regression test

Write the regression test **before the fix**, but only if there is a **correct seam** for it.

A correct seam is one where the test exercises the **real bug pattern** as it occurs at the call site. If the only available seam is too shallow (single-caller test when the bug needs multiple callers, unit test that can't replicate the chain that triggered the bug), a regression test there gives false confidence.

**If no correct seam exists, that itself is the finding.** Note it. The codebase architecture is preventing the bug from being locked down. Flag this for the next phase.

If a correct seam exists:

1. Turn the minimised repro into a failing test at that seam.
2. Watch it fail. If you forced the red by mutating code or a fixture, `diff` against a pristine copy to prove the mutation landed before you trust it.
3. Apply the fix.
4. Watch it pass.
5. Re-run the Phase 1 feedback loop against the original (un-minimised) scenario.

Where the fix touches save, pages, sources or the schema, `AGENTS.md` requires more than one test: a migration fixture for the previous schema, round-trip and determinism tests, and an invariant test for the operation. A one-test fix is incomplete there.

## Phase 6: Cleanup

Required before declaring done:

- [ ] Original repro no longer reproduces (re-run the Phase 1 loop)
- [ ] Regression test passes (or absence of seam is documented)
- [ ] All `[DEBUG-...]` instrumentation removed (`grep` the prefix)
- [ ] Throwaway prototypes deleted, or left under `/tmp/opencode/` and referenced from nothing
- [ ] The hypothesis that turned out correct is stated in the commit / PR message, so the next debugger learns
- [ ] If the bug could recur, ask whether a check should catch it — the repo has a `check:*` command family and a pre-merge CI gate to extend
