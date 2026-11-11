/**
 * Guards the desktop security policy.
 *
 * The shipped CSP and the capability list are security boundaries: relaxing one
 * without a documented reason is easy to miss in review. Every directive and
 * permission has a reason in security/policy.json, and this check fails when the
 * configuration and that record disagree, when the production policy gains a
 * development origin or an inline allowance, or when an inline style creeps back
 * into the frontend.
 *
 * Run with `npm run check:security`. The pure functions are exported so
 * tests/securityPolicy.test.ts can prove that each violation is detected.
 */
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Directives that must exist with a single 'none' source in production. */
export const REQUIRED_NONE_DIRECTIVES = ["object-src", "base-uri", "frame-src", "form-action"];

/** Origins that must never reach the production page policy. */
const PRODUCTION_FORBIDDEN = /(localhost|127\.0\.0\.1|(^|[\s;])ws:)/i;

/** The single localhost-shaped origin the Tauri IPC bridge uses on Windows. */
const ALLOWED_PRODUCTION_ORIGINS = new Set(["http://ipc.localhost"]);

/** Extra origins the development policy may add on top of production. */
const DEVELOPMENT_ALLOWED_EXTRA = new Set([
  "http://localhost:1420",
  "ws://localhost:1420",
  "'unsafe-inline'",
]);

/** A capability set that hides its contents behind the ACL defaults. */
const FORBIDDEN_CAPABILITIES = new Set(["core:default"]);

/**
 * Parses a CSP string into a directive -> sorted sources map. Directive order
 * and duplicate sources are ignored; the semantics are what matter.
 */
export function parseCsp(value) {
  if (typeof value !== "string" || !value.trim()) return new Map();
  const directives = new Map();
  for (const part of value.split(";")) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const [name, ...sources] = tokens;
    directives.set(name.toLowerCase(), [...new Set(sources)].sort());
  }
  return directives;
}

function sameSources(left, right) {
  return left.length === right.length && left.every((source, index) => source === right[index]);
}

function reasonOf(entry) {
  return typeof entry?.reason === "string" ? entry.reason.trim() : "";
}

function checkProduction(policy, directives, errors) {
  const documented = policy.csp?.production ?? {};
  const documentedNames = new Set(Object.keys(documented).map((name) => name.toLowerCase()));

  for (const [name, sources] of directives) {
    if (!documentedNames.has(name)) {
      errors.push(`CSP: production directive "${name}" is not documented in security/policy.json.`);
      continue;
    }
    const entry = documented[name];
    if (!reasonOf(entry)) {
      errors.push(`CSP: production directive "${name}" needs a non-empty reason.`);
    }
    if (!sameSources(sources, [...new Set(entry.sources ?? [])].sort())) {
      errors.push(
        `CSP: production directive "${name}" is ${JSON.stringify(sources)} but the documented policy is ${JSON.stringify(entry.sources ?? [])}.`,
      );
    }
  }
  for (const name of documentedNames) {
    if (!directives.has(name)) {
      errors.push(
        `CSP: documented production directive "${name}" is missing from tauri.conf.json.`,
      );
    }
  }

  for (const [name, sources] of directives) {
    for (const source of sources) {
      if (PRODUCTION_FORBIDDEN.test(source) && !ALLOWED_PRODUCTION_ORIGINS.has(source)) {
        errors.push(
          `CSP: production directive "${name}" contains the development origin "${source}".`,
        );
      }
      if (source === "*" || source === "http:" || source === "https:") {
        errors.push(`CSP: production directive "${name}" contains the broad source "${source}".`);
      }
    }
  }

  const style = directives.get("style-src") ?? [];
  if (style.includes("'unsafe-inline'")) {
    errors.push("CSP: production style-src must not contain 'unsafe-inline'.");
  }
  const script = directives.get("script-src") ?? [];
  if (!script.includes("'wasm-unsafe-eval'")) {
    errors.push("CSP: production script-src needs 'wasm-unsafe-eval' for PDF.js and Tesseract.");
  }
  const worker = directives.get("worker-src") ?? [];
  if (!worker.includes("blob:")) {
    errors.push("CSP: production worker-src needs blob: for the policy-inheriting workers.");
  }
  for (const name of REQUIRED_NONE_DIRECTIVES) {
    const sources = directives.get(name) ?? [];
    if (sources.length !== 1 || sources[0] !== "'none'") {
      errors.push(`CSP: production ${name} must be exactly 'none'.`);
    }
  }
}

