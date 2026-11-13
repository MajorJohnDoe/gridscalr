// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { pageIdFor, withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { validateProject } from "../src/model/integrity";
import { containsAbsolutePath } from "../src/model/pathText";
import type { MarkupItem, Project } from "../src/model/types";
import {
  DEFAULT_DOCTOR_FILTER,
  addRepairSection,
  applyRepair,
  availableRepairs,
  buildDoctorDiagnostics,
  doctorFilterKinds,
  doctorShownRepairs,
  filterDoctorIssues,
  planRepair,
  plannedRepairs,
  repairForCode,
  runProjectDoctor,
  type DoctorRepairRequest,
  type DoctorIssueFilter,
  type RepairKind,
} from "../src/features/projectIntegrity";

const NOW = "2026-01-01T00:00:00.000Z";

function item(id: string, pageId: string, extra: Partial<MarkupItem> = {}): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    createdAt: NOW,
    updatedAt: NOW,
    ...extra,
  };
}

const PATH = "/home/anna/Customer Secret/Level 01.pdf";

/**
 * One project with a duplicate page and item ID, a dangling item page, a
 * missing category reference and stale OCR. Every repairable kind has work.
 */
function makeDamagedProject(): Project {
  const document = defaultDocument("Plan.pdf", 3);
  document.sha256 = "a".repeat(64);
  document.path = PATH;
  const project = withTestPageIds(createProject(document));
  const measure = project.layers.find((layer) => layer.kind === "measure")!;
  const categoryId = project.settings.quantity.defaultCategoryId;
  measure.items.push(
    item("item_ok", pageIdFor(1), { categoryId }),
    item("item_gone", "page_missing", { categoryId }),
    item("item_bad_category", pageIdFor(1), { categoryId: "cat_missing" }),
  );
  // A repeated item ID, a repeated page ID and stale OCR on the first page.
  measure.items.push({ ...measure.items[0] });
  project.pages.push({ id: pageIdFor(1), documentId: document.id, localPage: 3, state: {} });
  project.pages[0].state.ocr = {
    text: "hello",
    words: [],
    engine: "tesseract",
    languages: "eng",
    generatedAt: NOW,
    documentSha256: "b".repeat(64),
    sourcePage: 1,
    width: 100,
    height: 100,
  };
  return project;
}

function allKinds(project: Project): RepairKind[] {
  return availableRepairs(validateProject(project));
}

function codes(project: Project): string[] {
  return validateProject(project).map((entry) => entry.code);
}

