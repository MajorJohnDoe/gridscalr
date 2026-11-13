/**
 * Pure rules for Rust module hygiene in the Tauri shell.
 *
 * `check:file-budgets` caps a Rust file's *size*; it cannot tell a 399-line
 * module that owns one concern from one that accumulated four unrelated Tauri
 * commands. These rules add the boundary half (F-097):
 *
 * - a module may carry at most `defaultMax` commands unless a reviewed
 *   exception records a higher cap and why, so commands cannot pile into a
 *   module that merely happens to be under budget;
 * - every `.rs` file in `src-tauri/src` must be declared by another module, so
 *   an orphaned or renamed module fails instead of sitting unreachable.
 *
 * The exception shape and the minimum reason length are the file-budget shape,
 * because this is the same "reviewed cap, not a silent raise" decision.
 */
import { MIN_REASON_LENGTH } from "./file-budget-rules.mjs";

/** A Tauri command attribute, optionally with an argument list. */
const COMMAND_ATTRIBUTE = /^\s*#\[tauri::command(?:\(|\])/;

/** `mod name;` (also `pub mod`), and the `#[path = "name.rs"]` form used by tests. */
const MOD_DECLARATION = /^\s*(?:pub(?:\([^)]*\))?\s+)?mod\s+([A-Za-z0-9_]+)\s*;/gm;
const PATH_ATTRIBUTE = /#\[path\s*=\s*"([^"]+\.rs)"\]/g;

/** Crate roots are declared by Cargo, not by another module. */
const CRATE_ROOTS = new Set(["lib.rs", "main.rs"]);

/**
 * @typedef {{ max: number, reason: string }} CommandException
 * @typedef {{ defaultMax: number, files?: Record<string, CommandException> }} CommandConfig
 * @typedef {{ file: string, commands: number }} CommandEntry
 * @typedef {{ file: string, commands: number, max: number, reviewed: boolean }} CommandResult
 */

/** Counts `#[tauri::command]` attributes; a commented-out attribute is not one. */
export function countCommands(text) {
  let count = 0;
  for (const line of text.split(/\r?\n/)) if (COMMAND_ATTRIBUTE.test(line)) count += 1;
  return count;
}

/** Module names declared anywhere in the given file texts. */
export function declaredModules(texts) {
  const names = new Set();
  for (const text of texts) {
    for (const match of text.matchAll(MOD_DECLARATION)) names.add(match[1]);
    for (const match of text.matchAll(PATH_ATTRIBUTE)) {
      const leaf = match[1].split("/").pop() ?? "";
      names.add(leaf.replace(/\.rs$/, ""));
    }
  }
  return names;
}

/**
 * @param {CommandConfig} config
 * @returns {string[]}
 */
export function validateCommandConfig(config) {
  if (!config || typeof config !== "object") return ["Rust command config must be an object."];
  if (!Number.isInteger(config.defaultMax) || config.defaultMax < 0) {
    return ["Rust command config needs a non-negative integer defaultMax."];
  }
  const errors = [];
  for (const [file, entry] of Object.entries(config.files ?? {})) {
    if (!entry || typeof entry !== "object" || !Number.isInteger(entry.max) || entry.max < 0) {
      errors.push(`${file}: command exception needs a non-negative integer max.`);
      continue;
    }
    if (typeof entry.reason !== "string" || entry.reason.trim().length < MIN_REASON_LENGTH) {
      errors.push(
        `${file}: command exception needs a reviewed reason of at least ${MIN_REASON_LENGTH} characters.`,
      );
    }
  }
  return errors;
}

function capFor(file, config) {
  const exact = config.files?.[file];
  return exact ? exact.max : config.defaultMax;
}

/**
 * Checks the command cap and the module wiring in one pass.
 *
 * @param {{ config: CommandConfig, entries: CommandEntry[], declared: Set<string> }} input
 * @returns {{ ok: boolean, errors: string[], results: CommandResult[], violations: CommandResult[], stale: string[], orphans: string[], total: number }}
 */
export function evaluateRustModules({ config, entries, declared }) {
  const errors = validateCommandConfig(config);
  const exceptions = config.files ?? {};
  const results = entries.map((entry) => ({
    file: entry.file,
    commands: entry.commands,
    max: capFor(entry.file, config),
    reviewed: exceptions[entry.file] !== undefined,
  }));
  const violations = results.filter((entry) => entry.commands > entry.max);
  const present = new Set(entries.map((entry) => entry.file));
  const stale = Object.keys(exceptions)
    .filter((file) => !present.has(file))
    .sort();
  const orphans = entries
    .filter((entry) => {
      const leaf = entry.file.split("/").pop() ?? "";
      if (CRATE_ROOTS.has(leaf)) return false;
      return !declared.has(leaf.replace(/\.rs$/, ""));
    })
    .map((entry) => entry.file)
    .sort();
  return {
    ok:
      errors.length === 0 && violations.length === 0 && stale.length === 0 && orphans.length === 0,
    errors,
    results,
    violations,
    stale,
    orphans,
    total: results.reduce((sum, entry) => sum + entry.commands, 0),
  };
}

/** Console lines for a failed Rust module check. */
export function formatRustProblems({ errors, violations, stale, orphans }) {
  const lines = [];
  for (const error of errors) lines.push(`- ${error}`);
  for (const entry of violations) {
    lines.push(
      `- ${entry.file}: ${entry.commands} Tauri commands, cap ${entry.max}. Move a command into its own module, or record a reviewed exception in rust-commands.json.`,
    );
  }
  for (const file of stale) {
    lines.push(`- ${file}: command exception no longer matches a Rust module; remove it.`);
  }
  for (const file of orphans) {
    lines.push(`- ${file}: no other Rust module declares this file; add a "mod" declaration.`);
  }
  return lines;
}
