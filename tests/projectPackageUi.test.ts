// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  packageDestinationDialog,
  packageOptionsDialog,
  runPackageJob,
} from "../src/features/projectPackage/ui";

function button(label: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (entry) => entry.textContent === label,
  );
}

afterEach(() => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
});

describe("project package dialogs", () => {
  it("keeps every optional feature off until the user selects it", async () => {
    const pending = packageOptionsDialog(2, 1, true);
    const checkboxes = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(checkboxes).toHaveLength(3);
    expect([...checkboxes].every((input) => !input.checked)).toBe(true);

    checkboxes[0].checked = true;
    checkboxes[2].checked = true;
    button("Create package")?.click();

    await expect(pending).resolves.toEqual({
      includeQuantityExports: true,
      includeDrawingPdf: false,
      includeSourceScans: true,
    });
  });

  it("shows the expected package size and updates it with the options", async () => {
    const pending = packageOptionsDialog(2, 1, true, (options) =>
      options.includeSourceScans ? 3 * 1024 * 1024 : 2 * 1024 * 1024,
    );
    expect(document.body.textContent).toContain("Expected uncompressed size: 2.0 MB");
    const scans = document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[2];
    scans.checked = true;
    scans.dispatchEvent(new Event("change"));
    expect(document.body.textContent).toContain("Expected uncompressed size: 3.0 MB");
    button("Create package")?.click();
    await expect(pending).resolves.toEqual({
      includeQuantityExports: false,
      includeDrawingPdf: false,
      includeSourceScans: true,
    });
  });

  it("disables package creation in the browser fallback", async () => {
    const pending = packageOptionsDialog(1, 0, false);
    expect(button("Create package")?.disabled).toBe(true);
    expect(document.body.textContent).toContain("Project packages require the desktop app.");
    expect(button("Cancel")).toBeDefined();
    button("Cancel")?.click();
    await expect(pending).resolves.toBeNull();
  });

  it("offers reuse or replacement for an existing extraction", async () => {
    const reuse = packageDestinationDialog("Plan", "/tmp/Plan", true);
    expect(button("Replace folder")).toBeDefined();
    button("Open existing")?.click();
    await expect(reuse).resolves.toBe("reuse");

    const replace = packageDestinationDialog("Plan", "/tmp/Plan", true);
    button("Replace folder")?.click();
    await expect(replace).resolves.toBe("replace");

    const fresh = packageDestinationDialog("Plan", "/tmp/Plan", false);
    expect(button("Open existing")).toBeUndefined();
    button("Extract here")?.click();
    await expect(fresh).resolves.toBe("extract");
  });

  it("shows the uncompressed size before extraction", async () => {
    const pending = packageDestinationDialog("Plan", "/tmp/Plan", false, 5 * 1024 * 1024);
    expect(document.body.textContent).toContain("Uncompressed size: 5.0 MB");
    button("Extract here")?.click();
    await expect(pending).resolves.toBe("extract");
  });

  it("reports progress and resolves a completed job", async () => {
    const outcome = await runPackageJob(
      "Test package",
      async (report) => {
        report.update({
          phase: "Writing package",
          processedBytes: 5,
          totalBytes: 10,
          currentFile: "documents/Plan.pdf",
        });
        return 42;
      },
      () => undefined,
    );

    expect(outcome).toEqual({ status: "ok", value: 42 });
    expect(document.querySelector(".modal-backdrop")).toBeNull();
  });

  it("asks the job to cancel and reports a cancelled outcome", async () => {
    let cancelCalled = false;
    const pending = runPackageJob<number>(
      "Test package",
      (_report, isCancelled) =>
        new Promise((_resolve, reject) => {
          const timer = setInterval(() => {
            if (!isCancelled()) return;
            clearInterval(timer);
            const error = new Error("Cancelled.");
            (error as Error & { kind?: string }).kind = "cancelled";
            reject(error);
          }, 1);
        }),
      () => {
        cancelCalled = true;
      },
    );

    expect(document.body.textContent).toContain("Starting");
    button("Cancel")?.click();
    const outcome = await pending;

    expect(cancelCalled).toBe(true);
    expect(outcome).toEqual({ status: "cancelled" });
  });
});