function findSection(body: HTMLElement, selector: string): HTMLElement {
  const node = body.querySelector<HTMLElement>(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return node;
}

describe("repair plan", () => {
  it("plans and applies the same project without mutating the input", () => {
    const project = makeDamagedProject();
    const before = JSON.stringify(project);
    const kinds = allKinds(project);
    expect(kinds).toEqual(["duplicateIds", "danglingReferences", "staleOcr"]);

    const first = planRepair(project, kinds);
    const second = planRepair(project, kinds);
    expect(JSON.stringify(project)).toBe(before);
    expect(JSON.stringify(second.plan)).toBe(JSON.stringify(first.plan));
    expect(JSON.stringify(second.project)).toBe(JSON.stringify(first.project));
    expect(first.plan.kinds).toEqual(kinds);
  });

  it("reports a preview count that equals the repaired copy for every kind", () => {
    const project = makeDamagedProject();
    const run = planRepair(project, ["duplicateIds", "danglingReferences", "staleOcr"]);
    for (const kind of run.plan.kinds) {
      const previewCount = run.plan.changes.filter((change) => change.repair === kind).length;
      expect(run.plan.counts[kind]).toBe(previewCount);
      // The plan count and the single-kind repaired copy must agree.
      expect(applyRepair(project, kind).changed).toBe(previewCount);
    }
    expect(run.plan.changes.length).toBeGreaterThan(0);
  });

  it("offers only repairs that plan at least one change", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    project.layers = [];
    project.activeLayerId = "layer_missing";
    const issues = validateProject(project);

    expect(issues.map((entry) => entry.code)).toContain("missingActiveLayer");
    // The code is repairable, but no layer exists that could become active, so
    // the validator-code list is optimistic and the plan is not.
    expect(availableRepairs(issues)).toEqual(["danglingReferences"]);
    expect(plannedRepairs(project, issues)).toEqual([]);
  });

  it("names concrete duplicate renames and removals that the copy really made", () => {
    const project = makeDamagedProject();
    const run = planRepair(project, ["duplicateIds", "danglingReferences", "staleOcr"]);
    const renames = run.plan.changes.filter((change) => change.action === "rename");
    expect(renames.length).toBeGreaterThanOrEqual(2);
    const itemIds = run.project.layers.flatMap((layer) => layer.items.map((entry) => entry.id));
    for (const rename of renames) {
      expect(itemIds.concat(run.project.pages.map((page) => page.id))).toContain(rename.to);
    }
    const pageRename = renames.find((change) => change.scope === "page");
    expect(pageRename?.id).toBe(pageIdFor(1));
    expect(run.project.pages.filter((page) => page.id === pageIdFor(1))).toHaveLength(1);
    expect(run.project.pages.some((page) => page.id === pageRename?.to)).toBe(true);

    const removedItems = run.plan.changes.filter(
      (change) => change.action === "remove" && change.scope === "item",
    );
    expect(removedItems.map((change) => change.id)).toContain("item_gone");
    expect(itemIds).not.toContain("item_gone");
    expect(run.project.pages[0].state.ocr).toBeUndefined();
  });

  it("applies only the selected kind and leaves the other issues intact", () => {
    const project = makeDamagedProject();
    const run = planRepair(project, ["duplicateIds"]);
    expect(run.plan.kinds).toEqual(["duplicateIds"]);
    expect(run.plan.changes.every((change) => change.repair === "duplicateIds")).toBe(true);
    const remaining = codes(run.project);
    expect(remaining.some((code) => code.startsWith("duplicate"))).toBe(false);
    expect(remaining).toContain("missingItemPage");
    expect(remaining).toContain("ocrDocumentMismatch");
    // A later repair on top of the subset still reaches a clean project.
    const rest = planRepair(run.project, ["danglingReferences", "staleOcr"]);
    expect(validateProject(rest.project).filter((entry) => entry.severity === "error")).toEqual([]);
  });

  it("maps every repairable code to its kind and leaves the rest report-only", () => {
    expect(repairForCode("duplicatePageId")).toBe("duplicateIds");
    expect(repairForCode("missingItemPage")).toBe("danglingReferences");
    expect(repairForCode("invalidExcludedPage")).toBe("danglingReferences");
    expect(repairForCode("ocrSourcePageMismatch")).toBe("staleOcr");
    for (const code of [
      "invalidItemGeometry",
      "assetMimeMismatch",
      "invalidPageProvenance",
      "unexpectedItemCategory",
      "roundTripPages",
    ]) {
      expect(repairForCode(code)).toBeNull();
    }
  });
});

describe("doctor issue filters", () => {
  it("filters by severity, entity kind and repair availability", () => {
    const project = makeDamagedProject();
    project.layers
      .find((layer) => layer.kind === "measure")!
      .items.push(
        item("item_geometry", pageIdFor(1), {
          categoryId: project.settings.quantity.defaultCategoryId,
          points: [],
        }),
      );
    const issues = validateProject(project);
    const severity = (filter: DoctorIssueFilter) =>
      filterDoctorIssues(issues, filter).map((issue) => issue.severity);
    expect(
      severity({ ...DEFAULT_DOCTOR_FILTER, severity: "error" }).every((s) => s === "error"),
    ).toBe(true);
    const warnings = severity({ ...DEFAULT_DOCTOR_FILTER, severity: "warning" });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings.every((entry) => entry === "warning")).toBe(true);

    const pageOnly = filterDoctorIssues(issues, { ...DEFAULT_DOCTOR_FILTER, kind: "page" });
    expect(pageOnly.length).toBeGreaterThan(0);
    expect(
      pageOnly.every(
        (issue) => issue.code.startsWith("duplicatePage") || issue.code.startsWith("ocr"),
      ),
    ).toBe(true);

    const repairable = filterDoctorIssues(issues, {
      ...DEFAULT_DOCTOR_FILTER,
      repair: "repairable",
    });
    const reportOnly = filterDoctorIssues(issues, {
      ...DEFAULT_DOCTOR_FILTER,
      repair: "report-only",
    });
    expect(repairable.length + reportOnly.length).toBe(issues.length);
    expect(reportOnly.map((issue) => issue.code)).toContain("invalidItemGeometry");
    expect(repairable.every((issue) => repairForCode(issue.code) !== null)).toBe(true);

    expect(doctorFilterKinds(issues)).toEqual(expect.arrayContaining(["page", "item", "ocr"]));
    expect(doctorShownRepairs(issues, { ...DEFAULT_DOCTOR_FILTER, kind: "ocr" })).toEqual([
      "staleOcr",
    ]);
  });

  it("keeps every available repair selectable when a filter hides its issues", () => {
    const project = makeDamagedProject();
    const issues = validateProject(project);
    const filtered: DoctorIssueFilter = { ...DEFAULT_DOCTOR_FILTER, kind: "page" };
    expect(filterDoctorIssues(issues, filtered).length).toBeLessThan(issues.length);
    expect(availableRepairs(issues)).toEqual(["duplicateIds", "danglingReferences", "staleOcr"]);
  });
});

