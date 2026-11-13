import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkWorkflows, checkWorkflowText, parseUsesLine } from "../scripts/check-action-pins.mjs";

const root = resolve(__dirname, "..");
const PIN = "3d3c42e5aac5ba805825da76410c181273ba90b1";

function workflow(...lines: string[]) {
  return `jobs:\n  build:\n    steps:\n${lines.map((line) => `      ${line}`).join("\n")}\n`;
}

function messages(text: string) {
  return checkWorkflowText(text, "workflow.yml").issues.map((issue) => issue.message);
}

describe("action pin parser", () => {
  it("reads a bare reference and its version comment", () => {
    expect(parseUsesLine(`      - uses: actions/checkout@${PIN} # v7.0.1`)).toEqual({
      reference: `actions/checkout@${PIN}`,
      label: "v7.0.1",
    });
  });

  it("accepts a quoted reference and ignores other keys", () => {
    expect(parseUsesLine(`uses: "actions/checkout@${PIN}"`)).toEqual({
      reference: `actions/checkout@${PIN}`,
      label: "",
    });
    expect(parseUsesLine("      with:")).toBeNull();
    expect(parseUsesLine("      # uses: actions/checkout@v4")).toBeNull();
  });

  it("keeps a container reference whole", () => {
    expect(parseUsesLine("uses: docker://alpine@sha256:abc")?.reference).toBe(
      "docker://alpine@sha256:abc",
    );
  });
});

describe("action pin check", () => {
  it("passes a full SHA with a version comment", () => {
    const result = checkWorkflowText(
      workflow(`- uses: actions/checkout@${PIN} # v7.0.1`),
      "ci.yml",
    );
    expect(result.issues).toEqual([]);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].action).toBe("actions/checkout");
  });

  it("fails a major tag and names the offending reference", () => {
    const issues = checkWorkflowText(workflow("- uses: actions/checkout@v4"), "ci.yml").issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ file: "ci.yml", line: 4, reference: "actions/checkout@v4" });
    expect(issues[0].message).toContain("40-character commit SHA");
  });

  it("fails a branch, a short SHA and a missing ref", () => {
    expect(messages(workflow("- uses: dtolnay/rust-toolchain@stable"))[0]).toContain(
      "a tag or branch",
    );
    expect(messages(workflow("- uses: actions/checkout@3d3c42e"))[0]).toContain("a short SHA");
    expect(messages(workflow("- uses: actions/checkout"))[0]).toContain("no @ref");
  });

  it("fails a pin without a version comment", () => {
    expect(messages(workflow(`- uses: actions/checkout@${PIN}`))[0]).toContain("# <version>");
  });

  it("allows a local action and requires a digest for a container", () => {
    expect(messages(workflow("- uses: ./scripts/local"))).toEqual([]);
    expect(messages(workflow("- uses: docker://alpine:3"))[0]).toContain("@sha256: digest");
    expect(messages(workflow(`- uses: docker://alpine@sha256:${"0".repeat(64)}`))).toEqual([]);
  });

  it("rejects one action release pinned to two different SHAs", () => {
    const files = new Map([
      ["ci.yml", workflow(`- uses: actions/checkout@${PIN} # v7.0.1`)],
      ["pages.yml", workflow(`- uses: actions/checkout@${"a".repeat(40)} # v7.0.1`)],
    ]);
    const { issues } = checkWorkflows(files);
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain("use one SHA per release");
  });

  it("keeps every shipped workflow pinned", () => {
    const dir = join(root, ".github", "workflows");
    const files = new Map(
      readdirSync(dir)
        .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
        .map((name) => [name, readFileSync(join(dir, name), "utf8")] as const),
    );
    const { issues, actions } = checkWorkflows(files);
    expect(issues).toEqual([]);
    expect(actions.size).toBeGreaterThan(5);
  });
});