function checkDevelopment(policy, production, development, errors) {
  const additions = policy.csp?.developmentAdditions ?? {};
  const documentedAdditions = new Set(Object.keys(additions).map((name) => name.toLowerCase()));

  for (const [name, sources] of development) {
    if (!production.has(name)) {
      errors.push(`CSP: devCsp directive "${name}" does not exist in the production policy.`);
      continue;
    }
    const extra = sources.filter((source) => !production.get(name).includes(source));
    if (!extra.length && !documentedAdditions.has(name)) continue;
    if (!documentedAdditions.has(name)) {
      errors.push(`CSP: devCsp adds ${extra.join(", ")} to "${name}" without documentation.`);
      continue;
    }
    if (!reasonOf(additions[name])) {
      errors.push(`CSP: development addition for "${name}" needs a non-empty reason.`);
    }
    const allowed = new Set(additions[name].sources ?? []);
    for (const source of extra) {
      if (!allowed.has(source)) {
        errors.push(`CSP: devCsp adds undocumented source "${source}" to "${name}".`);
      }
      if (!DEVELOPMENT_ALLOWED_EXTRA.has(source)) {
        errors.push(
          `CSP: devCsp source "${source}" in "${name}" is outside the development allowance.`,
        );
      }
    }
    const missing = [...allowed].filter((source) => !sources.includes(source));
    if (missing.length) {
      errors.push(
        `CSP: devCsp is missing the documented "${name}" source(s) ${missing.join(", ")}.`,
      );
    }
  }
  for (const name of documentedAdditions) {
    if (!development.has(name)) {
      errors.push(`CSP: documented development addition "${name}" is missing from devCsp.`);
    }
  }
}

function checkCapabilities(policy, capabilityFiles, errors) {
  const documented = policy.capabilities ?? {};
  const documentedNames = Object.keys(documented);
  if (!documentedNames.length) {
    errors.push("Capabilities: no permissions are documented in security/policy.json.");
  }
  for (const [permission, reason] of Object.entries(documented)) {
    if (typeof reason !== "string" || !reason.trim()) {
      errors.push(`Capabilities: "${permission}" needs a non-empty justification.`);
    }
  }

  const granted = new Set();
  for (const { file, json } of capabilityFiles) {
    const permissions = json?.permissions;
    if (!Array.isArray(permissions)) {
      errors.push(`Capabilities: ${file} has no permissions array.`);
      continue;
    }
    for (const permission of permissions) {
      const identifier = typeof permission === "string" ? permission : permission?.identifier;
      if (typeof identifier !== "string") {
        errors.push(`Capabilities: ${file} has an unreadable permission entry.`);
        continue;
      }
      granted.add(identifier);
    }
  }
  for (const permission of granted) {
    if (FORBIDDEN_CAPABILITIES.has(permission)) {
      errors.push(
        `Capabilities: "${permission}" expands to the whole core ACL; list permissions explicitly.`,
      );
    }
    if (!documentedNames.includes(permission)) {
      errors.push(
        `Capabilities: "${permission}" is granted but not documented in security/policy.json.`,
      );
    }
  }
  for (const permission of documentedNames) {
    if (!granted.has(permission)) {
      errors.push(`Capabilities: "${permission}" is documented but not granted.`);
    }
  }
}

function checkInlineStyle(indexHtml, sourceFiles, errors) {
  if (/http-equiv\s*=\s*["']?Content-Security-Policy/i.test(indexHtml)) {
    errors.push(
      "CSP: index.html must not carry a meta Content-Security-Policy; the shell header is the single production policy.",
    );
  }
  if (/<style[\s>]/i.test(indexHtml)) {
    errors.push("CSP: index.html must not contain an inline <style> block (F-038).");
  }
  if (/\sstyle\s*=/i.test(indexHtml)) {
    errors.push("CSP: index.html must not contain an inline style attribute (F-038).");
  }
  for (const { file, text } of sourceFiles) {
    // A style attribute in markup would need style-src 'unsafe-inline'. CSSOM
    // assignments such as element.style.color are allowed and common.
    if (/(?<![A-Za-z0-9_$])style="/.test(text) || /setAttribute\(\s*["']style["']/.test(text)) {
      errors.push(`${file}: inline style attribute found; set styles through the CSSOM (F-038).`);
    }
  }
}

function checkWorkerPolicy(sourceFiles, errors) {
  const source = new Map(sourceFiles.map(({ file, text }) => [file, text]));
  const pdf = source.get("src/pdf/pdfRenderer.ts") ?? "";
  if (!pdf.includes("URL.createObjectURL") || !pdf.includes("GlobalWorkerOptions.workerSrc")) {
    errors.push("Workers: src/pdf/pdfRenderer.ts must start PDF.js from a blob worker (F-029).");
  }
  const ocr = source.get("src/search/ocr.ts") ?? "";
  if (!/workerBlobURL:\s*true/.test(ocr)) {
    errors.push(
      "Workers: src/search/ocr.ts must use workerBlobURL: true so Tesseract inherits the policy.",
    );
  }
}

