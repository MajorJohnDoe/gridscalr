/**
 * Pure model for the dependency and advisory gate.
 *
 * Parses `npm audit` and `cargo audit` JSON, validates the reviewed exception
 * list in `security/dependency-allowlist.json`, classifies findings and formats
 * the console, step-summary and failure messages. The command runner lives in
 * `check-dependencies.mjs`; keeping the rules here lets the tests prove them
 * with synthetic reports and no network.
 */

export const SEVERITY_RANK = Object.freeze({
  info: 0,
  low: 1,
  moderate: 2,
  medium: 2,
  warning: 2,
  high: 3,
  critical: 4,
});
export const BLOCKING_RANK = SEVERITY_RANK.moderate;

const ECOSYSTEMS = new Set(["npm", "cargo"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeSeverity(value) {
  const severity = String(value ?? "").toLowerCase();
  return severity in SEVERITY_RANK ? severity : "high";
}

function severityFromCvss(cvss) {
  let score;
  if (typeof cvss === "number") score = cvss;
  else if (cvss && typeof cvss === "object" && typeof cvss.score === "number") score = cvss.score;
  if (typeof score !== "number" || !Number.isFinite(score)) return "high";
  if (score >= 9) return "critical";
  if (score >= 7) return "high";
  if (score >= 4) return "moderate";
  if (score > 0) return "low";
  return "info";
}

function advisoryIdFromNpm(via) {
  const url = typeof via.url === "string" ? via.url : "";
  const ghsa = url.match(/GHSA-[a-z0-9-]+/i)?.[0];
  if (ghsa) return ghsa.toUpperCase();
  const cve = url.match(/CVE-\d{4}-\d+/i)?.[0];
  if (cve) return cve.toUpperCase();
  return `npm:${via.source ?? via.name ?? "unknown"}`;
}

function findingKey(value) {
  return `${value.ecosystem}|${value.package}|${value.advisory}`;
}

function addFinding(findings, finding) {
  findings.set(findingKey(finding), finding);
}

export function parseNpmAudit(report) {
  if (!report || typeof report !== "object") {
    throw new Error("npm audit did not return a JSON report.");
  }
  if (report.error) {
    const detail = report.error.summary ?? report.error.code ?? "unknown error";
    throw new Error(`npm audit reported an error: ${detail}`);
  }
  if (!report.vulnerabilities || typeof report.vulnerabilities !== "object") {
    throw new Error(
      "npm audit report has no vulnerabilities object; the gate cannot verify the tree.",
    );
  }
  const findings = new Map();
  for (const entry of Object.values(report.vulnerabilities)) {
    for (const via of Array.isArray(entry?.via) ? entry.via : []) {
      if (!via || typeof via !== "object") continue;
      addFinding(findings, {
        ecosystem: "npm",
        package: String(via.name ?? entry?.name ?? "unknown"),
        advisory: advisoryIdFromNpm(via),
        severity: normalizeSeverity(via.severity ?? entry?.severity),
        kind: "vulnerability",
        title: String(via.title ?? "npm advisory"),
        url: typeof via.url === "string" ? via.url : undefined,
      });
    }
  }
  return [...findings.values()];
}

function addCargoFinding(findings, item, kind, severity) {
  const advisory = item?.advisory ?? {};
  const name = String(item?.package?.name ?? advisory.package ?? "unknown");
  const advisoryId = String(advisory.id ?? `${kind}:${name}`);
  addFinding(findings, {
    ecosystem: "cargo",
    package: name,
    advisory: advisoryId,
    severity,
    kind,
    title: String(advisory.title ?? `${kind} advisory`),
    url: advisory.id ? `https://rustsec.org/advisories/${advisory.id}` : undefined,
  });
}

export function parseCargoAudit(report) {
  if (!report || typeof report !== "object") {
    throw new Error("cargo audit did not return a JSON report.");
  }
  const { vulnerabilities, warnings } = report;
  if (!vulnerabilities || typeof vulnerabilities !== "object") {
    throw new Error(
      "cargo audit report has no vulnerabilities object; the gate cannot verify the tree.",
    );
  }
  if (!warnings || typeof warnings !== "object") {
    throw new Error("cargo audit report has no warnings object; the gate cannot verify the tree.");
  }
  const findings = new Map();
  for (const item of Array.isArray(vulnerabilities.list) ? vulnerabilities.list : []) {
    addCargoFinding(findings, item, "vulnerability", severityFromCvss(item?.advisory?.cvss));
  }
  for (const [kind, list] of Object.entries(warnings)) {
    const warningKind = kind.toLowerCase();
    const severity = warningKind === "notice" ? "info" : "warning";
    for (const item of Array.isArray(list) ? list : []) {
      addCargoFinding(findings, item, warningKind, severity);
    }
  }
  return [...findings.values()];
}

function isValidDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  const time = Date.parse(String(value));
  return Number.isNaN(time) ? Number.NaN : time;
}

export function isExpired(reviewBy, now) {
  if (!isValidDate(reviewBy)) return true;
  // An entry is valid through the whole review date.
  return Date.parse(`${reviewBy}T23:59:59Z`) < toTime(now);
}

export function validateAllowlist(allowlist, now = new Date()) {
  const errors = [];
  if (!allowlist || typeof allowlist !== "object") return ["The allowlist must be a JSON object."];
  if (!isValidDate(allowlist.reviewed)) {
    errors.push("The allowlist needs a reviewed date in YYYY-MM-DD form.");
  } else if (Date.parse(`${allowlist.reviewed}T00:00:00Z`) > toTime(now)) {
    errors.push(`The allowlist reviewed date ${allowlist.reviewed} is in the future.`);
  }
  if (!Array.isArray(allowlist.entries)) {
    return [...errors, "The allowlist needs an entries array."];
  }
  const seen = new Set();
  allowlist.entries.forEach((entry, index) => {
    const label = `Allowlist entry ${index + 1}`;
    if (!entry || typeof entry !== "object") {
      errors.push(`${label} must be an object.`);
      return;
    }
    if (!ECOSYSTEMS.has(entry.ecosystem)) {
      errors.push(`${label} needs ecosystem "npm" or "cargo".`);
    }
    for (const field of ["package", "advisory"]) {
      if (typeof entry[field] !== "string" || !entry[field].trim()) {
        errors.push(`${label} needs a non-empty ${field}.`);
      }
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < 20) {
      errors.push(`${label} needs a stated reason of at least 20 characters.`);
    }
    if (!isValidDate(entry.reviewedAt)) {
      errors.push(`${label} needs a reviewedAt date in YYYY-MM-DD form.`);
    }
    if (!isValidDate(entry.reviewBy)) {
      errors.push(`${label} needs a reviewBy date in YYYY-MM-DD form.`);
    } else if (isValidDate(entry.reviewedAt) && entry.reviewBy < entry.reviewedAt) {
      errors.push(`${label} has a reviewBy date before its reviewedAt date.`);
    } else if (isExpired(entry.reviewBy, now)) {
      errors.push(
        `${label} expired on ${entry.reviewBy}; review it and set a new date or fix the advisory.`,
      );
    }
    if (entry.issue !== undefined && !/^https?:\/\//.test(String(entry.issue))) {
      errors.push(`${label} has an issue link that is not an http(s) URL.`);
    }
    const key = ECOSYSTEMS.has(entry.ecosystem) ? findingKey(entry) : "";
    if (key && seen.has(key)) errors.push(`${label} duplicates ${key}.`);
    if (key) seen.add(key);
  });
  return errors;
}

export function classifyFindings(findings, allowlist, now = new Date()) {
  const entries = Array.isArray(allowlist?.entries) ? allowlist.entries : [];
  const byKey = new Map();
  for (const entry of entries) {
    if (entry && ECOSYSTEMS.has(entry.ecosystem)) byKey.set(findingKey(entry), entry);
  }
  const matched = new Set();
  const accepted = [];
  const reported = [];
  const blocking = [];
  for (const finding of findings) {
    const key = findingKey(finding);
    const entry = byKey.get(key);
    if (entry) matched.add(key);
    if (SEVERITY_RANK[normalizeSeverity(finding.severity)] < BLOCKING_RANK) {
      reported.push(finding);
      continue;
    }
    if (!entry) {
      blocking.push({ ...finding, reason: "not in the allowlist" });
      continue;
    }
    if (isExpired(entry.reviewBy, now)) {
      blocking.push({ ...finding, reason: `allowlist review expired on ${entry.reviewBy}` });
      continue;
    }
    accepted.push({ finding, entry });
  }
  const stale = entries
    .filter((entry) => entry && ECOSYSTEMS.has(entry.ecosystem) && !matched.has(findingKey(entry)))
    .map((entry) => `${findingKey(entry)} no longer matches any advisory; remove the entry.`);
  return { accepted, reported, blocking, stale };
}

export function evaluateGate({ npmReport, cargoReport, allowlist, now = new Date() }) {
  const findings = [...parseNpmAudit(npmReport), ...parseCargoAudit(cargoReport)];
  const errors = validateAllowlist(allowlist, now);
  const result = classifyFindings(findings, allowlist, now);
  result.findings = findings;
  result.errors = [...errors, ...result.stale];
  result.ok = result.errors.length === 0 && result.blocking.length === 0;
  return result;
}

function cell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\s+/g, " ")
    .trim();
}

