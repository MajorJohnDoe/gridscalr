import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  auditCommandFailure,
  evaluateGate,
  formatSummary,
  parseCargoAudit,
  parseNpmAudit,
  validateAllowlist,
} from "../scripts/dependency-gate.mjs";
import type { Allowlist, AllowlistEntry } from "../scripts/dependency-gate.mjs";

const NOW = new Date("2026-11-11T12:00:00Z");

function emptyNpmReport() {
  return { auditReportVersion: 2, vulnerabilities: {}, metadata: { vulnerabilities: {} } };
}

function emptyCargoReport() {
  return {
    vulnerabilities: { found: false, count: 0, list: [] },
    warnings: { unmaintained: [], unsound: [], notice: [] },
  };
}

function npmVia(name: string, severity: string, advisory: string, title = "Fake advisory") {
  return {
    source: 1,
    name,
    dependency: name,
    title,
    url: `https://github.com/advisories/${advisory}`,
    severity,
    range: "*",
  };
}

function npmReportWith(via: ReturnType<typeof npmVia>) {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      [via.name]: { name: via.name, severity: via.severity, via: [via] },
    },
    metadata: { vulnerabilities: {} },
  };
}

function cargoWarning(kind: string, pkg: string, advisory: string, title = "Fake warning") {
  return {
    kind,
    package: { name: pkg, version: "1.0.0" },
    advisory: { id: advisory, package: pkg, title },
  };
}

function cargoVulnerability(pkg: string, advisory: string, cvss: number | null) {
  return {
    kind: "vulnerability",
    package: { name: pkg, version: "1.0.0" },
    advisory: { id: advisory, package: pkg, title: "Fake vulnerability", cvss },
  };
}

function emptyAllowlist(): Allowlist {
  return { reviewed: "2026-11-11", entries: [] };
}

function entry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    ecosystem: "npm",
    package: "minimatch",
    advisory: "GHSA-AAAA-BBBB-CCCC",
    reason: "Development-only tooling advisory with no shipped code path.",
    reviewedAt: "2026-11-11",
    reviewBy: "2027-02-11",
    ...overrides,
  };
}

function gate(npmReport: unknown, cargoReport: unknown, allowlist: Allowlist = emptyAllowlist()) {
  return evaluateGate({ npmReport, cargoReport, allowlist, now: NOW });
}

