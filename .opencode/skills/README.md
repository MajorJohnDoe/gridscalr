# Agent skills

Reusable procedures for agents working in this repository. OpenCode discovers
each directory here by its `SKILL.md`; the directory name is the skill ID.

`AGENTS.md` is authoritative. Where a skill and `AGENTS.md` disagree,
`AGENTS.md` wins. A skill never introduces a second work process alongside the
conductor workflow in [`docs/plan/conductor-prompt.md`](../../docs/plan/conductor-prompt.md).

## What is here

| ID | Use it when |
| --- | --- |
| `codebase-design` | Designing a module interface, placing a seam, judging whether a module earns its keep |
| `improve-codebase-architecture` | Surveying for deepening candidates before choosing the next foundation phase |
| `code-review` | Reviewing a branch or PR along the Standards and Spec axes |
| `diagnosing-bugs` | A hard bug or performance regression, where a feedback loop is the work |
| `writing-for-agents` | Editing this file, `AGENTS.md`, a skill, or any doc reached by a pointer |
| `grilling` | Stress-testing a design or settling a product decision |
| `retro` | Improving the agent's environment after a session |
| `tdd` | Building a feature or fixing a bug test-first |
| `prototype` | Answering a UI or state-model question with throwaway code |
| `research` | Delegating reading to a background agent, with citations |

## Provenance

Adapted from [`mattpocock/skills`](https://github.com/mattpocock/skills) at
commit `5863806dd4e15c63174bee4e7515a4256792ecfa` (2026-11-12), MIT licensed.
The licence text is in [`LICENSE-mattpocock-skills.txt`](LICENSE-mattpocock-skills.txt).

Upstream keeps its own layout (`skills/engineering/…`, `skills/productivity/…`)
and an `agents/openai.yaml` per skill; those were dropped because OpenCode does
not use them. The pristine upstream copy of every adopted skill is kept outside
the repository so a future update can be diffed rather than guessed at.

## How these differ from upstream

Every `SKILL.md` carries a **Repository context** block that upstream does not
have, and each was changed where the upstream assumptions do not hold here:

- `docs/glossary.md` replaces the upstream `GLOSSARY.md`; `docs/adr/` was
  already the right path.
- The issue tracker is GitHub via `gh` (`MajorJohnDoe/gridscalr`), configured
  inline. Upstream asks you to run a separate setup skill for this.
- `improve-codebase-architecture` writes its report to `/tmp/opencode`, and its
  side effects are documented inline instead of delegating to a
  `domain-modeling` skill that is not adopted.
- `code-review` names this repository's standards sources, and carries the
  product invariants the standards axis must check.
- `diagnosing-bugs` maps its feedback-loop catalogue onto the existing harness
  (`vitest`, `tests/robustness`, `test:canvas`, `test:visual`, `--smoke-test`,
  `bench:*`) and adds the redaction rule for drawing and project paths.
- `tdd` names the Vitest seams and the invariant tests that `AGENTS.md`
  requires for save, page, source and schema changes.
- `prototype` uses the `dev/<name>-lab.html` harness instead of a router, and
  forbids touching `tests/visual/` or `docs/screenshots/`.
- `research` writes to `docs/research/`.
- `retro` routes each kind of improvement to the artifact this repository
  actually uses, and drops the `CODING_STANDARDS.md` convention.

## Adding or updating a skill

- One directory per skill, with `SKILL.md` at its root. Supporting files go
  beside it; OpenCode does not look inside a skill directory for more skills.
- Frontmatter needs a `description` or the skill is never advertised. Set
  `disable-model-invocation: true` for anything that should only run when the
  user asks for it.
- Skills are documentation, not code. Nothing here is covered by
  `check:file-budgets`, `check:i18n` or `check:docs`, and Prettier ignores
  Markdown. That is not a licence to let it rot: a skill that describes a
  command that no longer exists is worse than no skill.
- Update this table in the same change.
