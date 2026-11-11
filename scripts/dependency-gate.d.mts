export type Ecosystem = "npm" | "cargo";

export interface Finding {
  ecosystem: Ecosystem;
  package: string;
  advisory: string;
  severity: string;
  kind: string;
  title: string;
  url?: string;
}

export interface AllowlistEntry {
  ecosystem: Ecosystem;
  package: string;
  advisory: string;
  reason: string;
  reviewedAt: string;
  reviewBy: string;
  kind?: string;
  issue?: string;
}

export interface Allowlist {
  reviewed: string;
  entries: AllowlistEntry[];
}

export interface Classification {
  accepted: Array<{ finding: Finding; entry: AllowlistEntry }>;
  reported: Finding[];
  blocking: Array<Finding & { reason: string }>;
  stale: string[];
}

export interface GateResult extends Classification {
  findings: Finding[];
  errors: string[];
  ok: boolean;
}

export const SEVERITY_RANK: Record<string, number>;
export const BLOCKING_RANK: number;

export function normalizeSeverity(value: unknown): string;
export function parseNpmAudit(report: unknown): Finding[];
export function parseCargoAudit(report: unknown): Finding[];
export function isExpired(reviewBy: string, now?: Date | string): boolean;
export function validateAllowlist(allowlist: unknown, now?: Date | string): string[];
export function classifyFindings(
  findings: Finding[],
  allowlist: Allowlist | undefined,
  now?: Date | string,
): Classification;
export function evaluateGate(input: {
  npmReport: unknown;
  cargoReport: unknown;
  allowlist: Allowlist;
  now?: Date | string;
}): GateResult;
export function formatSummary(result: GateResult): string;
export function formatConsole(result: GateResult): string;
export function auditCommandFailure(
  label: string,
  attempts: number,
  result: { code?: number | null; stdout?: string; stderr?: string; parsedError?: string },
): string;