describe("doctor repair dialog flow", () => {
  it("saves exactly the previewed plan and never writes an in-place project", async () => {
    const project = makeDamagedProject();
    const before = JSON.stringify(project);
    const saveRepairedCopy = vi.fn(async (_copy: Project) => true);
    const dialog = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "repair",
        repairs: ["duplicateIds", "danglingReferences", "staleOcr"],
        filter: DEFAULT_DOCTOR_FILTER,
      })
      .mockResolvedValueOnce({ kind: "save" });
    const outcome = await runProjectDoctor(
      {
        project,
        host: { saveRepairedCopy, exportDiagnostics: async () => undefined },
        issues: validateProject(project),
      },
      { dialog },
    );
    expect(outcome.action).toBe("saved");
    expect(JSON.stringify(project)).toBe(before);
    const planned = planRepair(project, ["duplicateIds", "danglingReferences", "staleOcr"]);
    expect(saveRepairedCopy).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(saveRepairedCopy.mock.calls[0][0])).toBe(JSON.stringify(planned.project));
    expect(JSON.stringify(outcome.project)).toBe(JSON.stringify(planned.project));
    // The filter the user chose is handed back to the reopened dialog.
    const second = dialog.mock.calls[1][0] as { filter?: DoctorIssueFilter };
    expect(second.filter).toEqual(DEFAULT_DOCTOR_FILTER);
  });

  it("applies a selected subset only", async () => {
    const project = makeDamagedProject();
    const dialog = vi
      .fn()
      .mockResolvedValueOnce({ kind: "repair", repairs: ["danglingReferences"] })
      .mockResolvedValueOnce({ kind: "close" });
    const outcome = await runProjectDoctor(
      {
        project,
        host: { saveRepairedCopy: async () => true, exportDiagnostics: async () => undefined },
        issues: validateProject(project),
      },
      { dialog },
    );
    expect(outcome.action).toBe("close");
    const remaining = codes(outcome.project);
    expect(remaining).not.toContain("missingItemPage");
    expect(remaining).toContain("duplicatePageId");
    expect(remaining).toContain("ocrDocumentMismatch");
  });

  it("leaves the project, history and files untouched on cancel", async () => {
    const project = makeDamagedProject();
    const before = JSON.stringify(project);
    const saveRepairedCopy = vi.fn(async () => true);
    const exportDiagnostics = vi.fn(async () => undefined);
    const dialog = vi
      .fn()
      .mockResolvedValueOnce({ kind: "repair", repairs: ["duplicateIds"] })
      .mockResolvedValueOnce({ kind: "close" });
    const outcome = await runProjectDoctor(
      { project, host: { saveRepairedCopy, exportDiagnostics }, issues: validateProject(project) },
      { dialog },
    );
    expect(outcome.action).toBe("close");
    expect(JSON.stringify(project)).toBe(before);
    expect(saveRepairedCopy).not.toHaveBeenCalled();
    expect(exportDiagnostics).not.toHaveBeenCalled();
  });

  it("keeps diagnostics and the preview free of file paths", () => {
    const project = makeDamagedProject();
    const issues = validateProject(project);
    expect(containsAbsolutePath(buildDoctorDiagnostics(project, issues))).toBe(false);

    const body = document.createElement("div");
    addRepairSection(body, {
      project,
      issues,
      repairs: availableRepairs(issues),
      request: () => undefined,
    });
    expect(containsAbsolutePath(body.textContent ?? "")).toBe(false);
    expect(body.textContent ?? "").not.toContain("Customer Secret");
  });
});