function checkSmokeCommands(rustFiles, errors) {
  const lib = rustFiles.find(({ file }) => file === "src-tauri/src/lib.rs")?.text ?? "";
  if (!/#\[cfg\(debug_assertions\)\]\s*\nmod smoke;/.test(lib)) {
    errors.push(
      "IPC: src-tauri/src/lib.rs must compile the smoke module in debug builds only (F-037).",
    );
  }
  for (const command of ["smoke::smoke_test_dir", "smoke::finish_smoke_test"]) {
    const escaped = command.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const gated = new RegExp(`#\\[cfg\\(debug_assertions\\)\\]\\s*\\n\\s*${escaped},`, "g");
    const registered = new RegExp(`${escaped},`, "g");
    if ((lib.match(registered) ?? []).length === 0) {
      errors.push(`IPC: "${command}" must be registered in src-tauri/src/lib.rs (F-037).`);
    } else if ((lib.match(gated) ?? []).length === 0) {
      errors.push(`IPC: "${command}" must be registered behind #[cfg(debug_assertions)] (F-037).`);
    }
  }
}

/**
 * Runs every policy check over already-loaded inputs and returns the failures.
 * Pure so the test suite can feed modified copies.
 */
export function checkSecurityPolicy({
  policy,
  tauriConfig,
  capabilityFiles,
  indexHtml,
  sourceFiles,
  rustFiles,
}) {
  const errors = [];
  if (!policy || typeof policy !== "object") return ["security/policy.json could not be loaded."];
  const security = tauriConfig?.app?.security ?? {};
  const production = parseCsp(security.csp);
  const development = parseCsp(security.devCsp);

  if (!production.size) errors.push("CSP: app.security.csp is missing from tauri.conf.json.");
  if (!development.size) errors.push("CSP: app.security.devCsp is missing from tauri.conf.json.");

  checkProduction(policy, production, errors);
  checkDevelopment(policy, production, development, errors);

  const documentedFreeze = policy.freezePrototype?.value;
  if (typeof documentedFreeze !== "boolean") {
    errors.push("freezePrototype: security/policy.json needs a boolean value and a reason.");
  }
  if (security.freezePrototype !== documentedFreeze) {
    errors.push(
      `freezePrototype: tauri.conf.json is ${String(security.freezePrototype)} but the documented policy is ${String(documentedFreeze)}.`,
    );
  }
  if (typeof documentedFreeze === "boolean" && !reasonOf(policy.freezePrototype)) {
    errors.push("freezePrototype: document why the value is what it is.");
  }

  checkCapabilities(policy, capabilityFiles, errors);
  checkInlineStyle(indexHtml, sourceFiles, errors);
  checkWorkerPolicy(sourceFiles, errors);
  checkSmokeCommands(rustFiles, errors);
  return errors;
}

async function collect(directory, extension) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      files.push(...(await collect(absolute, extension)));
    } else if (entry.name.endsWith(extension)) {
      files.push({
        file: absolute
          .slice(root.length + 1)
          .split("\\")
          .join("/"),
        text: await readFile(absolute, "utf8"),
      });
    }
  }
  return files;
}

async function main() {
  const policy = JSON.parse(await readFile(resolve(root, "security/policy.json"), "utf8"));
  const tauriConfig = JSON.parse(
    await readFile(resolve(root, "src-tauri/tauri.conf.json"), "utf8"),
  );
  const capabilitiesDir = resolve(root, "src-tauri/capabilities");
  const capabilityFiles = [];
  for (const name of (await readdir(capabilitiesDir)).filter((entry) => entry.endsWith(".json"))) {
    capabilityFiles.push({
      file: `src-tauri/capabilities/${name}`,
      json: JSON.parse(await readFile(resolve(capabilitiesDir, name), "utf8")),
    });
  }

  const errors = checkSecurityPolicy({
    policy,
    tauriConfig,
    capabilityFiles,
    indexHtml: await readFile(resolve(root, "index.html"), "utf8"),
    sourceFiles: await collect(resolve(root, "src"), ".ts"),
    rustFiles: await collect(resolve(root, "src-tauri/src"), ".rs"),
  });

  if (errors.length) {
    console.error("Security policy check failed:");
    for (const error of errors) console.error(`- ${error}`);
    console.error(
      "Update the configuration and security/policy.json together, with a reason for every change.",
    );
    process.exitCode = 1;
    return;
  }
  console.log("Security policy: CSP, capabilities and worker policy match the documented record.");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
