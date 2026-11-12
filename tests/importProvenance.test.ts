// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import { validateProject } from "../src/model/integrity";
import type { PageProvenance, Project } from "../src/model/types";
import { formatDate } from "../src/i18n/format";
import { setLanguagePreference } from "../src/i18n";
import {
  PROVENANCE_COLUMN,
  markupsProvenanceCell,
  pageProvenanceSection,
  pageProvenanceSummary,
  provenanceByPage,
  shortIdentifier,
  shortRevision,
  summarizePageProvenance,
  withProvenanceColumn,
} from "../src/features/importProvenance";
import { buildDoctorDiagnostics } from "../src/features/projectIntegrity";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

const SOURCE_PROJECT_ID = "project_1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d";
const SOURCE_PAGE_ID = "page_9f8e7d6c-5b4a-3928-1706-f5e4d3c2b1a0";
const MODIFIED_AT = "2026-11-10T09:30:00.000Z";
const IMPORTED_AT = "2026-11-10T09:35:12.000Z";

function provenance(patch: Partial<PageProvenance> = {}): PageProvenance {
  return {
    sourceProjectId: SOURCE_PROJECT_ID,
    sourceRevisionSha256: "d".repeat(64),
    sourceRevisionSize: 2 * 1024 * 1024,
    sourceRevisionModifiedAt: MODIFIED_AT,
    sourcePageId: SOURCE_PAGE_ID,
    importedAt: IMPORTED_AT,
    appVersion: "0.23.0",
    ...patch,
  };
}

function projectWithPages(): Project {
  const document = defaultDocument("Plan.pdf", 3);
  document.sha256 = "a".repeat(64);
  return withTestPageIds(createProject(document));
}

describe("import provenance summary", () => {
  it("summarizes valid provenance with safe, shortened identifiers", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    const summary = summarizePageProvenance(project.pages[0]);
    expect(summary).not.toBeNull();
    expect(summary).toMatchObject({
      sourceProjectId: SOURCE_PROJECT_ID,
      sourceProjectShort: "project_1a2b3c4d…",
      sourcePageId: SOURCE_PAGE_ID,
      sourcePageShort: "page_9f8e7d6c…",
      sourcePageNumber: 1,
      revisionShort: "d".repeat(12),
      sourceRevisionSize: 2 * 1024 * 1024,
      sourceRevisionModifiedAt: MODIFIED_AT,
      importedAt: IMPORTED_AT,
      appVersion: "0.23.0",
    });
    expect(summary?.sourceProjectShort).not.toContain("/");
    expect(summary?.revisionShort).toHaveLength(12);
  });

  it("treats a missing revision time as unknown rather than malformed", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance({ sourceRevisionModifiedAt: null });
    expect(summarizePageProvenance(project.pages[0])?.sourceRevisionModifiedAt).toBeNull();
  });

  it("returns null for missing, partial and malformed provenance", () => {
    const project = projectWithPages();
    expect(summarizePageProvenance(project.pages[0])).toBeNull();

    const malformed: Partial<PageProvenance>[] = [
      {},
      { sourceProjectId: SOURCE_PROJECT_ID },
      provenance({ sourceRevisionSha256: "not-a-hash" }),
      provenance({ sourceRevisionSize: Number.NaN }),
      provenance({ importedAt: "not-a-date" }),
      provenance({ appVersion: "" }),
      provenance({ sourceRevisionModifiedAt: "not-a-date" }),
      provenance({ sourceProjectId: "/home/ana/customer/secret.gridscalr" }),
      provenance({ sourceProjectId: "C:\\Projects\\secret.gridscalr" }),
      provenance({ sourcePageId: "../outside" }),
    ];
    for (const record of malformed) {
      project.pages[0].provenance = record as PageProvenance;
      expect(summarizePageProvenance(project.pages[0])).toBeNull();
    }
  });

  it("shortens identifiers without inventing a name", () => {
    expect(shortIdentifier("page_5")).toBe("page_5");
    expect(shortIdentifier("page_abcdefghijkl")).toBe("page_abcdefgh…");
    expect(shortIdentifier("plainvalue")).toBe("plainvalue");
    expect(shortRevision("abcdef0123456789")).toBe("abcdef012345");
  });
});

