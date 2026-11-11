import { describe, expect, it } from "vitest";
import {
  applyRestoreLinkPlan,
  applyRestoreRelink,
  documentNeedsSource,
  planRestoreLinks,
  restoreLinkBases,
} from "../src/features/saveIntegrity";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, Project } from "../src/model/types";

const ORIGIN = "/old/place/Test project.gridscalr";
const CURRENT = "/new/place/Test project.gridscalr";

function projectWith(overrides: Partial<DocumentRef> = {}): Project {
  const project = createProject(defaultDocument("Plan.pdf", 2));
  project.documents[0] = {
    ...project.documents[0],
    path: "/old/place/drawings/Plan.pdf",
    relativePath: "drawings/Plan.pdf",
    ...overrides,
  };
  return project;
}

function existing(paths: string[]): (path: string) => Promise<boolean> {
  const set = new Set(paths);
  return async (path) => set.has(path);
}

describe("restore link bases", () => {
  it("tries the recorded origin before the open project and skips duplicates", () => {
    expect(restoreLinkBases(ORIGIN, CURRENT)).toEqual([
      { kind: "origin", path: ORIGIN },
      { kind: "current", path: CURRENT },
    ]);
    expect(restoreLinkBases(ORIGIN, ORIGIN)).toEqual([{ kind: "origin", path: ORIGIN }]);
    expect(
      restoreLinkBases("/work/Plan.gridscalr", "/WORK/PLAN.GRIDSCALR".toLowerCase()),
    ).toHaveLength(1);
    expect(restoreLinkBases(null, CURRENT)).toEqual([{ kind: "current", path: CURRENT }]);
    expect(restoreLinkBases(null, null)).toEqual([]);
  });
});

describe("restore link plan", () => {
  it("resolves a relative link against the recorded origin", async () => {
    const plan = await planRestoreLinks(
      projectWith(),
      ORIGIN,
      null,
      existing(["/old/place/drawings/Plan.pdf"]),
    );
    expect(plan.unresolved).toEqual([]);
    expect(plan.resolved[0]).toMatchObject({
      resolvedPath: "/old/place/drawings/Plan.pdf",
      matched: "origin",
      reason: "resolved",
    });
  });

  it("resolves against the moved project folder when the origin is gone", async () => {
    const plan = await planRestoreLinks(
      projectWith(),
      ORIGIN,
      CURRENT,
      existing(["/new/place/drawings/Plan.pdf"]),
    );
    expect(plan.resolved[0]).toMatchObject({
      resolvedPath: "/new/place/drawings/Plan.pdf",
      matched: "current",
    });
  });

  it("resolves through the open project when the backup has no origin path", async () => {
    const plan = await planRestoreLinks(
      projectWith(),
      null,
      CURRENT,
      existing(["/new/place/drawings/Plan.pdf"]),
    );
    expect(plan.resolved[0].matched).toBe("current");
  });

  it("reports a stale absolute path instead of loading it silently", async () => {
    const plan = await planRestoreLinks(
      projectWith({ path: "/old/place/drawings-old/Plan.pdf" }),
      ORIGIN,
      CURRENT,
      existing(["/old/place/drawings-old/Plan.pdf"]),
    );
    expect(plan.resolved).toEqual([]);
    expect(plan.unresolved[0]).toMatchObject({
      reason: "staleAbsolute",
      resolvedPath: null,
    });
    expect(plan.unresolved[0].candidates).toEqual([
      "/old/place/drawings/Plan.pdf",
      "/new/place/drawings/Plan.pdf",
    ]);
  });

  it("reports a missing drawing when nothing is on disk", async () => {
    const plan = await planRestoreLinks(projectWith(), ORIGIN, CURRENT, existing([]));
    expect(plan.unresolved[0].reason).toBe("missing");
    expect(plan.unresolved[0].name).toBe("Plan.pdf");
  });

  it("uses the stored absolute path only when there is no relative link", async () => {
    const project = projectWith({ relativePath: null, path: "/shared/Plan.pdf" });
    const plan = await planRestoreLinks(project, ORIGIN, CURRENT, existing(["/shared/Plan.pdf"]));
    expect(plan.resolved[0]).toMatchObject({
      resolvedPath: "/shared/Plan.pdf",
      matched: "absolute",
    });
  });

  it("reports a document with no recorded location at all", async () => {
    const project = projectWith({ path: null, relativePath: null });
    const plan = await planRestoreLinks(project, ORIGIN, CURRENT, existing([]));
    expect(plan.unresolved[0]).toMatchObject({ reason: "noLink", candidates: [] });
  });

  it("skips template sheets, embedded TIF pages and copied documents", () => {
    expect(documentNeedsSource(projectWith({ kind: "template" }).documents[0])).toBe(false);
    expect(
      documentNeedsSource(projectWith({ kind: "tiff", embeddedPdf: "AA==" }).documents[0]),
    ).toBe(false);
    expect(
      documentNeedsSource(
        projectWith({ copiedFrom: { documentId: "doc_source", page: 1 } }).documents[0],
      ),
    ).toBe(false);
    expect(documentNeedsSource(projectWith().documents[0])).toBe(true);
  });
});

describe("applying a restore link plan", () => {
  it("rewrites only the resolved document path", async () => {
    const project = projectWith();
    const plan = await planRestoreLinks(
      project,
      ORIGIN,
      CURRENT,
      existing(["/new/place/drawings/Plan.pdf"]),
    );
    applyRestoreLinkPlan(project, plan);
    expect(project.documents[0].path).toBe("/new/place/drawings/Plan.pdf");
    expect(project.documents[0].relativePath).toBe("drawings/Plan.pdf");
    expect(project.documents[0].sha256).toBe("");
  });

  it("clears a stale relative link and provenance when a drawing is relinked", () => {
    const project = projectWith({
      storage: "managed",
      originalPath: "/old/place/drawings/Plan.pdf",
      originalSha256: "abc",
    });
    applyRestoreRelink(project.documents[0], "/new/place/Recovered.pdf", "Recovered.pdf");
    expect(project.documents[0]).toMatchObject({
      path: "/new/place/Recovered.pdf",
      name: "Recovered.pdf",
      relativePath: null,
      storage: "reference",
      originalPath: undefined,
      originalSha256: undefined,
    });
  });
});
