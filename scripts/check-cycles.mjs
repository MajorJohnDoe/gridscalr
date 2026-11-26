import { readFile, readdir } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Runtime import-graph cycle gate.
 *
 * The repository deliberately tolerates type-only import cycles: they are
 * erased at runtime and usually describe a shared type vocabulary. This gate
 * only follows imports and re-exports that survive compilation, so a runtime
 * initialisation cycle cannot slip back in.
 *
 * The pure core (`runtimeDependencies`, `findRuntimeCycles`) is exported for
 * `tests/cycleGate.test.ts`; running this file directly is the CI entry point.
 */

function isTypeOnlyClause(clause) {
  const trimmed = clause.trim();
  if (!trimmed.startsWith("{")) return false;
  const inner = trimmed.slice(1, trimmed.lastIndexOf("}"));
  const entries = inner
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return entries.length > 0 && entries.every((entry) => entry.startsWith("type "));
}

/**
 * Returns the relative specifiers a module evaluates at runtime. Type-only
 * imports and re-exports are dropped, as are dynamic `import()` calls, which do
 * not participate in synchronous initialisation.
 */
export function runtimeDependencies(text) {
  const dependencies = [];
  // Prettier terminates every import/export declaration with a semicolon.
  for (const statement of text.split(";")) {
    const source = statement.trim();
    if (!source.startsWith("import") && !source.startsWith("export")) continue;

    if (/^import\s*\(/.test(source)) continue;
    if (/^import\s+type\b/.test(source)) continue;
    if (/^export\s+type\b/.test(source)) continue;

    const imported = source.match(/^import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/);
    if (imported) {
      if (!isTypeOnlyClause(imported[1])) dependencies.push(imported[2]);
      continue;
    }
    if (/^import\s+["']/.test(source)) {
      const sideEffect = source.match(/^import\s+["']([^"']+)["']/);
      if (sideEffect) dependencies.push(sideEffect[1]);
      continue;
    }

    const reExported = source.match(/^export\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/);
    if (reExported && !isTypeOnlyClause(reExported[1])) dependencies.push(reExported[2]);
  }
  return dependencies;
}

function resolveModule(specifier, from, known) {
  if (!specifier.startsWith(".")) return null;
  const base = resolve(dirname(from), specifier).replace(/\\/g, "/");
  for (const candidate of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/**
 * Finds every strongly connected component larger than one module. A self
 * import is reported as a one-module cycle because it still describes a module
 * that evaluates itself.
 *
 * @param {{ path: string, text: string }[]} entries absolute or root-relative
 *   module paths and their source text
 * @param {string} [root] prefix used by the returned component paths
 */
export function findRuntimeCycles(entries, root = process.cwd()) {
  const absolute = entries.map((entry) => ({
    path: entry.path.startsWith("/") ? entry.path : resolve(root, entry.path),
    text: entry.text,
  }));
  const byPath = new Map(absolute.map((entry) => [entry.path.replace(/\\/g, "/"), entry]));
  const known = new Set(byPath.keys());
  const graph = new Map();

  for (const [file, entry] of byPath) {
    const edges = new Set();
    for (const specifier of runtimeDependencies(entry.text)) {
      const resolved = resolveModule(specifier, file, known);
      if (resolved) edges.add(resolved);
    }
    graph.set(file, edges);
  }

  let index = 0;
  const indices = new Map();
  const low = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  const visit = (file) => {
    indices.set(file, index);
    low.set(file, index);
    index += 1;
    stack.push(file);
    onStack.add(file);

    for (const next of graph.get(file) ?? []) {
      if (!indices.has(next)) {
        visit(next);
        low.set(file, Math.min(low.get(file), low.get(next)));
      } else if (onStack.has(next)) {
        low.set(file, Math.min(low.get(file), indices.get(next)));
      }
    }

    if (low.get(file) !== indices.get(file)) return;
    const component = [];
    let current;
    do {
      current = stack.pop();
      onStack.delete(current);
      component.push(current);
    } while (current !== file);
    if (component.length > 1) components.push(component);
  };

  for (const file of graph.keys()) {
    if (!indices.has(file)) visit(file);
  }

  return components
    .map((component) => component.map((file) => relative(root, file).split("\\").join("/")).sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await collect(absolute)));
    else if (entry.name.endsWith(".ts")) files.push(absolute);
  }
  return files;
}

async function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const files = await collect(resolve(root, "src"));
  const entries = await Promise.all(
    files.map(async (path) => ({ path, text: await readFile(path, "utf8") })),
  );
  const cycles = findRuntimeCycles(entries, root);

  if (cycles.length) {
    console.error(`Runtime import cycles found: ${cycles.length}`);
    for (const component of cycles) console.error(`- ${component.join(" -> ")}`);
    process.exit(1);
  }
  console.log(`Runtime import cycle check passed: ${files.length} source files, 0 cycles.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
