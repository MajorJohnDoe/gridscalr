---
name: Code Review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow GridScalr's documented standards?) and Spec (does it match the originating issue?). Runs both reviews in parallel sub-agents and reports them side by side. Use when reviewing a branch, a PR, work in progress, or \"review since X\"."
---

# Code Review

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings. Start every sub-agent with a fresh context window.

> **Repository context.** `AGENTS.md` is authoritative, and it is also the primary standards source. This skill supplements the conductor's defensive verification in `docs/plan/conductor-prompt.md`; it does not replace the SHA, check and scope verification the conductor already performs.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

The issue tracker is **GitHub**, repo `MajorJohnDoe/gridscalr`, reached with the `gh` CLI. Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`), fetched with `gh issue view <n> --json number,title,body,labels`.
2. A path the user passed as an argument.
3. A phase section of the effort plan in `docs/plan/`, matching the branch name (the conductor workflow records one phase per issue, and the plan holds its acceptance criteria).
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

For schema, save, page, source or package changes, the spec is doubly load-bearing: `AGENTS.md` requires a migration fixture, round-trip tests and an invariant test for those, and the Spec axis is where a missing one shows up.

### 3. Identify the standards sources

Search the repo for every file that documents how code should be written. In this repository the list is stable:

- `AGENTS.md` — the non-negotiable product rules, the module-first foundation rules, the documentation policy, the issue-tracking rules and the check list. This is the authoritative standard.
- `CONTRIBUTING.md` — ground rules, fixture and documentation expectations.
- `docs/adr/` — accepted architecture decisions (0001, 0008, 0009, 0013 for structure; 0010–0012 for save, page and source rules).
- `docs/architecture.md` — the source map that says which module owns what.
- `docs/testing.md` — test layers, baselines and the manual visual checklist.
- `docs/project-file.md` — the schema contract, whenever a schema change is in the diff.
- `eslint.config.mjs`, `file-budgets.json`, `rust-commands.json` — the mechanical rules. Mention them only to say "tooling enforces this", never as a finding.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads _what it is_ → _how to fix_; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

Call the `subagent` tool twice **in the same message**, both with `agent: "explore"`, in the foreground, and aggregate the reports they return.

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3 pasted in full** (the sub-agent has no other access to it).
- This repository's structural expectations, stated inline: new logic lives in `src/features/<area>/` behind its `index.ts`; `src/app/App.ts` and `src/canvas/CanvasView.ts` are wiring only (ADR 0001, 0008); `src/model` never imports `src/features`; files target 300 lines and must not exceed 400; Rust commands live in their own module.
- This repository's product invariants to check line by line where the diff touches them: hidden items and hidden layers never render, hit-test or export; locked items stay visible and exportable but cannot be edited; effective layer visibility and lock inherit from ancestors; one bulk action is one undo step; derived quantities are calculated, never stored; invalid colours fall back to a layer or item default, never black; exports use the same visibility and lock rules as the canvas.
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

### 6. What this skill does not decide

It produces findings. It does not merge, re-run CI, or override the conductor's verification. A change still needs the local gate and green CI on the exact SHA before it is reported complete (`AGENTS.md`).

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
