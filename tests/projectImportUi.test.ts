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
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("project import dialog", () => {
  it("renders groups and selects only available pages", async () => {
    const result = projectImportDialog(options());
    await nextFrame();

    expect(document.querySelectorAll(".project-import-group")).toHaveLength(2);
    expect(document.querySelector(".page-import-summary")?.textContent).toContain("0 of 3");
    expect(tile(1)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(tile(2)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(true);
    expect(tile(3)?.querySelector<HTMLInputElement>("input")?.disabled).toBe(false);
    expect(footerButton("Import")?.disabled).toBe(true);

    const selectAll = [
      ...document.querySelectorAll<HTMLButtonElement>(".page-import-actions button"),
    ].find((button) => button.textContent?.includes("Select all"));
    selectAll?.click();
    await nextFrame();

    expect((tile(1)?.querySelector<HTMLInputElement>("input") as HTMLInputElement).checked).toBe(
      true,
    );
    expect((tile(3)?.querySelector<HTMLInputElement>("input") as HTMLInputElement).checked).toBe(
      true,
    );
    expect(footerButton("Import")?.disabled).toBe(false);
    expect(footerButton("Import")?.textContent).toContain("2");

    footerButton("Import")?.click();
    await expect(result).resolves.toEqual([1, 3]);
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
