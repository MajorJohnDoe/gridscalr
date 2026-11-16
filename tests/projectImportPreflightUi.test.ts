// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { commitProjectImport, prepareProjectImport } from "../src/features/projectImport/model";
import type {
  ImportDocumentOverride,
  ImportSourceMismatch,
} from "../src/features/projectImport/model";
import { buildImportPreflight } from "../src/features/projectImport/preflight";
import type { PreflightSourceWarning } from "../src/features/projectImport/preflight";
import { projectImportPreflightDialog } from "../src/features/projectImport/preflightUi";
import type { ImportPreflightRelinkHost } from "../src/features/projectImport/preflightUi";
import type { ImportPreflightSnapshot } from "../src/features/projectImport/relink";
import { buildImportSourceStates, emptyPreparedImport } from "../src/features/projectImport/relink";
import { unresolvedImportReferences } from "../src/features/projectImport/unresolved";
import { createTemplateDocument } from "../src/features/schematics/model/sheetDocument";
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { withTestPageIds } from "./helpers/pages";

const NOW = "2026-01-01T00:00:00.000Z";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function flush(): Promise<void> {
  await nextFrame();
  await nextFrame();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function destinationProject(): Project {
  const document = defaultDocument("Destination.pdf", 1);
  document.sha256 = "hash_destination";
  return withTestPageIds(createProject(document));
}

function sourceProject(): Project {
  const pdf = defaultDocument("Plan.pdf", 3);
  pdf.sha256 = "hash_plan";
  pdf.sizeBytes = 2048;
  const project = withTestPageIds(createProject(pdf));
  project.name = "Source";
  return project;
}

function override(): ImportDocumentOverride {
  return {
    pageCount: 3,
    path: "/drawings/Plan.pdf",
    sha256: "hash_plan",
    sizeBytes: 2048,
  };
}

function snapshot(
  destination: Project,
  source: Project,
  input: {
    importPages: number[];
    skipped: number[];
    pageCounts: ReadonlyMap<string, number>;
    mismatches: readonly ImportSourceMismatch[];
  },
): ImportPreflightSnapshot {
  const documentId = source.documents[0].id;
  const prepared = input.importPages.length
    ? prepareProjectImport(
        destination,
        source,
        input.importPages,
        new Map([[documentId, override()]]),
      )
    : emptyPreparedImport();
  return {
    preflight: buildImportPreflight({
      prepared,
      sourceName: source.name,
      skipped: input.skipped,
      warnings: warningsFor(input.mismatches),
      unresolved: unresolvedImportReferences(prepared, destination),
    }),
    sources: buildImportSourceStates({
      source,
      selected: [1, 2, 3],
      skipped: input.skipped,
      pageCounts: input.pageCounts,
      mismatches: input.mismatches,
    }),
  };
}

function warningsFor(mismatches: readonly ImportSourceMismatch[]): PreflightSourceWarning[] {
  const warnings: PreflightSourceWarning[] = [];
  for (const mismatch of mismatches) {
    if (mismatch.checksum) warnings.push({ code: "checksum", documentName: mismatch.name });
    if (mismatch.pageCount) {
      warnings.push({
        code: "pageCount",
        documentName: mismatch.name,
        expected: mismatch.expectedPageCount,
        actual: mismatch.actualPageCount,
      });
    }
  }
  return warnings;
}

function footerButton(labelPart: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find((button) =>
    button.textContent?.includes(labelPart),
  );
}

function action(kind: "relink" | "unrelink" | "confirm" | "skip"): HTMLButtonElement | undefined {
  return (
    document.querySelector<HTMLButtonElement>(`.preflight-action[data-action="${kind}"]`) ??
    undefined
  );
}

function summary(): string {
  return document.querySelector(".preflight-summary")?.textContent ?? "";
}

/**
 * A source with a missing PDF plus an always-available operation card, so the
 * selection holds both an importable page and pages whose file is missing.
 */
function mixedSnapshot(destination: Project, source: Project): ImportPreflightSnapshot {
  const pdf = source.documents[0];
  return {
    preflight: buildImportPreflight({
      prepared: prepareProjectImport(destination, source, [4]),
      sourceName: source.name,
      skipped: [1, 2, 3],
      warnings: [1, 2, 3].map((page) => ({
        code: "skippedPage",
        page,
        documentName: pdf.name,
      })),
      unresolved: unresolvedImportReferences(
        prepareProjectImport(destination, source, [4]),
        destination,
      ),
    }),
    sources: buildImportSourceStates({
      source,
      selected: [1, 2, 3, 4],
      skipped: [1, 2, 3],
      pageCounts: new Map([[source.documents[1].id, 1]]),
      mismatches: [],
    }),
  };
}

afterEach(() => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("import preflight relink dialog", () => {
  it("relinks a missing source, updates the summary and forgets it again", async () => {
    const destination = destinationProject();
    const source = sourceProject();
    const documentId = source.documents[0].id;
    const missing = snapshot(destination, source, {
      importPages: [],
      skipped: [1, 2, 3],
      pageCounts: new Map(),
      mismatches: [],
    });
    const ready = snapshot(destination, source, {
      importPages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[documentId, 3]]),
      mismatches: [],
    });
    const host: ImportPreflightRelinkHost = {
      relink: vi.fn(async () => ready),
      unrelink: vi.fn(async () => missing),
    };
    const before = JSON.stringify(destination);

    const result = projectImportPreflightDialog(missing, host);
    await nextFrame();

    expect(document.body.textContent).toContain("File missing");
    expect(summary()).toContain("No selected page can be imported");
    expect(footerButton("Import")?.disabled).toBe(true);

    action("relink")?.click();
    await flush();

    expect(host.relink).toHaveBeenCalledWith(documentId);
    expect(document.body.textContent).toContain("Verified");
    expect(summary()).toContain("3 pages ready to import");
    expect(footerButton("Import")?.disabled).toBe(false);

    action("unrelink")?.click();
    await flush();

    expect(host.unrelink).toHaveBeenCalledWith(documentId);
    expect(document.body.textContent).toContain("File missing");
    expect(summary()).toContain("No selected page can be imported");
    expect(footerButton("Import")?.disabled).toBe(true);

    // Cancel after a relink and un-relink leaves the project untouched.
    expect(JSON.stringify(destination)).toBe(before);
    footerButton("Cancel")?.click();
    await expect(result).resolves.toEqual({ confirmed: false, clearUnresolved: false });
    expect(JSON.stringify(destination)).toBe(before);
    expect(document.body.textContent).not.toContain("/drawings/Plan.pdf");
  });

  it("requires a relink or an explicit skip for pages of a missing source", async () => {
    const destination = destinationProject();
    const pdf = defaultDocument("Plan.pdf", 3);
    pdf.sha256 = "hash_plan";
    const source = withTestPageIds(createProject(pdf));
    source.name = "Source";
    const card = createTemplateDocument("gridscalr.operation-card.frame", "A3", "Operation card");
    source.documents.push(card);
    source.pages.push({ id: "page_4", documentId: card.id, localPage: 1, state: { name: "Card" } });
    const destinationBefore = JSON.stringify(destination);
    const sourceBefore = JSON.stringify(source);

    const result = projectImportPreflightDialog(mixedSnapshot(destination, source));
    await nextFrame();

    expect(document.body.textContent).toContain("File missing");
    expect(summary()).toContain("needs a relink or an explicit skip");
    expect(footerButton("Import")?.disabled).toBe(true);

    // The skip is explicit and reversible.
    action("skip")?.click();
    await flush();
    expect(document.body.textContent).toContain("Pages will be skipped");
    expect(summary()).toContain("source file missing");
    expect(summary()).toContain("3 selected pages will be skipped");
    expect(footerButton("Import")?.disabled).toBe(false);

    action("skip")?.click();
    await flush();
    expect(document.body.textContent).toContain("File missing");
    expect(summary()).toContain("needs a relink or an explicit skip");
    expect(footerButton("Import")?.disabled).toBe(true);

    action("skip")?.click();
    await flush();
    footerButton("Import")?.click();
    await expect(result).resolves.toEqual({ confirmed: true, clearUnresolved: false });
    // The dialog only reports a decision; filtering happened before it opened.
    expect(JSON.stringify(destination)).toBe(destinationBefore);
    expect(JSON.stringify(source)).toBe(sourceBefore);
  });

  it("offers an opt-in clear for unresolved references and keeps it off by default", async () => {
    const destination = destinationProject();
    const source = sourceProject();
    const measure = source.layers.find((layer) => layer.kind === "measure")!;
    measure.items.push({
      id: "src_area_linked",
      pageId: source.pages[0].id,
      kind: "area",
      points: [
        { x: 10, y: 10 },
        { x: 40, y: 40 },
      ],
      color: "#4cc9f0",
      strokeWidth: 2,
      createdAt: NOW,
      updatedAt: NOW,
      spaceId: "space_src_room",
    });
    source.spaces.push({
      id: "space_src_room",
      kind: "room",
      name: "Source room",
      areaMode: "measured",
      createdAt: NOW,
      updatedAt: NOW,
    });
    const ready = snapshot(destination, source, {
      importPages: [1],
      skipped: [],
      pageCounts: new Map([[source.documents[0].id, 3]]),
      mismatches: [],
    });

    const result = projectImportPreflightDialog(ready);
    await nextFrame();

    expect(document.body.textContent).toContain("room link that does not exist");
    const row = [...document.querySelectorAll<HTMLLabelElement>("label.check-row")].find((label) =>
      label.textContent?.includes("Clear unresolved links"),
    );
    const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(input).toBeDefined();
    expect(input?.checked).toBe(false);

    input!.checked = true;
    input!.dispatchEvent(new Event("change"));
    footerButton("Import")?.click();
    await expect(result).resolves.toEqual({ confirmed: true, clearUnresolved: true });
  });

  it("blocks a checksum mismatch until the changed file is accepted", async () => {
    const destination = destinationProject();
    const source = sourceProject();
    const documentId = source.documents[0].id;
    const changed = snapshot(destination, source, {
      importPages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[documentId, 3]]),
      mismatches: [
        {
          documentId,
          name: source.documents[0].name,
          checksum: true,
          pageCount: false,
          expectedPageCount: 3,
          actualPageCount: 3,
        },
      ],
    });

    const result = projectImportPreflightDialog(changed);
    await nextFrame();

    expect(document.body.textContent).toContain("Checksum changed");
    expect(summary()).toContain("changed source needs explicit confirmation");
    expect(footerButton("Import")?.disabled).toBe(true);

    action("confirm")?.click();
    await flush();

    expect(document.body.textContent).toContain("Changed file accepted");
    expect(summary()).toContain("3 pages ready to import");
    expect(footerButton("Import")?.disabled).toBe(false);

    footerButton("Import")?.click();
    await expect(result).resolves.toEqual({ confirmed: true, clearUnresolved: false });
  });

  it("shows a shorter replacement file and blocks the import", async () => {
    const destination = destinationProject();
    const source = sourceProject();
    const documentId = source.documents[0].id;
    const changed = snapshot(destination, source, {
      importPages: [1, 2],
      skipped: [3],
      pageCounts: new Map([[documentId, 2]]),
      mismatches: [
        {
          documentId,
          name: source.documents[0].name,
          checksum: false,
          pageCount: true,
          expectedPageCount: 3,
          actualPageCount: 2,
        },
      ],
    });

    const result = projectImportPreflightDialog(changed);
    await nextFrame();

    expect(document.body.textContent).toContain("Page count changed");
    expect(document.body.textContent).toContain("The file has 2 pages; the project recorded 3.");
    expect(footerButton("Import")?.disabled).toBe(true);

    footerButton("Cancel")?.click();
    await expect(result).resolves.toEqual({ confirmed: false, clearUnresolved: false });
  });

  it("commits the relinked pages through the existing import path", () => {
    const destination = destinationProject();
    const source = sourceProject();
    const documentId = source.documents[0].id;
    const ready = snapshot(destination, source, {
      importPages: [1, 2, 3],
      skipped: [],
      pageCounts: new Map([[documentId, 3]]),
      mismatches: [],
    });

    // What the dialog hands back after Import is this prepared import.
    const prepared = prepareProjectImport(
      destination,
      source,
      [1, 2, 3],
      new Map([[documentId, override()]]),
    );
    expect(ready.preflight.pages).toBe(3);
    commitProjectImport(destination, prepared);
    expect(destination.pages).toHaveLength(4);
  });
});