function countByEcosystem(findings) {
  const counts = { npm: 0, cargo: 0 };
  for (const finding of findings) counts[finding.ecosystem] += 1;
  return counts;
}

export function formatSummary(result) {
  const counts = countByEcosystem(result.findings);
  const accepted = (ecosystem) =>
    result.accepted.filter((item) => item.finding.ecosystem === ecosystem).length;
  const blocked = (ecosystem) =>
    result.blocking.filter((item) => item.ecosystem === ecosystem).length;
  const lines = [
    "## Dependency and advisory gate",
    "",
    "Threshold: **moderate** and above must be fixed or accepted in `security/dependency-allowlist.json`.",
    "Rust `unsound`, `unmaintained` and `yanked` findings also require an accepted entry.",
    "",
    "| Ecosystem | Findings | Accepted | Unaccepted |",
    "| --- | --- | --- | --- |",
    `| npm | ${counts.npm} | ${accepted("npm")} | ${blocked("npm")} |`,
    `| cargo | ${counts.cargo} | ${accepted("cargo")} | ${blocked("cargo")} |`,
  ];
  if (result.accepted.length) {
    lines.push("", "### Accepted", "");
    for (const { finding, entry } of result.accepted) {
      lines.push(
        `- \`${finding.ecosystem}\` ${finding.package} ${finding.advisory} (review by ${entry.reviewBy}) — ${cell(entry.reason)}`,
      );
    }
  }
  if (result.blocking.length) {
    lines.push("", "### Unaccepted", "");
    for (const finding of result.blocking) {
      lines.push(
        `- **${finding.severity}** \`${finding.ecosystem}\` ${finding.package} ${finding.advisory}: ${cell(finding.title)} (${cell(finding.reason)})${finding.url ? ` ${finding.url}` : ""}`,
      );
    }
  }
  if (result.errors.length) {
    lines.push("", "### Allowlist problems", "");
    for (const error of result.errors) lines.push(`- ${cell(error)}`);
  }
  if (result.reported.length) {
    lines.push("", "### Below threshold", "");
    for (const finding of result.reported) {
      lines.push(
        `- ${finding.severity} \`${finding.ecosystem}\` ${finding.package} ${finding.advisory}`,
      );
    }
  }
  lines.push("", `**Result: ${result.ok ? "PASS" : "FAIL"}**`, "");
  return lines.join("\n");
}

