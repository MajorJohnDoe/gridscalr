import { describe, expect, it } from "vitest";
import { parseProject } from "../src/io/projectFile";
import { serializeProject } from "../src/io/projectFile/serialize";
import { createProject, defaultDocument } from "../src/model/layers";
import { commitProjectImport, prepareProjectImport } from "../src/features/projectImport/model";
import { SCHEMA_VERSION } from "../src/model/types";
import { withTestPageIds } from "./helpers/pages";

describe("empty projects", () => {
  it("saves and reloads a project with zero documents and zero pages", () => {
    const project = createProject();
    expect(project.documents).toEqual([]);
    expect(project.pages).toEqual([]);
    const parsed = parseProject(serializeProject(project));
    expect(parsed.schemaVersion).toBe(SCHEMA_VERSION);
    expect(parsed.documents).toEqual([]);
    expect(parsed.pages).toEqual([]);
    expect(parsed.layers.map((layer) => layer.kind)).toEqual(["draw", "measure"]);
    expect(parsed.categories.length).toBeGreaterThan(0);
  });

  it("accepts imported pages later", () => {
    const source = withTestPageIds(createProject(defaultDocument("Source.pdf", 2)));
    const destination = createProject();
    const prepared = prepareProjectImport(destination, source, [1, 2]);
    commitProjectImport(destination, prepared);
    expect(destination.documents).toHaveLength(1);
    expect(destination.pages).toHaveLength(2);
    expect(destination.pages.map((page) => page.localPage)).toEqual([1, 2]);
    const parsed = parseProject(serializeProject(destination));
    expect(parsed.pages).toHaveLength(2);
    expect(parsed.pages.every((page) => Boolean(page.id))).toBe(true);
  });
});
