import type { CanvasView } from "../canvas/CanvasView";
import type { DrawingExportOptions } from "../model/export";
import type { Project } from "../model/types";
import { serializeProject, sourceDocumentPaths } from "../io/projectFile";
import { saveBinaryFile, saveTextFile } from "../io/platform";
import { describeError } from "../io/platformError";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { serializeQuantityCsv } from "../report/csv";
import { serializeMarkupCsv } from "../report/markupCsv";
import { buildQuantityReport } from "../report/reportModel";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { t } from "../i18n";

export type ExportKind =
  "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf" | "quantity-xlsx";

const jsonFilters = () => [{ name: t("export.jsonFilter"), extensions: ["json"] }];
const csvFilters = () => [{ name: t("export.markupCsvFilter"), extensions: ["csv"] }];
const quantityCsvFilters = () => [{ name: t("export.quantityCsvFilter"), extensions: ["csv"] }];
const xlsxFilters = () => [{ name: t("export.xlsxFilter"), extensions: ["xlsx"] }];
const pngFilters = () => [{ name: t("export.pngFilter"), extensions: ["png"] }];
const pdfFilters = () => [{ name: t("export.pdfFilter"), extensions: ["pdf"] }];

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
      const path = await saveTextFile(csv, `${safe}-markups.csv`, csvFilters(), {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast(t("export.markupsExported"), "success");
      return;
    }

    if (kind === "quantity-csv") {
      const csv = serializeQuantityCsv(buildQuantityReport(project));
      const path = await saveTextFile(csv, `${safe}-quantities.csv`, quantityCsvFilters(), {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast(t("export.quantityCsvExported"), "success");
      return;
    }

    if (kind === "quantity-xlsx") {
      const { exportQuantityWorkbook } = await import("../report/xlsx");
      const report = buildQuantityReport(project);
      const bytes = exportQuantityWorkbook(project, report);
      const path = await saveBinaryFile(
        bytes,
        `${safe}-quantities.xlsx`,
        xlsxFilters(),
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        { forbiddenPaths: protectedPaths },
      );
      if (path) toast(t("export.quantityXlsxExported"), "success");
      return;
    }

    if (kind === "quantity-pdf") {
      const { exportQuantityReportPdf } = await import("../pdf/reportPdf");
      const bytes = await exportQuantityReportPdf(buildQuantityReport(project));
      const path = await saveBinaryFile(
        bytes,
        `${safe}-quantities.pdf`,
        pdfFilters(),
        "application/pdf",
        { forbiddenPaths: protectedPaths },
      );
      if (path) toast(t("export.quantityPdfExported"), "success");
      return;
    }

    if (kind === "json") {
      const json = serializeProject(project);
      const path = await saveTextFile(json, `${safe}.json`, jsonFilters(), {
        forbiddenPaths: protectedPaths,
      });
      if (path) toast(t("export.projectJsonExported"), "success");
      return;
    }

    if (kind === "drawing") {
      if (!renderer) throw new Error(t("app.sourcePdfMissing"));
      try {
        const options = await context.chooseDrawingExport(project);
        if (!options) return;
        const { exportProjectPdf } = await import("../pdf/pdfExport");
        const bytes = await exportProjectPdf(project, renderer, options);
        const path = await saveBinaryFile(
          bytes,
          `${safe}-markups.pdf`,
          pdfFilters(),
          "application/pdf",
          { forbiddenPaths: protectedPaths },
        );
        if (path) {
          toast(
            options.crop ? t("export.croppedDrawingExported") : t("export.drawingExported"),
            "success",
          );
        }
      } catch (error) {
        if (error instanceof Error && /encrypt/i.test(error.message)) {
          await messageDialog(
            t("export.cannotExportTitle"),
            t("export.cannotExportEncrypted"),
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
    if (!blob) throw new Error(t("export.canvasExportFailed"));
    const path = await saveBinaryFile(
      new Uint8Array(await blob.arrayBuffer()),
      `${safe}.png`,
      pngFilters(),
      "image/png",
      { forbiddenPaths: protectedPaths },
    );
    if (path) toast(t("export.pngExported"), "success");
  } catch (error) {
    await messageDialog(t("export.failedTitle"), describeError(error), "warning");
  }
}