describe("dependency gate parsing", () => {
  it("reads a clean npm and cargo report", () => {
    const result = gate(emptyNpmReport(), emptyCargoReport());
    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it("extracts a leaf npm advisory from the via chain", () => {
    const report = npmReportWith(npmVia("minimatch", "moderate", "GHSA-g3hv-75wg-m249"));
    expect(parseNpmAudit(report)).toEqual([
      {
        ecosystem: "npm",
        package: "minimatch",
        advisory: "GHSA-G3HV-75WG-M249",
        severity: "moderate",
        kind: "vulnerability",
        title: "Fake advisory",
        url: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
      },
    ]);
  });

  it("reads cargo warnings and vulnerabilities", () => {
    const report = {
      vulnerabilities: {
        found: true,
        count: 1,
        list: [cargoVulnerability("openssl", "RUSTSEC-2026-0001", 9.8)],
      },
      warnings: { unsound: [cargoWarning("unsound", "glib", "RUSTSEC-2024-0429")] },
    };
    const findings = parseCargoAudit(report);
    expect(findings.map((finding) => `${finding.package}:${finding.severity}`)).toEqual([
      "openssl:critical",
      "glib:warning",
    ]);
  });

  it("fails closed on an unreadable report", () => {
    expect(() => parseNpmAudit({ error: { summary: "ECONNRESET" } })).toThrow(/ECONNRESET/);
    expect(() => parseNpmAudit({})).toThrow(/no vulnerabilities object/);
    expect(() => parseCargoAudit({})).toThrow(/no vulnerabilities object/);
  });
});

describe("dependency gate threshold", () => {
  it("blocks a new high npm advisory that is not accepted", () => {
    const result = gate(
      npmReportWith(npmVia("minimatch", "high", "GHSA-g3hv-75wg-m249")),
      emptyCargoReport(),
    );
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
    expect(result.blocking[0]).toMatchObject({
      advisory: "GHSA-G3HV-75WG-M249",
      reason: "not in the allowlist",
    });
  });

  it("blocks a new moderate advisory at the documented threshold", () => {
    const result = gate(
      npmReportWith(npmVia("minimatch", "moderate", "GHSA-g3hv-75wg-m249")),
      emptyCargoReport(),
    );
    expect(result.ok).toBe(false);
    expect(result.blocking).toHaveLength(1);
  });

  it("blocks an unaccepted cargo vulnerability", () => {
    const report = {
      vulnerabilities: {
        found: true,
        count: 1,
        list: [cargoVulnerability("zip", "RUSTSEC-2026-0002", 7.5)],
      },
      warnings: { unmaintained: [], unsound: [], notice: [] },
    };
    const result = gate(emptyNpmReport(), report);
    expect(result.ok).toBe(false);
    expect(result.blocking[0].severity).toBe("high");
  });

  it("reports a low advisory without blocking", () => {
    const result = gate(
      npmReportWith(npmVia("minimatch", "low", "GHSA-AAAA-BBBB-CCCC")),
      emptyCargoReport(),
    );
    expect(result.ok).toBe(true);
    expect(result.reported).toHaveLength(1);
    expect(result.blocking).toHaveLength(0);
  });

  it("blocks an unmaintained Rust crate until it is accepted", () => {
    const report = {
      vulnerabilities: { found: false, count: 0, list: [] },
      warnings: {
        unmaintained: [cargoWarning("unmaintained", "zvariant", "RUSTSEC-2026-0370")],
        unsound: [],
        notice: [],
      },
    };
    expect(gate(emptyNpmReport(), report).blocking).toHaveLength(1);
    const allowlist: Allowlist = {
      reviewed: "2026-11-11",
      entries: [entry({ ecosystem: "cargo", package: "zvariant", advisory: "RUSTSEC-2026-0370" })],
    };
    const accepted = gate(emptyNpmReport(), report, allowlist);
    expect(accepted.ok).toBe(true);
    expect(accepted.accepted).toHaveLength(1);
  });

  it("does not block a Rust notice", () => {
    const report = {
      vulnerabilities: { found: false, count: 0, list: [] },
      warnings: {
        notice: [cargoWarning("notice", "some-crate", "RUSTSEC-2026-0003")],
        unmaintained: [],
        unsound: [],
      },
    };
    expect(gate(emptyNpmReport(), report).ok).toBe(true);
  });
});

describe("dependency gate allowlist", () => {
  it("accepts a matching entry and keeps the reason for the report", () => {
    const allowlist: Allowlist = {
      reviewed: "2026-11-11",
      entries: [entry()],
    };
    const result = gate(
      npmReportWith(npmVia("minimatch", "moderate", "GHSA-AAAA-BBBB-CCCC")),
      emptyCargoReport(),
      allowlist,
    );
    expect(result.ok).toBe(true);
    expect(result.accepted[0].entry.reason).toMatch(/Development-only/);
  });

  it("fails an expired entry instead of accepting it", () => {
    const allowlist: Allowlist = {
      reviewed: "2026-11-11",
      entries: [entry({ reviewedAt: "2026-08-11", reviewBy: "2026-11-10" })],
    };
    const result = gate(
      npmReportWith(npmVia("minimatch", "moderate", "GHSA-AAAA-BBBB-CCCC")),
      emptyCargoReport(),
      allowlist,
    );
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/expired on 2026-11-10/);
    expect(result.blocking[0].reason).toMatch(/expired/);
  });

  it("fails a stale entry that no longer matches an advisory", () => {
    const allowlist: Allowlist = { reviewed: "2026-11-11", entries: [entry()] };
    const result = gate(emptyNpmReport(), emptyCargoReport(), allowlist);
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/no longer matches any advisory/);
  });

  it("requires a reason and review dates", () => {
    const errors = validateAllowlist(
      {
        reviewed: "2026-11-11",
        entries: [{ ecosystem: "npm", package: "x", advisory: "GHSA-AAAA-BBBB-CCCC" }],
      },
      NOW,
    );
    expect(errors.join(" ")).toMatch(/stated reason/);
    expect(errors.join(" ")).toMatch(/reviewedAt/);
    expect(errors.join(" ")).toMatch(/reviewBy/);
  });

  it("validates the committed allowlist", () => {
    const allowlist = JSON.parse(
      readFileSync(resolve(__dirname, "../security/dependency-allowlist.json"), "utf8"),
    ) as Allowlist;
    expect(validateAllowlist(allowlist, NOW)).toEqual([]);
    expect(allowlist.entries.length).toBeLessThanOrEqual(8);
  });

  it("accepts exactly the five current Rust advisories with the committed allowlist", () => {
    const allowlist = JSON.parse(
      readFileSync(resolve(__dirname, "../security/dependency-allowlist.json"), "utf8"),
    ) as Allowlist;
    const report = {
      vulnerabilities: { found: false, count: 0, list: [] },
      warnings: {
        unsound: [cargoWarning("unsound", "glib", "RUSTSEC-2024-0429")],
        unmaintained: [
          cargoWarning("unmaintained", "proc-macro-error", "RUSTSEC-2024-0370"),
          cargoWarning("unmaintained", "zvariant", "RUSTSEC-2026-0370"),
          cargoWarning("unmaintained", "zbus_names", "RUSTSEC-2026-0371"),
          cargoWarning("unmaintained", "zvariant_derive", "RUSTSEC-2026-0372"),
        ],
      },
    };
    const result = gate(emptyNpmReport(), report, allowlist);
    expect(result.ok).toBe(true);
    expect(result.accepted).toHaveLength(5);
  });
});

describe("dependency gate messages", () => {
  it("describes a failed audit read instead of passing silently", () => {
    const message = auditCommandFailure("npm audit", 3, {
      code: 1,
      stderr: "ECONNRESET network down",
    });
    expect(message).toMatch(/after 3 attempt/);
    expect(message).toMatch(/fails closed/);
    expect(message).toMatch(/ECONNRESET/);
  });

  it("marks the step summary as failed and names the advisory", () => {
    const result = gate(
      npmReportWith(npmVia("minimatch", "high", "GHSA-g3hv-75wg-m249")),
      emptyCargoReport(),
    );
    const summary = formatSummary(result);
    expect(summary).toContain("**Result: FAIL**");
    expect(summary).toContain("GHSA-G3HV-75WG-M249");
  });
});
