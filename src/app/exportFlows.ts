import type { CanvasView } from "../canvas/CanvasView";
import { drawingPdfFileName, safeExportBaseName, type DrawingExportOptions } from "../model/export";
import type { Project } from "../model/types";
import { serializeProject, sourceDocumentPaths } from "../io/projectFile";
import { saveBinaryFile, saveTextFile } from "../io/platform";
import { describeError } from "../io/platformError";
import { buildDrawingPdfBytes, isEncryptedExportError } from "../pdf/drawingExport";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { serializeQuantityCsv } from "../report/csv";
import { serializeMarkupCsv } from "../report/markupCsv";
import { buildQuantityReport } from "../report/reportModel";
import { findSchedule, serializeScheduleCsv } from "../features/schedules";
import { store } from "../state/store";
import { messageDialog } from "../ui/dialogs";
import { toast } from "../ui/toast";
import { t } from "../i18n";

export type ExportKind =
  "csv" | "json" | "png" | "drawing" | "quantity-csv" | "quantity-pdf" | "quantity-xlsx";

const jsonFilters = () => [{ name: t("export.jsonFilter"), extensions: ["json"] }];
const csvFilters = () => [{ name: t("export.markupCsvFilter"), extensions: ["csv"] }];
const quantityCsvFilters = () => [{ name: t("export.quantityCsvFilter"), extensions: ["csv"] }];
const scheduleCsvFilters = () => [{ name: t("export.scheduleCsvFilter"), extensions: ["csv"] }];
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

function safeScheduleName(name: string): string {
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "") || "schedule";
}

/**
 * Exports one stored schedule as a round-trip CSV. A grouped schedule is
 * written read-only and says so, because its grouped rows have no stable IDs.
 * The export never touches a source drawing.
 */
export async function exportScheduleCsvFlow(scheduleId: string): Promise<void> {
  const project = store.project;
  if (!project) return;
  const schedule = findSchedule(project, scheduleId);
  if (!schedule) {
    toast(t("export.scheduleCsvMissing"), "warning");
    return;
  }
  const result = serializeScheduleCsv(project, scheduleId);
  if (!result) return;
  const protectedPaths = sourceDocumentPaths(project, store.projectPath);
  try {
    const path = await saveTextFile(
      result.text,
      `${safeExportBaseName(project.name)}-${safeScheduleName(schedule.name)}.csv`,
      scheduleCsvFilters(),
      { forbiddenPaths: protectedPaths },
    );
    if (!path) return;
    toast(
      result.importable
        ? t("export.scheduleCsvExported", { name: schedule.name })
        : t("export.scheduleCsvReadOnlyExported", { name: schedule.name }),
      result.importable ? "success" : "warning",
    );
  } catch (error) {
    await messageDialog(t("export.failedTitle"), describeError(error), "warning");
  }
}

export async function exportProject(kind: ExportKind, context: ExportContext): Promise<void> {
  const { project, renderer, canvas } = context;
  const safe = safeExportBaseName(project.name);
  const protectedPaths = sourceDocumentPaths(project, context.projectPath);
  if (!project.pages.length && (kind === "drawing" || kind === "png")) {
    toast(t("export.noPages"), "warning");
    return;
  }
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
      try {
        const options = await context.chooseDrawingExport(project);
        if (!options) return;
        const bytes = await buildDrawingPdfBytes(project, renderer, options);
        const path = await saveBinaryFile(
          bytes,
          drawingPdfFileName(project.name),
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
        if (isEncryptedExportError(error)) {
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
