import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultLayers, createProject, defaultDocument } from "../src/model/layers";
import { defaultDrawingExportOptions, type DrawingExportOptions } from "../src/model/export";
import { withTestPageIds } from "./helpers/pages";
import type * as Platform from "../src/io/platform";

const saved: { bytes: Uint8Array; name: string }[] = [];
const exportPdf = vi.fn(async () => new Uint8Array([1, 2, 3]));

vi.mock("../src/io/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof Platform>();
  return {
    ...actual,
    saveBinaryFile: vi.fn(async (bytes: Uint8Array, name: string) => {
      saved.push({ bytes, name });
      return name;
    }),
  };
});

vi.mock("../src/pdf/pdfExport", () => ({ exportProjectPdf: exportPdf }));

const dialogs: string[] = [];
vi.mock("../src/ui/dialogs", () => ({
  messageDialog: vi.fn(async (_title: string, message: string) => {
    dialogs.push(message);
  }),
}));
vi.mock("../src/ui/toast", () => ({ toast: vi.fn() }));

import { exportProject } from "../src/app/exportFlows";
import { buildDrawingPdfBytes } from "../src/pdf/drawingExport";

describe("drawing export flow", () => {
  beforeEach(() => {
    saved.length = 0;
    dialogs.length = 0;
    exportPdf.mockClear();
  });

  it("uses the shared drawing builder and the shared file name", async () => {
    const project = withTestPageIds(
      createProject({ ...defaultDocument("Export.pdf", 2), pageCount: 2 }, createDefaultLayers()),
    );
    const options: DrawingExportOptions = {
      ...defaultDrawingExportOptions(project, 1),
      pages: [2],
      includeLegend: true,
    };
    await exportProject("drawing", {
      project,
      projectPath: null,
      renderer: {} as never,
      canvas: {} as never,
      chooseDrawingExport: async () => options,
    });
    expect(dialogs).toEqual([]);
    expect(exportPdf).toHaveBeenCalledTimes(1);
    expect(exportPdf).toHaveBeenCalledWith(project, expect.anything(), options);
    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe("Export-markups.pdf");
  });

  it("returns the same bytes through the shared builder", async () => {
    const project = withTestPageIds(
      createProject({ ...defaultDocument("Plan.pdf", 1), pageCount: 1 }, createDefaultLayers()),
    );
    const bytes = await buildDrawingPdfBytes(project, {} as never, {
      pages: [1],
      layerIds: [],
      includeLabels: true,
      includeCalibration: true,
      includeLegend: false,
    });
    expect([...bytes]).toEqual([1, 2, 3]);
  });
});
