import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { repoRoot } from "./ui-harness.mjs";
import { THEMES, checkThemeTokens } from "./theme-token-rules.mjs";

let failures = 0;
for (const theme of THEMES) {
  const css = await readFile(resolve(repoRoot, "src", "styles", "themes", `${theme}.css`), "utf8");
  const issues = checkThemeTokens(theme, css);
  for (const issue of issues) console.error(issue);
  failures += issues.length;
}

if (failures) {
  console.error(`Theme token check failed: ${failures} problem(s).`);
  process.exit(1);
}
console.log(`Theme token check passed: ${THEMES.length} themes.`);