export function formatConsole(result) {
  const counts = countByEcosystem(result.findings);
  const lines = [
    "Dependency and advisory gate",
    `npm findings: ${counts.npm}`,
    `cargo findings: ${counts.cargo}`,
    `accepted: ${result.accepted.length}`,
    `unaccepted: ${result.blocking.length}`,
  ];
  for (const { finding, entry } of result.accepted) {
    lines.push(
      `  accepted ${finding.ecosystem} ${finding.package} ${finding.advisory} (review by ${entry.reviewBy})`,
    );
  }
  for (const finding of result.blocking) {
    lines.push(
      `  BLOCKED ${finding.severity} ${finding.ecosystem} ${finding.package} ${finding.advisory}: ${finding.reason}${finding.url ? ` ${finding.url}` : ""}`,
    );
  }
  for (const error of result.errors) lines.push(`  allowlist: ${error}`);
  for (const finding of result.reported) {
    lines.push(
      `  reported ${finding.severity} ${finding.ecosystem} ${finding.package} ${finding.advisory}`,
    );
  }
  lines.push(`Result: ${result.ok ? "PASS" : "FAIL"}`);
  return `${lines.join("\n")}\n`;
}

export function auditCommandFailure(label, attempts, result) {
  const detail = String(result?.parsedError ?? result?.stderr ?? result?.stdout ?? "no output")
    .trim()
    .split(/\r?\n/)
    .slice(-6)
    .join("\n");
  return `${label} did not produce a readable report after ${attempts} attempt(s) (exit ${result?.code ?? "unknown"}). The dependency gate fails closed rather than passing unverified: this is not a clean result. Check the npm registry / RustSec advisory database connection and re-run. Last output:\n${detail}`;
}
