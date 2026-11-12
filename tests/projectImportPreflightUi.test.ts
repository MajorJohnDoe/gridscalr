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
import { createProject, defaultDocument } from "../src/model/layers";
import type { Project } from "../src/model/types";
import { withTestPageIds } from "./helpers/pages";

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

function action(kind: "relink" | "unrelink" | "confirm"): HTMLButtonElement | undefined {
  return (
    document.querySelector<HTMLButtonElement>(`.preflight-action[data-action="${kind}"]`) ??
    undefined
  );
}

function summary(): string {
  return document.querySelector(".preflight-summary")?.textContent ?? "";
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
    await expect(result).resolves.toBe(false);
    expect(JSON.stringify(destination)).toBe(before);
    expect(document.body.textContent).not.toContain("/drawings/Plan.pdf");
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
    await expect(result).resolves.toBe(true);
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
    await expect(result).resolves.toBe(false);
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