describe("repair section", () => {
  function mount(project: Project) {
    const issues = validateProject(project);
    const requests: DoctorRepairRequest[] = [];
    const body = document.createElement("div");
    addRepairSection(body, {
      project,
      issues,
      repairs: availableRepairs(issues),
      request: (request) => requests.push(request),
    });
    document.body.append(body);
    return { body, requests, issues };
  }

  it("narrows the shown issues without changing the repair selection", () => {
    const { body, issues } = mount(makeDamagedProject());
    const severity = findSection(body, '[data-filter="severity"]') as HTMLSelectElement;
    expect(severity.value).toBe("all");
    const rows = () => body.querySelectorAll("[data-issue-code]").length;
    expect(rows()).toBe(issues.length);
    severity.value = "error";
    severity.dispatchEvent(new Event("change"));
    expect(rows()).toBe(issues.filter((issue) => issue.severity === "error").length);
    const boxes = [...body.querySelectorAll<HTMLInputElement>("[data-repair-kind]")];
    expect(boxes).toHaveLength(3);
    expect(boxes.every((box) => box.checked)).toBe(true);
  });

  it("selects all only for the filtered issues and says so", () => {
    const { body, issues } = mount(makeDamagedProject());
    for (const box of body.querySelectorAll<HTMLInputElement>("[data-repair-kind]")) {
      box.checked = false;
      box.dispatchEvent(new Event("change"));
    }
    const kind = findSection(body, '[data-filter="kind"]') as HTMLSelectElement;
    kind.value = "ocr";
    kind.dispatchEvent(new Event("change"));
    findSection(body, '[data-action="select-all-repairs"]').click();
    const checked = [...body.querySelectorAll<HTMLInputElement>("[data-repair-kind]")]
      .filter((box) => box.checked)
      .map((box) => box.dataset.repairKind);
    expect(checked).toEqual(["staleOcr"]);
    const note = body.textContent ?? "";
    expect(note).toContain(String(issues.filter((issue) => issue.code.startsWith("ocr")).length));
    expect(note).toContain("Select all");
  });

  it("previews renames with before/after counts and applies the checked kinds", () => {
    const { body, requests } = mount(makeDamagedProject());
    const preview = findSection(body, ".doctor-preview");
    expect(preview.textContent ?? "").toContain("Before:");
    expect(preview.textContent ?? "").toContain("After:");
    expect(preview.querySelectorAll(".doctor-change-row").length).toBeGreaterThan(0);
    expect(preview.textContent ?? "").toContain(pageIdFor(1));
    expect(preview.textContent ?? "").toContain("→");

    const duplicate = findSection(body, '[data-repair-kind="duplicateIds"]') as HTMLInputElement;
    duplicate.checked = false;
    duplicate.dispatchEvent(new Event("change"));
    const apply = findSection(body, '[data-action="apply-repairs"]') as HTMLButtonElement;
    apply.click();
    expect(requests).toHaveLength(1);
    expect(requests[0].kind).toBe("repair");
    expect(requests[0].repairs).toEqual(["danglingReferences", "staleOcr"]);
    expect(requests[0].filter).toEqual(DEFAULT_DOCTOR_FILTER);
    expect(preview.textContent ?? "").not.toContain("… and");
  });

  it("disables apply when no repair is selected", () => {
    const { body, requests } = mount(makeDamagedProject());
    for (const box of body.querySelectorAll<HTMLInputElement>("[data-repair-kind]")) {
      box.checked = false;
      box.dispatchEvent(new Event("change"));
    }
    const apply = findSection(body, '[data-action="apply-repairs"]') as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    apply.click();
    expect(requests).toHaveLength(0);
  });
});
