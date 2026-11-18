// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectImportDialogOptions } from "../src/features/projectImport/ui";
import { projectImportDialog } from "../src/features/projectImport/ui";

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function options(overrides: Partial<ProjectImportDialogOptions> = {}): ProjectImportDialogOptions {
  return {
    sourceName: "Source",
    fileName: "Source.gridscalr",
    destinationPage: 4,
    groups: [
      {
        documentId: "doc_pdf",
        documentName: "Plan.pdf",
        documentKind: "pdf",
        pageCount: 2,
        canLocate: true,
        pages: [
          {
            page: 1,
            name: "Ground floor",
            building: "A",
            floor: "1",
            itemCount: 14,
            available: true,
          },
          {
            page: 2,
            name: "Upper floor",
            itemCount: 3,
            available: false,
          },
        ],
      },
      {
        documentId: "doc_sheet",
        documentName: "Operation card",
        documentKind: "template",
        pageCount: 1,
        canLocate: false,
        pages: [
          {
            page: 3,
            name: "Driftkort LB01",
            itemCount: 143,
            available: true,
          },
        ],
      },
    ],
    requestThumbnail: vi.fn(async () => "data:image/png;base64,AAAA"),
    locateDocument: vi.fn(async () => true),
    ...overrides,
  };
}

function footerButton(labelPart: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>(".modal-footer button")].find((button) =>
    button.textContent?.includes(labelPart),
  );
}

function tile(page: number): HTMLLabelElement | undefined {
  return [...document.querySelectorAll<HTMLLabelElement>(".project-import-tile")].find(
    (element) => element.dataset.page === String(page),
  );
}

afterEach(() => {
  document.querySelectorAll(".dialog-layer").forEach((node) => node.remove());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("project import dialog", () => {
  it("keeps a page from a missing PDF selectable and marks it unavailable", async () => {
    const result = projectImportDialog(options());
    await nextFrame();

    expect(document.querySelectorAll(".project-import-group")).toHaveLength(2);
    expect(document.querySelector(".page-import-summary")?.textContent).toContain("0 of 3");
    expect(tile(1)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(tile(2)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(tile(3)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(footerButton("Import")?.disabled).toBe(true);

    // The missing page says so, and says what happens next.
    expect(tile(2)?.classList.contains("is-unavailable")).toBe(true);
    expect(tile(2)?.classList.contains("is-missing-source")).toBe(true);
    expect(tile(2)?.textContent).toContain("File missing");
    expect(tile(2)?.textContent).toContain("Relink or skip these pages in the preflight.");
    const describedBy = tile(2)
      ?.querySelector<HTMLInputElement>("input")
      ?.getAttribute("aria-describedby");
    expect(describedBy).toBe("project-import-missing-2");
    expect(document.getElementById(describedBy!)).not.toBeNull();

    const selectAll = [
      ...document.querySelectorAll<HTMLButtonElement>(".page-import-actions button"),
    ].find((button) => button.textContent?.includes("Select all"));
    selectAll?.click();
    await nextFrame();

    expect((tile(1)?.querySelector<HTMLInputElement>("input") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((tile(2)?.querySelector<HTMLInputElement>("input") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((tile(3)?.querySelector<HTMLInputElement>("input") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(footerButton("Import")?.disabled).toBe(false);
    expect(footerButton("Import")?.textContent).toContain("3");

    // Selecting a missing page warns that the preflight must resolve it.
    const note = document.querySelector<HTMLElement>(".project-import-missing-note");
    expect(note?.hidden).toBe(false);
    expect(note?.textContent).toContain("relink the file or skip those pages");

    footerButton("Import")?.click();
    // The picker hands the missing page to the preflight like any other page.
    await expect(result).resolves.toEqual([1, 2, 3]);
  });

  it("keeps a page disabled when its document has no recovery path", async () => {
    const base = options();
    base.groups = [
      {
        documentId: "doc_tif",
        documentName: "Scan.tif",
        documentKind: "tiff",
        pageCount: 1,
        canLocate: false,
        pages: [{ page: 1, name: "Scan", itemCount: 2, available: false }],
      },
    ];
    const result = projectImportDialog(base);
    await nextFrame();

    expect(tile(1)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
    expect(tile(1)?.classList.contains("is-missing-source")).toBe(false);
    expect(tile(1)?.textContent).toContain("Preview unavailable");
    expect(document.querySelector<HTMLElement>(".project-import-missing-note")?.hidden).toBe(true);

    footerButton("Cancel")?.click();
    await expect(result).resolves.toBeNull();
  });

  it("loads no preview for a missing page until the file is located", async () => {
    const request = vi.fn(async (_page: number) => "data:image/png;base64,AAAA");
    const result = projectImportDialog(options({ requestThumbnail: request }));
    await nextFrame();
    await nextFrame();

    expect(request.mock.calls.map(([page]) => page)).not.toContain(2);

    const locateButton = document.querySelector<HTMLButtonElement>(".project-import-locate");
    locateButton?.click();
    await nextFrame();
    await nextFrame();

    expect(request.mock.calls.map(([page]) => page)).toContain(2);
    footerButton("Cancel")?.click();
    await expect(result).resolves.toBeNull();
  });

  it("locates a missing PDF and enables its pages", async () => {
    const locate = vi.fn(async () => true);
    const request = vi.fn(async () => "data:image/png;base64,AAAA");
    const result = projectImportDialog(
      options({
        locateDocument: locate,
        requestThumbnail: request,
      }),
    );
    await nextFrame();

    const locateButton = document.querySelector<HTMLButtonElement>(".project-import-locate");
    expect(locateButton).not.toBeNull();
    locateButton?.click();
    await nextFrame();
    await nextFrame();

    expect(locate).toHaveBeenCalledWith("doc_pdf");
    expect(tile(2)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(tile(2)?.classList.contains("is-unavailable")).toBe(false);
    expect(tile(2)?.classList.contains("is-missing-source")).toBe(false);
    expect(tile(2)?.textContent).not.toContain("File missing");

    const check = tile(2)?.querySelector<HTMLInputElement>("input") as HTMLInputElement;
    check.checked = true;
    check.dispatchEvent(new Event("change"));
    await nextFrame();
    expect(footerButton("Import")?.textContent).toContain("1");

    footerButton("Import")?.click();
    await expect(result).resolves.toEqual([2]);
  });

  it("returns null on cancel", async () => {
    const result = projectImportDialog(options());
    await nextFrame();
    const cancel = footerButton("Cancel");
    cancel?.click();
    await expect(result).resolves.toBeNull();
  });

  it("shows page metadata and item counts", async () => {
    const result = projectImportDialog(options());
    await nextFrame();
    const first = tile(1);
    expect(first?.textContent).toContain("Ground floor");
    expect(first?.textContent).toContain("A · 1");
    expect(first?.textContent).toContain("14 items");
    footerButton("Cancel")?.click();
    await expect(result).resolves.toBeNull();
  });
});
