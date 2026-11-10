import { totalPageCount } from "../model/documents";
import type { Project } from "../model/types";
import { parseProject } from "../io/projectFile";
import { readFileText } from "../io/platform";
import { layerVisibleOnPage } from "../model/layers";
import type { PdfRenderer } from "../pdf/pdfRenderer";
import { store } from "../state/store";
import type { PackageHost } from "../features/projectPackage";
import { validatePackagedProjectJson } from "../features/projectPackage/model";
import { computeFileStamp } from "../features/saveIntegrity";
import { t } from "../i18n";

export interface PackageFlowHost {
  confirmDiscard(message: string): Promise<boolean>;
  loadProjectData(project: Project, path: string | null, dirty: boolean): Promise<boolean>;
  renderer(): PdfRenderer | null;
}

export function packageHost(host: PackageFlowHost): PackageHost {
  return {
    confirmDiscard: () => host.confirmDiscard(t("app.packageReplace")),
    openProject: (path, validatePackage) => openPackagedProject(host, path, validatePackage),
    createDrawingPdf: (project) => createPackageDrawingPdf(host, project),
  };
}

async function openPackagedProject(
  host: PackageFlowHost,
  path: string,
  validatePackage: boolean,
): Promise<void> {
  const text = await readFileText(path);
  if (validatePackage) validatePackagedProjectJson(text);
  const project = parseProject(text);
  await host.loadProjectData(project, path, false);
  if (store.projectPath !== path) {
    throw new Error(t("app.packageNotOpened"));
  }
  store.fileStamp = await computeFileStamp(path);
}

async function createPackageDrawingPdf(
  host: PackageFlowHost,
  project: Project,
): Promise<Uint8Array | null> {
  const renderer = host.renderer();
  if (!renderer) throw new Error(t("app.sourcePdfMissing"));
  const pages = Array.from({ length: totalPageCount(project.documents) }, (_, index) => index + 1);
  const layerIds = project.layers
    .filter((layer) => pages.some((page) => layerVisibleOnPage(layer, page)))
    .map((layer) => layer.id);
  const { exportProjectPdf } = await import("../pdf/pdfExport");
  return exportProjectPdf(project, renderer, {
    pages,
    layerIds,
    includeLabels: true,
    includeCalibration: true,
    includeLegend: false,
  });
}
