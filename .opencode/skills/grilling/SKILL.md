---
name: Grilling
description: Interview the user relentlessly about a plan, decision or idea until every branch of the design tree is resolved. Use when stress-testing a design, when a product decision needs settling, or when the user invokes "grill me".
---

> **Repository context.** `AGENTS.md` is authoritative. Use `docs/glossary.md` vocabulary in every question, and respect the ADRs in `docs/adr/` rather than reopening them implicitly — if an answer would contradict one, say so and ask whether to revisit it.
>
> In this repository a settled, load-bearing decision usually earns an **ADR** (format and numbering in `docs/adr/README.md`), a durable idea earns a row in `docs/glossary.md`, and a large out-of-scope finding earns an entry in `docs/plan/foundation-findings.md`. Offer those as side effects when they apply; don't create them mid-round.
>
> Some questions here are not the user's to answer alone — they are product rules in `AGENTS.md` (hidden items never export, locked items never move, one bulk action is one undo step). Treat those as settled prerequisites, not frontier decisions.

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Word each question so "yes" accepts your recommended answer.

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent with a fresh context window to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.
