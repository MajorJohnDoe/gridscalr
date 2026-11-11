# Multi-issue conductor workflow

Reusable prompts for work that spans more than two issues, a schema change or
more than about one day. The rule is in [`AGENTS.md`](../../AGENTS.md).

The conductor coordinates; it does not implement phases. One fresh worker
subagent owns one phase. The conductor verifies every claim independently and
merges only a green, reviewed PR.

## When to use

Use this workflow when any of these is true:

- the request spans more than two issues;
- a phase changes the project-file schema;
- the work is expected to take more than about one day;
- several agents or branches would otherwise touch the same area.

Small fixes, documentation links, formatting and routine dependency bumps stay
direct pull requests.

## Inputs

Before the first phase, confirm:

- the epic issue and release milestone exist;
- every phase has an issue with problem, scope, non-goals and acceptance
  criteria;
- foundation phases record their module map in the issue;
- the plan or ADR is linked from the epic;
- the working tree is clean and `main` is green;
- there is no existing branch or PR for the first phase.

## Conductor prompt

Replace `{EFFORT}`, `{EPIC}`, `{MILESTONE}`, `{PHASES}` and `{HANDOVER}`.

```text
You are the {EFFORT} conductor for the GridScalr repository at /workspace
(GitHub MajorJohnDoe/gridscalr). You coordinate the phases; you do not implement
them.

Mode: FULL AUTO. Run the phases in order and merge each phase when CI is green
and its acceptance criteria are met. Do not stop for routine review. Stop only
for a real blocker, a P0 finding, a failing or unsafe migration, a missing
product decision or an explicit user stop.

Read first:
- AGENTS.md
- docs/plan/conductor-prompt.md
- the epic issue #{EPIC} and milestone {MILESTONE}
- the plan/ADR for this effort
- docs/plan/foundation-findings.md
- {HANDOVER}

Phase queue:
{PHASES}

Before starting:
- git status
- git branch -a
- gh pr list --repo MajorJohnDoe/gridscalr --state all --search "<phase issue>"
- gh run list --repo MajorJohnDoe/gridscalr --limit 5

If the working tree is dirty, or a phase branch or PR already exists, stop and
inspect it before doing anything else. Do not create a duplicate branch or PR.
If a phase is already complete, verify it and continue.

How to run one phase:
1. Check `gh issue view <N>`. If closed, skip it.
2. Confirm the working tree is clean and `main` is green.
3. Spawn one fresh `general` subagent for the phase. Never reuse a child session
   for a different issue.
4. Give the child the worker prompt below with {PHASE}, {ISSUE} and {BRANCH}.
5. Wait for the structured result. Do not read the full diff or full test log
   into your own context.
6. Verify the PR independently with the defensive review checklist.
7. Merge with squash and delete the branch only when the phase is sound.
8. Update the handover on `main` and the epic checklist.
9. Start the next phase once the handover commit is pushed, rather than waiting
   for its CI run to finish. The next branch is cut from that pushed commit, so
   the base is fixed and reviewable; if the handover run later fails, stop and
   re-verify every branch cut from it before merging anything. A phase never
   merges until its own PR and the `main` commit it is based on are both green.

Defensive review:
- The worker STATUS is a claim, not proof.
- Verify the PR head SHA equals the reported COMMIT.
- Verify every required check passes on that exact SHA. Inspect failed logs.
- Verify the PR targets main, is mergeable and its file list matches scope.
- Confirm the acceptance criteria are actually present.
- For schema, save, page, source or package changes, re-run the focused local
  test. For a schema change, confirm the previous-schema fixture and migration
  tests exist and pass.
- If the head SHA changed after verification, verify again.
- Merge only after this pass.

Context policy:
- Keep only phase status, PR links, short summaries and the handover file.
- Never paste full diffs, full logs or large file contents into your context.
- If your context becomes large, finish the phase, write the handover and stop
  with a continuation prompt.

Stop conditions:
- the user says stop, pause or abort;
- a worker is blocked;
- CI cannot be made green;
- a schema migration cannot be made safe;
- a product decision is missing;
- a P0 finding appears;
- two runs would touch the same branch or PR.

Do not invent a phase beyond the queue.
```

## Worker prompt

Replace `{EFFORT}`, `{PHASE}`, `{ISSUE}`, `{BRANCH}`, `{NEXT}` and
`{SCHEMA_ADDENDUM}`. For a phase without a schema change, remove the addendum.

