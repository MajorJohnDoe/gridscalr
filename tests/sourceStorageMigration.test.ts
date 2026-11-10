import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProject, parseProjectWithReport, serializeProject } from "../src/io/projectFile";
import { SCHEMA_VERSION } from "../src/model/types";

const schema24 = readFileSync(
  new URL("../fixtures/legacy/schema-24.gridscalr", import.meta.url),
  "utf8",
);

function fixture(): Record<string, unknown> {
  return JSON.parse(schema24) as Record<string, unknown>;
}

describe("schema 24 → 25 source-storage migration", () => {
  it("marks every existing document as a reference without moving paths", () => {
    const { project, report } = parseProjectWithReport(schema24);
    expect(report.migratedFrom).toBe(24);
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.documents.length).toBe(2);
    for (const document of project.documents) {
      expect(document.storage).toBe("reference");
      expect(document.originalPath).toBeUndefined();
      expect(document.originalSha256).toBeUndefined();
    }
    expect(project.documents[0].relativePath).toBe("Main.pdf");
    expect(project.documents[1].relativePath).toBe("Second.pdf");
  });

  it("keeps schema 25 managed copies and their provenance", () => {
    const raw = fixture();
    raw.schemaVersion = 25;
    const documents = raw.documents as Array<Record<string, unknown>>;
    const sha = "a".repeat(64);
    documents[0].storage = "managed";
    documents[0].path = "/tmp/Project.drawings/Main-aaaaaaaa.pdf";
    documents[0].relativePath = "Project.drawings/Main-aaaaaaaa.pdf";
    documents[0].originalPath = "/home/ana/OneDrive/Main.pdf";
    documents[0].originalSha256 = sha;
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.documents[0].storage).toBe("managed");
    expect(parsed.documents[0].originalPath).toBe("/home/ana/OneDrive/Main.pdf");
    expect(parsed.documents[0].originalSha256).toBe(sha);
    expect(parsed.documents[1].storage).toBe("reference");
  });

  it("does not trust a pre-schema-25 managed marker or provenance", () => {
    const raw = fixture();
    const documents = raw.documents as Array<Record<string, unknown>>;
    documents[0].storage = "managed";
    documents[0].originalPath = "/home/ana/secret.pdf";
    documents[0].originalSha256 = "b".repeat(64);
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.documents[0].storage).toBe("reference");
    expect(parsed.documents[0].originalPath).toBeUndefined();
    expect(parsed.documents[0].originalSha256).toBeUndefined();
  });

  it("drops invalid provenance instead of guessing", () => {
    const raw = fixture();
    raw.schemaVersion = 25;
    const documents = raw.documents as Array<Record<string, unknown>>;
    documents[0].storage = "managed";
    documents[0].originalSha256 = "not-a-checksum";
    const parsed = parseProject(JSON.stringify(raw));
    expect(parsed.documents[0].storage).toBe("managed");
    expect(parsed.documents[0].originalSha256).toBeUndefined();
    expect(parsed.documents[0].originalPath).toBeNull();
  });

  it("serializes the mode deterministically and round-trips it", () => {
    const first = parseProject(schema24);
    const text = serializeProject(first);
    expect(text).toContain('"storage": "reference"');
    const second = parseProject(text);
    expect(serializeProject(second)).toBe(serializeProject(first));
  });
});
