/**
 * Requires every remote `uses:` reference in .github/workflows to be a full
 * 40-character commit SHA with a human-readable version in a trailing comment.
 *
 * A workflow that says `actions/checkout@v7` runs whatever that mutable tag
 * points at next. The release build produces the Windows, macOS and Linux
 * artifacts, so a moved or compromised tag silently changes the build output.
 * A short SHA is rejected for the same reason: it is a lookup, not an identity.
 *
 * Run with `npm run check:actions`. The pure functions are exported so
 * tests/actionPins.test.ts can prove that each violation is detected.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflows = join(root, ".github", "workflows");

/** A pinned action reference: exactly the commit object id GitHub reports. */
export const COMMIT_SHA = /^[0-9a-f]{40}$/;

/** A local composite action inside this repository needs no pin. */
const LOCAL_ACTION = /^\.\.?\//;

/** A container action is pinned by digest, not by a version tag. */
const CONTAINER_DIGEST = /^docker:\/\/[^@]+@sha256:[0-9a-f]{64}$/;

/** `uses:` with an optional list dash, quoted or bare value, optional comment. */
const USES_LINE =
  /^\s*(?:-\s+)?uses:\s*(?<value>"[^"]*"|'[^']*'|[^\s#]+)(?<comment>\s*#\s*(?<label>.*))?\s*$/;

/**
 * Splits one workflow line into its `uses:` reference and trailing comment.
 * Returns null for every line that is not a `uses:` key.
 */
export function parseUsesLine(line) {
  const match = USES_LINE.exec(line);
  if (!match) return null;
  const raw = match.groups.value;
  const quoted = raw.length > 1 && (raw.startsWith('"') || raw.startsWith("'"));
  return {
    reference: quoted ? raw.slice(1, -1) : raw,
    label: (match.groups.label ?? "").trim(),
  };
}

/** Splits `owner/repo@ref` into its action and ref halves. */
export function splitReference(reference) {
  const at = reference.lastIndexOf("@");
  if (at < 1) return { action: reference, ref: "" };
  return { action: reference.slice(0, at), ref: reference.slice(at + 1) };
}

/**
 * Reports every unpinned remote `uses:` reference in one workflow file.
 * A pin without a version comment is a review finding, because the next
 * maintainer cannot tell which release the SHA stands for.
 */
export function checkWorkflowText(text, file) {
  const issues = [];
  const entries = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const parsed = parseUsesLine(line);
    if (!parsed) return;
    const { reference, label } = parsed;
    const lineNumber = index + 1;

    if (LOCAL_ACTION.test(reference)) return;

    if (reference.startsWith("docker://")) {
      if (!CONTAINER_DIGEST.test(reference)) {
        issues.push({
          file,
          line: lineNumber,
          reference,
          message: "container action must be pinned to a @sha256: digest",
        });
      }
      return;
    }

    const { action, ref } = splitReference(reference);
    if (!ref) {
      issues.push({
        file,
        line: lineNumber,
        reference,
        message: "action has no @ref; pin it to a 40-character commit SHA",
      });
      return;
    }
    if (!COMMIT_SHA.test(ref)) {
      const kind = /^[0-9a-f]{7,39}$/i.test(ref) ? "a short SHA" : "a tag or branch";
      issues.push({
        file,
        line: lineNumber,
        reference,
        message: `${kind}; pin it to a 40-character commit SHA`,
      });
      return;
    }
    if (!label) {
      issues.push({
        file,
        line: lineNumber,
        reference,
        message: "pinned SHA needs a trailing `# <version>` comment",
      });
      return;
    }
    entries.push({ file, line: lineNumber, action, ref, label });
  });

  return { issues, entries };
}

/**
 * Checks every workflow together and rejects two pins for the same action
 * release, which is how a copy-pasted SHA drifts out of date unnoticed.
 */
export function checkWorkflows(files) {
  const issues = [];
  const entries = [];
  for (const [file, text] of files) {
    const result = checkWorkflowText(text, file);
    issues.push(...result.issues);
    entries.push(...result.entries);
  }

  const pins = new Map();
  for (const entry of entries) {
    const key = `${entry.action} ${entry.label}`;
    const known = pins.get(key);
    if (known && known.ref !== entry.ref) {
      issues.push({
        file: entry.file,
        line: entry.line,
        reference: `${entry.action}@${entry.ref}`,
        message: `${key} is pinned to ${known.ref} on ${known.file}:${known.line}; use one SHA per release`,
      });
      continue;
    }
    if (!known) pins.set(key, entry);
  }

  return { issues, entries, actions: new Set(entries.map((entry) => entry.action)) };
}

async function workflowFiles() {
  const names = (await readdir(workflows)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const files = new Map();
  for (const name of names)
    files.set(`.github/workflows/${name}`, await readFile(join(workflows, name), "utf8"));
  return files;
}

async function main() {
  const files = await workflowFiles();
  if (files.size === 0) {
    console.error("Action pin check failed: no workflow files found under .github/workflows.");
    process.exit(1);
  }

  const { issues, entries, actions } = checkWorkflows(files);
  for (const issue of issues) {
    console.error(`${issue.file}:${issue.line}: ${issue.reference} — ${issue.message}`);
  }
  if (issues.length) {
    console.error(`Action pin check failed: ${issues.length} problem(s). See docs/releasing.md.`);
    process.exit(1);
  }

  console.log(
    `Action pin check passed: ${entries.length} pinned reference(s) across ${actions.size} action(s).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
