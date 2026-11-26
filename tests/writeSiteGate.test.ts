import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  countWriteSites,
  evaluateWriteSites,
  findWriteSites,
  planUpdate,
  validateBudget,
} from "../scripts/write-site-rules.mjs";

const root = resolve(__dirname, "..");
const REASON = "Gesture-time draft edits write through the store before a command module exists.";

function count(source: string) {
  return countWriteSites(source);
}

function entry(file: string, sites: number) {
  return { file, count: sites };
}

describe("write-site analyzer", () => {
  it("counts a direct project write in a mutate closure", () => {
    const sites = findWriteSites(`store.mutate((project) => {
      project.name = "Plan";
    }, "change");`);
    expect(sites).toMatchObject([
      { kind: "assign", root: "project", target: "project.name", line: 2 },
    ]);
  });

  it("counts compound assignments and delete on a callback parameter", () => {
    expect(
      count(`store.mutate((target) => {
        target.count += 1;
        delete target.labelOffset;
      }, "change");`),
    ).toBe(2);
  });

  it("ignores local declarations and unrelated local objects", () => {
    expect(
      count(`store.mutate((project) => {
        const next = { count: 0 };
        next.count = project.layers.length;
        let total = 0;
        total += 1;
      }, "change");`),
    ).toBe(0);
  });

  it("passes a command-backed closure", () => {
    expect(
      count(`store.mutate((project) => {
        setItemsColor(project, refs, "#ff0000");
        deleteItems(project, refs);
      }, "change");`),
    ).toBe(0);
  });

  it("passes a declaration-only closure", () => {
    expect(
      count(`store.mutate((project) => {
        const total = project.layers.length;
        let label = "";
      }, "change");`),
    ).toBe(0);
  });

  it("handles nested callbacks", () => {
    expect(
      count(`store.mutate((project) => {
        project.layers.forEach((layer) => {
          layer.visible = false;
        });
        project.items.map((item) => {
          item.label = "A";
          return item;
        });
      }, "change");`),
    ).toBe(2);
  });

  it("counts a nested mutate callback once", () => {
    expect(
      count(`store.mutate((project) => {
        project.name = "outer";
        store.mutate((current) => {
          current.name = "inner";
        }, "change");
      }, "change");`),
    ).toBe(2);
  });

  it("ignores comments and strings that look like writes", () => {
    expect(
      count(`store.mutate((project) => {
        // project.name = "comment";
        const text = "delete project.name";
      }, "change");`),
    ).toBe(0);
  });
});

describe("write-site budget", () => {
  it("fails a new inline site in a file at its reviewed count", () => {
    const result = evaluateWriteSites({
      config: { total: 2, files: { "src/a.ts": 1, "src/b.ts": 1 } },
      entries: [entry("src/a.ts", 1), entry("src/b.ts", 2)],
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toMatchObject([{ file: "src/b.ts", count: 2, budget: 1 }]);
  });

  it("fails a new file with no reviewed budget", () => {
    const result = evaluateWriteSites({
      config: { total: 2, files: { "src/a.ts": 1, "src/b.ts": 1 } },
      entries: [entry("src/a.ts", 1), entry("src/b.ts", 1), entry("src/new.ts", 1)],
    });
    expect(result.ok).toBe(false);
    expect(result.violations).toMatchObject([{ file: "src/new.ts", count: 1, budget: 0 }]);
    expect(result.totalViolation).toBe(true);
  });

  it("passes command-backed and declaration-only closures", () => {
    const result = evaluateWriteSites({
      config: { total: 0, files: {} },
      entries: [entry("src/commands.ts", 0), entry("src/declarations.ts", 0)],
    });
    expect(result.ok).toBe(true);
    expect(result.violations).toEqual([]);
  });

  it("fails when the total grows even if per-file budgets pass", () => {
    const result = evaluateWriteSites({
      config: { total: 1, files: { "src/a.ts": 2, "src/b.ts": 2 } },
      entries: [entry("src/a.ts", 1), entry("src/b.ts", 1)],
    });
    expect(result.violations).toEqual([]);
    expect(result.totalViolation).toBe(true);
    expect(result.ok).toBe(false);
  });

  it("only lowers and prunes on --update", () => {
    const update = planUpdate({
      config: {
        total: 10,
        files: { "src/a.ts": 5, "src/b.ts": 2, "src/gone.ts": 1 },
      },
      entries: [entry("src/a.ts", 3), entry("src/b.ts", 2), entry("src/gone.ts", 0)],
    });
    expect(update.ok).toBe(true);
    expect(update.next).toEqual({ total: 5, files: { "src/a.ts": 3, "src/b.ts": 2 } });
    expect(update.updated).toBe(1);
    expect(update.pruned).toBe(1);
  });

  it("refuses --update growth instead of raising a budget", () => {
    const update = planUpdate({
      config: { total: 5, files: { "src/a.ts": 1 } },
      entries: [entry("src/a.ts", 2)],
    });
    expect(update.ok).toBe(false);
    expect(update.next).toBeUndefined();
    expect(update.growth).toMatchObject([{ file: "src/a.ts", count: 2, budget: 1 }]);
  });

  it("refuses --update for a new file with an inline site", () => {
    const update = planUpdate({
      config: { total: 5, files: { "src/a.ts": 1 } },
      entries: [entry("src/a.ts", 1), entry("src/new.ts", 1)],
    });
    expect(update.ok).toBe(false);
    expect(update.growth).toMatchObject([{ file: "src/new.ts", count: 1, budget: 0 }]);
  });

  it("keeps a reviewed reason when lowering an exception", () => {
    const update = planUpdate({
      config: { total: 5, files: { "src/a.ts": { max: 4, reason: REASON } } },
      entries: [entry("src/a.ts", 2)],
    });
    expect(update.ok).toBe(true);
    expect(update.next?.files?.["src/a.ts"]).toEqual({ max: 2, reason: REASON });
    expect(update.next?.total).toBe(2);
  });

  it("keeps the committed baseline valid", () => {
    const config = JSON.parse(readFileSync(resolve(root, "write-sites.json"), "utf8"));
    expect(validateBudget(config)).toEqual([]);
    expect(config.total).toBeGreaterThan(0);
  });
});