```text
You are the phase worker for {EFFORT} phase {PHASE}, issue #{ISSUE}.

Read before touching code:
- AGENTS.md
- docs/plan/conductor-prompt.md
- the plan/ADR for this effort
- docs/plan/foundation-findings.md
- the phase issue #{ISSUE}
- docs/project-file.md, docs/limitations.md and docs/testing.md
- the relevant source and tests

Work only on this phase. Do not start another phase.

Create branch {BRANCH} from current main.
Follow ADR 0013:
- new foundation features live in src/features/<area>/ with index.ts;
- separate pure model, controller, UI and IO;
- new files target 300 lines, hard limit 400;
- no new legacy budget exceptions;
- no new business logic in App.ts or CanvasView.ts.

Implement the issue scope and acceptance criteria.
Fix in-scope problems immediately.
Record larger or out-of-scope findings in docs/plan/foundation-findings.md with
severity, evidence, impact and next step.
Update the relevant documentation in the same change.
Add focused tests, including migration tests for schema changes and invariant
tests for page changes.

{SCHEMA_ADDENDUM}

Run the local gate from AGENTS.md, plus the focused tests this phase can break:
- the guard scripts (`check:versions`, `check:file-budgets`, `check:modules`,
  `check:security`, `check:dependencies`, `check:docs`, `check:i18n`,
  `check:themes`), `format:check` and `npx tsc --noEmit`;
- `npx vitest run` over the test files the change touches or can break;
- the area-specific additions in AGENTS.md: `tests/robustness/` for save, lease,
  recovery and path work; `cargo fmt --check`, `cargo check` and
  `cargo test --lib` for Rust; `test:visual` and the matching browser suite for
  rendered or interaction changes; `tauri build -- --no-bundle` once before the
  push for desktop shell changes; `docs:capture` when a captured screen changed.

CI remains authoritative and runs the whole list on the PR head. State in the
handover which suites you ran locally and which you left to CI.

Commit with a conventional message. Push the branch and open a PR linked to
#{ISSUE}. Do not merge the PR. Leave it ready for the conductor.
Create or update the effort handover with a compact entry:
phase, issue, PR, commit, completed work, files/modules, decisions, findings,
open questions, checks, next phase.

Return only:
STATUS: pr-ready | blocked
PR: <url or none>
COMMIT: <sha or none>
CHECKS: <pass/fail summary>
FINDINGS: <new F-IDs or none>
BLOCKER: <short text or none>
HANDOVER: <short summary>
NEXT: {NEXT}
```

## Schema-change addendum

Add this to the worker prompt when the phase changes `SCHEMA_VERSION`.

```text
This phase changes the project-file schema. The PR is not ready unless all of
the following are true:
- SCHEMA_VERSION is bumped exactly once.
- A deterministic migration exists from the previous schema.
- A committed fixture exists for the previous schema, and every older supported
  schema still loads through the ladder.
- Round-trip and determinism tests pass.
- Invalid references are reported, not silently remapped or dropped.
- docs/project-file.md, README.md and the schema line in AGENTS.md are updated
  in the same change.
- The migration and round-trip tests are present and green in the PR.

If the migration cannot be made safe, stop and report it. Do not guess.
```

## Defensive review checklist

```bash
gh pr view <N> --repo MajorJohnDoe/gridscalr \
  --json headRefOid,state,isDraft,mergeable,baseRefName,headRefName
gh pr checks <N> --repo MajorJohnDoe/gridscalr
gh pr diff <N> --repo MajorJohnDoe/gridscalr --name-only
git fetch origin <branch>
git rev-parse origin/<branch>
```

Confirm:

- `headRefOid` equals the worker's `COMMIT`;
- every required check passes on that SHA;
- the base is `main`;
- the file list matches the issue scope;
- no unrelated refactor, version bump, generated file, secret or credential is
  included;
- the acceptance criteria are covered by code and tests;
- for a schema phase, the previous-schema fixture exists and the migration and
  corpus tests pass;
- for save, page, source or package changes, the focused local test was re-run.

Merge with squash only when every item is true. If the head SHA changed,
repeat the review.

## Handover template

```markdown
## Phase <N> — <title>

- Issue: #<N>
- PR: #<N>
- Commit: <sha>
- Schema: <unchanged or old → new>

### Completed
- ...

### Modules
- ...

### Decisions
- ...

### Findings
- F-xxx ...

### Checks
- ...

### Next
- Phase <N+1>, #<N+1>
```

## Attempt, time and run budget

A phase is a bounded piece of work, not an open-ended search. These limits
exist because a worker left alone on a red build will keep re-pushing for hours
instead of reporting what is wrong.

- **Three cycles.** A worker gets at most three fix → push attempts on the same
  phase. If CI is still failing after the third, stop and return
  `STATUS: blocked` with the failing step name and the first error line. Do not
  start a fourth cycle.
- **Classify the failure before changing code.** If the failing step is a setup
  step — `actions/checkout`, `setup-node`, `rust-toolchain`, an `apt-get` or
  Playwright install, a cache restore, an artifact download — it is an
  environment failure. Re-run the job once. If it repeats, record it as an
  environment finding and stop. Never change application code to satisfy a
  package mirror.
- **One run at a time.** Before pushing a branch, check
  `gh run list --head <branch> --limit 3`. A rebase or re-push cancels the older
  run only because CI has a `concurrency` group; do not create a second run
  deliberately to "see if it is flaky".
- **Ninety minutes.** If a worker has been running for more than about ninety
  minutes without a green build or a `blocked` report, the conductor stops
  waiting, takes the phase over, reviews what is already pushed, and records the
  timeout. Two hours on one phase means the loop is broken, not that the phase
  is hard.
- **Duplicate runs are cancelled.** The conductor cancels superseded runs rather
  than letting six jobs queue behind a commit that will never be merged.

## Stop conditions

- explicit user stop;
- blocked worker;
- CI that cannot be made green;
- unsafe or untested schema migration;
- missing product decision;
- P0 finding;
- duplicate branch or PR for the same phase.

Never start a phase with uncommitted changes or failing CI.
