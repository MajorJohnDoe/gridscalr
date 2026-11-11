/**
 * Runs the dependency and advisory gate.
 *
 * The rules live in `dependency-gate.mjs`; this file runs the two audit
 * commands, retries a failed read, writes the raw reports and the step summary
 * and sets the exit code. See `docs/security-policy.md` for the acceptance
 * process and `security/dependency-allowlist.json` for the reviewed entries.
 */
import { spawn } from "node:child_process";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  auditCommandFailure,
  evaluateGate,
  formatConsole,
  formatSummary,
} from "./dependency-gate.mjs";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const DEFAULT_ALLOWLIST = resolve(ROOT, "security/dependency-allowlist.json");

const USAGE = `Usage: node scripts/check-dependencies.mjs [options]

  --npm-report <file>    Read a saved npm audit --json report instead of running it
  --cargo-report <file>  Read a saved cargo audit --json report instead of running it
  --allowlist <file>     Allowlist path (default security/dependency-allowlist.json)
  --report-dir <dir>     Write the raw reports and the gate result to this directory
  --summary <file>       Append a Markdown summary to this file (default GITHUB_STEP_SUMMARY)
  --attempts <n>         Attempts per audit command before failing closed (default 3)
  --now <ISO date>       Evaluate review expiry against this date (default today)
  --help                 Show this help`;

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function capture(command, args, cwd) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env, NO_COLOR: "1", npm_config_color: "false" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      resolvePromise({ code: null, stdout, stderr: `${stderr}${error.message}` }),
    );
    child.on("close", (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function runJson({ label, command, args, cwd, attempts }) {
  let last;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await capture(command, args, cwd);
    const parsed = tryParseJson(last.stdout);
    if (parsed && !parsed.error) return parsed;
    if (parsed?.error) last.parsedError = parsed.error.summary ?? parsed.error.code;
    if (attempt < attempts) await delay(1500 * attempt);
  }
  throw new Error(auditCommandFailure(label, attempts, last));
}

function parseArgs(argv) {
  const options = { attempts: 3 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${arg}`);
      index += 1;
      return next;
    };
    switch (arg) {
      case "--npm-report":
        options.npmReport = value();
        break;
      case "--cargo-report":
        options.cargoReport = value();
        break;
      case "--allowlist":
        options.allowlist = value();
        break;
      case "--report-dir":
        options.reportDir = value();
        break;
      case "--summary":
        options.summary = value();
        break;
      case "--attempts":
        options.attempts = Number(value());
        break;
      case "--now":
        options.now = value();
        break;
      case "--help":
        options.help = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!Number.isInteger(options.attempts) || options.attempts < 1) {
    throw new Error("--attempts must be a positive integer.");
  }
  return options;
}

async function readReport(path) {
  try {
    return JSON.parse(await readFile(resolve(process.cwd(), path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read the saved report ${path}: ${error.message}`);
  }
}

async function writeReports(directory, npmReport, cargoReport, result) {
  const target = resolve(process.cwd(), directory);
  await mkdir(target, { recursive: true });
  await writeFile(resolve(target, "npm-audit.json"), `${JSON.stringify(npmReport, null, 2)}\n`);
  await writeFile(resolve(target, "cargo-audit.json"), `${JSON.stringify(cargoReport, null, 2)}\n`);
  const summary = {
    ok: result.ok,
    accepted: result.accepted.map(({ finding, entry }) => ({
      ecosystem: finding.ecosystem,
      package: finding.package,
      advisory: finding.advisory,
      reviewBy: entry.reviewBy,
    })),
    blocking: result.blocking.map(({ ecosystem, package: pkg, advisory, severity, reason }) => ({
      ecosystem,
      package: pkg,
      advisory,
      severity,
      reason,
    })),
    errors: result.errors,
  };
  await writeFile(resolve(target, "gate-result.json"), `${JSON.stringify(summary, null, 2)}\n`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  const now = options.now ? new Date(options.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error(`Invalid --now value: ${options.now}`);
  const allowlistPath = options.allowlist
    ? resolve(process.cwd(), options.allowlist)
    : DEFAULT_ALLOWLIST;
  const allowlist = JSON.parse(await readFile(allowlistPath, "utf8"));
  const npmReport = options.npmReport
    ? await readReport(options.npmReport)
    : await runJson({
        label: "npm audit",
        command: process.platform === "win32" ? "npm.cmd" : "npm",
        args: ["audit", "--json"],
        cwd: ROOT,
        attempts: options.attempts,
      });
  const cargoReport = options.cargoReport
    ? await readReport(options.cargoReport)
    : await runJson({
        label: "cargo audit",
        command: "cargo",
        args: ["audit", "--json"],
        cwd: resolve(ROOT, "src-tauri"),
        attempts: options.attempts,
      });
  const result = evaluateGate({ npmReport, cargoReport, allowlist, now });
  process.stdout.write(formatConsole(result));
  if (options.reportDir) await writeReports(options.reportDir, npmReport, cargoReport, result);
  const summaryPath = options.summary ?? process.env.GITHUB_STEP_SUMMARY;
  if (summaryPath) await appendFile(summaryPath, `${formatSummary(result)}\n`);
  if (!result.ok) process.exitCode = 1;
  else process.stdout.write(`Allowlist: ${relative(ROOT, allowlistPath)}\n`);
}

main().catch((error) => {
  console.error(`Dependency gate failed to run: ${error.message}`);
  process.exitCode = 1;
});