describe("provenance lookup", () => {
  it("includes only pages with valid provenance", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    project.pages[1].provenance = provenance({ importedAt: "broken" }) as unknown as PageProvenance;
    const byPage = provenanceByPage(project);
    expect([...byPage.keys()]).toEqual([pageIdFor(1)]);
    expect(pageProvenanceSummary(project, pageIdFor(1))).not.toBeNull();
    expect(pageProvenanceSummary(project, pageIdFor(2))).toBeNull();
    expect(pageProvenanceSummary(project, "page_missing")).toBeNull();
  });
});

describe("provenance in Properties", () => {
  it("shows a read-only section for an imported page and nothing for a normal page", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();

    const section = pageProvenanceSection(project, pageIdFor(1));
    expect(section).not.toBeNull();
    const text = section?.textContent ?? "";
    expect(text).toContain("Imported page");
    expect(text).toContain("project_1a2b3c4d…");
    expect(text).toContain("d".repeat(12));
    expect(text).toContain("p.1");
    expect(text).toContain("0.23.0");
    expect(text).toContain("MB");
    expect(text).not.toContain(SOURCE_PROJECT_ID);
    expect(text).not.toContain(SOURCE_PAGE_ID);

    expect(pageProvenanceSection(project, pageIdFor(2))).toBeNull();
  });

  it("omits malformed provenance and never renders a path", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance({
      sourceProjectId: "/home/ana/customer/secret.gridscalr",
    });
    expect(pageProvenanceSection(project, pageIdFor(1))).toBeNull();
  });

  it("formats dates and counts with the active locale", async () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    try {
      await setLanguagePreference("sv");
      const section = pageProvenanceSection(project, pageIdFor(1));
      const text = section?.textContent ?? "";
      const expected = formatDate(IMPORTED_AT, { dateStyle: "medium", timeStyle: "short" });
      expect(text).toContain("Importerad sida");
      expect(text).toContain("s.1");
      expect(text).toContain(expected);
    } finally {
      await setLanguagePreference("en");
    }
  });
});

describe("provenance in Markups", () => {
  it("adds the compact column only when a visible row has provenance", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    const byPage = provenanceByPage(project);
    const pageIds = project.pages.map((page) => page.id);
    expect(pageIds.some((pageId) => byPage.has(pageId))).toBe(true);
    expect(withProvenanceColumn(["name", "page"], true)).toEqual([
      "name",
      "page",
      PROVENANCE_COLUMN,
    ]);
    expect(withProvenanceColumn(["name", "page"], false)).toEqual(["name", "page"]);
  });

  it("renders an aligned empty cell for a normal page and a compact source for an import", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    const summary = pageProvenanceSummary(project, pageIdFor(1));
    const imported = markupsProvenanceCell(summary);
    expect(imported.className).toBe("markups-provenance");
    expect(imported.textContent).toBe("project_1a2b3c4d…");
    expect(imported.title).toContain("d".repeat(12));

    const normal = markupsProvenanceCell(pageProvenanceSummary(project, pageIdFor(2)));
    expect(normal.textContent).toBe("–");
    expect(normal.title).toBe("");
  });
});

describe("provenance diagnostics", () => {
  it("never includes a provenance path in the doctor text", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance({
      sourceProjectId: "/home/ana/customer/secret.gridscalr",
    });
    const text = buildDoctorDiagnostics(project, validateProject(project));
    expect(text).not.toContain("/home/ana");
    expect(text).not.toContain("secret.gridscalr");
  });

  it("keeps valid provenance identifiers and hashes out of the doctor text", () => {
    const project = projectWithPages();
    project.pages[0].provenance = provenance();
    const text = buildDoctorDiagnostics(project, validateProject(project));
    expect(text).not.toContain(SOURCE_PROJECT_ID);
    expect(text).not.toContain("d".repeat(64));
  });
});
