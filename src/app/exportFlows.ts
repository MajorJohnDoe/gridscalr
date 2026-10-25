import type { CanvasView } from "../canvas/CanvasView";
import type { DrawingExportOptions } from "../model/export";
import type { Project } from "../model/types";
import { serializeProject, sourceDocumentPaths } from "../io/projectFile";
import { saveBinaryFile, saveTextFile } from "../io/platform";
import { exportProjectPdf } from "../pdf/pdfExport";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { exportQuantityReportPdf } from "../pdf/reportPdf";
import { serializeQuantityCsv } from "../report/csv";
import { serializeMarkupCsv } from "../report/markupCsv";
import { buildQuantityReport } from "../report/reportModel";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";

export type ExportKind = "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf";

const JSON_FILTERS = [{ name: "JSON project", extensions: ["json"] }];
const CSV_FILTERS = [{ name: "CSV markups", extensions: ["csv"] }];
const QUANTITY_CSV_FILTERS = [{ name: "Quantity CSV", extensions: ["csv"] }];
const PNG_FILTERS = [{ name: "PNG image", extensions: ["png"] }];
const PDF_FILTERS = [{ name: "PDF document", extensions: ["pdf"] }];

export interface ExportContext {
  project: Project;
  projectPath: string | null;
  renderer: PdfRenderer | null;
  canvas: CanvasView;
  chooseDrawingExport: (project: Project) => Promise<DrawingExportOptions | null>;
}

function safeProjectName(project: Project): string {
  return project.name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "gridscalr";
}

export async function exportProject(kind: ExportKind, context: ExportContext): Promise<void> {
  const { project, renderer, canvas } = context;
  const safe = safeProjectName(project);
  const protectedPaths = sourceDocumentPaths(project, context.projectPath);
  try {
    if (kind === "csv") {
      const csv = serializeMarkupCsv(project);
      const path = await saveTextFile(csv, `${safe}-markups.csv`, CSV_FILTERS, {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast("Markups exported to CSV.", "success");
      return;
    }

    if (kind === "quantity-csv") {
      const csv = serializeQuantityCsv(buildQuantityReport(project));
      const path = await saveTextFile(csv, `${safe}-quantities.csv`, QUANTITY_CSV_FILTERS, {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast("Quantity report exported to CSV.", "success");
      return;
    }

    if (kind === "quantity-pdf") {
      const bytes = await exportQuantityReportPdf(buildQuantityReport(project));
      const path = await saveBinaryFile(
        bytes,
        `${safe}-quantities.pdf`,
        PDF_FILTERS,
        "application/pdf",
        { forbiddenPaths: protectedPaths },
      );
      if (path) toast("Quantity report exported to PDF.", "success");
      return;
    }

    if (kind === "json") {
      const json = serializeProject(project);
      const path = await saveTextFile(json, `${safe}.json`, JSON_FILTERS, {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast("Project exported to JSON.", "success");
      return;
    }

    if (kind === "drawing") {
      if (!renderer) throw new Error("The source PDF is not available.");
      try {
        const options = await context.chooseDrawingExport(project);
        if (!options) return;
        const bytes = await exportProjectPdf(project, renderer, options);
        const path = await saveBinaryFile(
          bytes,
          `${safe}-markups.pdf`,
          PDF_FILTERS,
          "application/pdf",
          { forbiddenPaths: protectedPaths },
        );
        if (path) {
          toast(
            options.crop ? "Cropped drawing PDF exported." : "Drawing PDF exported.",
            "success",
          );
        }
      } catch (error) {
        if (error instanceof Error && /encrypt/i.test(error.message)) {
          await messageDialog(
            "Cannot export this PDF",
            "The source PDF is encrypted, so it cannot be flattened without its owner password. Open an unencrypted copy and try again.",
            "warning",
          );
          return;
        }
        throw error;
      }
      return;
    }

    const composite = canvas.getCompositeCanvas();
    const blob = await new Promise<Blob | null>((resolve) =>
      composite.toBlob(resolve, "image/png"),
    );
    if (!blob) throw new Error("The canvas could not be exported.");
    const path = await saveBinaryFile(
      new Uint8Array(await blob.arrayBuffer()),
      `${safe}.png`,
      PNG_FILTERS,
      "image/png",
      { forbiddenPaths: protectedPaths },
    );
    if (path) toast("View exported as PNG.", "success");
  } catch (error) {
    await messageDialog(
      "Export failed",
      error instanceof Error ? error.message : String(error),
      "warning",
    );
  }
}
