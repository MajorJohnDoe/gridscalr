---
name: Retro
description: "Retrospective on a coding session: suggest improvements to the agent's environment — navigation, automated checks, coding standards, steering files, tooling — most severe first. Use after a session went badly or a phase needs its process tightened."
disable-model-invocation: true
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Call the Skill tool with `writing-for-agents` for the writing style guide.

2. Read the primary sources for the session the user specifies. This may mean searching through session logs on this machine. If the user doesn't specify a session, default to the current one.

3. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json`/build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Default to building the check over writing the rule. Reserve `CODING_STANDARDS.md` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the reviewer agent failed to catch a mistake.
- **Global AGENTS.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the AGENTS.md file is particularly large - in the repo OR the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

4. Present these candidates to the user, in order of severity.

## Reference

### Implementation vs Review

Remember that all work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

This repository's equivalents, and where each improvement belongs:

| Improvement kind | Artifact |
| --- | --- |
| Navigation pointer, precedence, product rule | `AGENTS.md` |
| Mechanical rule (syntax, import shape, file location, text) | a `npm run check:*` command in `scripts/`, wired into `.github/workflows/ci.yml` |
| Process for multi-issue work | `docs/plan/conductor-prompt.md` |
| Contribution-side rules | `CONTRIBUTING.md` |
| Durable design decision | an ADR in `docs/adr/` |
| Domain term | `docs/glossary.md` |
| Test layers and the manual visual checklist | `docs/testing.md` |
| Larger out-of-scope finding | `docs/plan/foundation-findings.md`, then an issue |
| Reusable agent procedure | a skill under `.opencode/skills/` |

- `AGENTS.md`: pushed into the context window of every agent in this repo. Use it **sparingly**: navigation pointers, precedence, and rules that no check can enforce. It is already long; a retro that makes it longer needs a very good reason, and one that moves a rule into a check is almost always right.
- **Coding standards**: this repo has none as a standalone file. The standards live in `AGENTS.md`, `CONTRIBUTING.md`, the ADRs and `docs/architecture.md`. Do not create a parallel `CODING_STANDARDS.md`; add a mechanical rule to a check first, and a judgement-call rule to `AGENTS.md`.
- Docs: use `docs/` as reference files, pointed to by other files. Look for an existing doc before writing a new one — `check:docs` validates links, anchors, images and the shortcut tables, but it cannot tell you the doc was unnecessary.
- Skills: use skills for procedures (their description enters the context window) or for user-invoked commands. Follow the advice in `writing-for-agents`.

