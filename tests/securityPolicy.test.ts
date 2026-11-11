import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { checkSecurityPolicy, parseCsp } from "../scripts/check-security-policy.mjs";

const root = resolve(__dirname, "..");

interface DirectiveEntry {
  sources: string[];
  reason: string;
}

interface Policy {
  freezePrototype: { value: boolean; reason: string };
  csp: {
    production: Record<string, DirectiveEntry>;
    developmentAdditions: Record<string, DirectiveEntry>;
  };
  capabilities: Record<string, string>;
}

interface TauriConfig {
  app: { security: { csp: string; devCsp: string; freezePrototype: boolean } };
}

interface CapabilityFile {
  file: string;
  json: { permissions: string[] };
}

interface SourceFile {
  file: string;
  text: string;
}

function readJson(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8"));
}

function collect(directory: string, extension: string): SourceFile[] {
  const files: SourceFile[] = [];
  for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) files.push(...collect(relative, extension));
    else if (entry.name.endsWith(extension)) {
      files.push({ file: relative, text: readFileSync(resolve(root, relative), "utf8") });
    }
  }
  return files;
}

/** The repository as it is, so the baseline assertion also guards real files. */
function baseline() {
  return {
    policy: readJson("security/policy.json") as Policy,
    tauriConfig: readJson("src-tauri/tauri.conf.json") as TauriConfig,
    capabilityFiles: [
      {
        file: "src-tauri/capabilities/default.json",
        json: readJson("src-tauri/capabilities/default.json") as CapabilityFile["json"],
      },
    ],
    indexHtml: readFileSync(resolve(root, "index.html"), "utf8"),
    sourceFiles: collect("src", ".ts"),
    rustFiles: collect("src-tauri/src", ".rs"),
  };
}

function failures(mutate: (input: ReturnType<typeof baseline>) => void): string[] {
  const input = baseline();
  mutate(input);
  return checkSecurityPolicy(input);
}

describe("security policy check", () => {
  it("accepts the current configuration", () => {
    expect(checkSecurityPolicy(baseline())).toEqual([]);
  });

  it("parses a CSP string into normalized directives", () => {
    const parsed = parseCsp("default-src 'self'; script-src 'self' 'self' blob:");
    expect(parsed.get("default-src")).toEqual(["'self'"]);
    expect(parsed.get("script-src")).toEqual(["'self'", "blob:"]);
  });

  it("fails when a capability is granted without documentation", () => {
    const errors = failures((input) => {
      input.capabilityFiles[0].json.permissions.push("core:window:allow-close");
    });
    expect(errors.join("\n")).toContain("core:window:allow-close");
  });

  it("fails when a documented permission is no longer granted", () => {
    const errors = failures((input) => {
      input.capabilityFiles[0].json.permissions = input.capabilityFiles[0].json.permissions.filter(
        (permission) => permission !== "dialog:allow-open",
      );
    });
    expect(errors.join("\n")).toContain("dialog:allow-open");
  });

  it("fails when core:default returns", () => {
    const errors = failures((input) => {
      input.capabilityFiles[0].json.permissions.push("core:default");
    });
    expect(errors.join("\n")).toContain("core:default");
  });

  it("fails when style-src is relaxed with inline styles", () => {
    const errors = failures((input) => {
      input.policy.csp.production["style-src"].sources.push("'unsafe-inline'");
    });
    expect(errors.join("\n")).toMatch(/style-src/);
  });

  it("fails when a hardening directive is removed", () => {
    const errors = failures((input) => {
      delete input.policy.csp.production["base-uri"];
    });
    expect(errors.join("\n")).toContain("base-uri");
  });

  it("fails when the production policy gains a development origin", () => {
    const errors = failures((input) => {
      input.policy.csp.production["connect-src"].sources.push("ws://localhost:1420");
    });
    expect(errors.join("\n")).toContain("connect-src");
  });

  it("fails when devCsp adds an undocumented remote origin", () => {
    const errors = failures((input) => {
      input.tauriConfig.app.security.devCsp += " https://cdn.example.com";
    });
    expect(errors.join("\n")).toMatch(/devCsp|https:\/\/cdn\.example\.com/);
  });

  it("fails when freezePrototype drifts from the documented value", () => {
    const errors = failures((input) => {
      input.tauriConfig.app.security.freezePrototype = true;
    });
    expect(errors.join("\n")).toContain("freezePrototype");
  });

  it("fails when index.html carries a second page policy", () => {
    const errors = failures((input) => {
      input.indexHtml = input.indexHtml.replace(
        "<title>",
        '<meta http-equiv="Content-Security-Policy" content="default-src \'self\'" />\n    <title>',
      );
    });
    expect(errors.join("\n")).toContain("meta Content-Security-Policy");
  });

  it("fails when a source file reintroduces an inline style attribute", () => {
    const errors = failures((input) => {
      input.sourceFiles.push({
        file: "src/ui/example.ts",
        text: 'const markup = `<span style="color:red">x</span>`;',
      });
    });
    expect(errors.join("\n")).toMatch(/inline style attribute/);
  });

  it("fails when a worker loses the blob bootstrap", () => {
    const errors = failures((input) => {
      for (const file of input.sourceFiles) {
        if (file.file === "src/search/ocr.ts")
          file.text = file.text.replace("workerBlobURL: true", "workerBlobURL: false");
      }
    });
    expect(errors.join("\n")).toContain("workerBlobURL");
  });

  it("fails when a smoke-test command is registered unconditionally", () => {
    const errors = failures((input) => {
      for (const file of input.rustFiles) {
        if (file.file === "src-tauri/src/lib.rs") {
          file.text = file.text.replace("#[cfg(debug_assertions)]\nmod smoke;", "mod smoke;");
          file.text = file.text.replace(
            "#[cfg(debug_assertions)]\n            smoke::smoke_test_dir,",
            "smoke::smoke_test_dir,",
          );
        }
      }
    });
    expect(errors.join("\n")).toMatch(/smoke/);
  });
});
