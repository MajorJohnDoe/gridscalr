import { bytesToBase64 } from "../../io/base64";
import {
  basename,
  chooseDirectory,
  chooseSavePath,
  isTauri,
  joinPath,
  pathExists,
  pickProjectPackage,
} from "../../io/platform";
import { resolveRelativePath, sourceDocumentPaths } from "../../io/projectFile";
import { assertWritablePath } from "../../io/writeGuard";
import type { DocumentRef, Project } from "../../model/types";
import { SCHEMA_VERSION } from "../../model/types";
import { buildQuantityReport } from "../../report/reportModel";
import { serializeQuantityCsv } from "../../report/csv";
import { store } from "../../state/store";
import { confirmDialog, messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import {
  createProjectPackage,
  cancelProjectPackage,
  extractProjectPackage,
  inspectProjectPackage,
  type PackageCreateResult,
  type PackageDataRequest,
  type PackageInspection,
  type PackageSourceRequest,
} from "./ipc";
import {
  DESKTOP_ONLY_MESSAGE,
  describePackageFailure,
  documentArchivePaths,
  normalizePackageFailure,
  parsePackageManifest,
  portableProjectJson,
  safeArchiveBase,
  sourceScanArchivePaths,
  suggestedPackageFileName,
  suggestedProjectFileName,
  type DocumentChecksumOverrides,
  type PackageOptions,
} from "./model";
import { packageDestinationDialog, packageOptionsDialog, runPackageJob } from "./ui";

const PACKAGE_FILTERS = [{ name: "GridScalr project package", extensions: ["zip"] }];

export interface PackageHost {
  /** Confirms that an open project may be replaced, saving first when asked. */
  confirmDiscard(): Promise<boolean>;
  /** Opens a project file that has already been extracted and verified. */
  openProject(path: string, validatePackage: boolean): Promise<void>;
  /** Renders the optional drawing PDF for the package in the app process. */
  createDrawingPdf(project: Project): Promise<Uint8Array | null>;
}

function protectedPathsFor(project: Project): string[] {
  const paths = sourceDocumentPaths(project, store.projectPath);
  if (store.projectPath && !paths.includes(store.projectPath)) paths.push(store.projectPath);
  return paths;
}

function newJobId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function tifCount(project: Project): number {
  return project.documents.filter((document) => document.kind === "tiff").length;
}

function sourcePathFor(document: DocumentRef, projectPath: string | null): string | null {
  if (document.path) return document.path;
  if (projectPath && document.relativePath) {
    return resolveRelativePath(projectPath, document.relativePath);
  }
  return null;
}

function sourceRequest(
  document: DocumentRef,
  archivePath: string,
  kind: "pdf" | "tiff",
  overrides: DocumentChecksumOverrides,
): PackageSourceRequest {
  return {
    sourcePath: document.path ?? "",
    archivePath,
    kind,
    expectedSha256: overrides[document.id]?.sha256 ?? document.sha256 ?? "",
  };
}

async function buildOptionalExports(
  project: Project,
  options: PackageOptions,
  host: PackageHost,
): Promise<PackageDataRequest[]> {
  if (!options.includeQuantityExports && !options.includeDrawingPdf) return [];
  const safe = safeArchiveBase(project.name.replace(/\.gridscalr$/i, "") || "Project", "Project");
  const additions: PackageDataRequest[] = [];
  if (options.includeQuantityExports) {
    const report = buildQuantityReport(project);
    additions.push({
      archivePath: `exports/${safe}-quantities.csv`,
      kind: "quantity-csv",
      dataBase64: bytesToBase64(new TextEncoder().encode(serializeQuantityCsv(report))),
    });
    const { exportQuantityWorkbook } = await import("../../report/xlsx");
    additions.push({
      archivePath: `exports/${safe}-quantities.xlsx`,
      kind: "quantity-xlsx",
      dataBase64: bytesToBase64(exportQuantityWorkbook(project, report)),
    });
    const { exportQuantityReportPdf } = await import("../../pdf/reportPdf");
    additions.push({
      archivePath: `exports/${safe}-quantities.pdf`,
      kind: "quantity-pdf",
      dataBase64: bytesToBase64(await exportQuantityReportPdf(report)),
    });
  }
  if (options.includeDrawingPdf) {
    const bytes = await host.createDrawingPdf(project);
    if (bytes) {
      additions.push({
        archivePath: `exports/${safe}-markups.pdf`,
        kind: "drawing-pdf",
        dataBase64: bytesToBase64(bytes),
      });
    }
  }
  return additions;
}

async function missingSources(
  project: Project,
  projectPath: string | null,
  includeScans: boolean,
): Promise<{ name: string; path: string }[]> {
  const missing: { name: string; path: string }[] = [];
  for (const document of project.documents) {
    if (document.kind === "tiff" && !includeScans) continue;
    const path = sourcePathFor(document, projectPath);
    if (!path || !(await pathExists(path))) {
      missing.push({ name: document.name, path: path ?? document.name });
    }
  }
  return missing;
}

function prepareDocuments(
  project: Project,
  documentPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides,
  projectPath: string | null,
): PackageSourceRequest[] {
  const documents: PackageSourceRequest[] = [];
  for (const document of project.documents) {
    if (document.kind !== "pdf") continue;
    const archivePath = documentPaths.get(document.id);
    const path = sourcePathFor(document, projectPath);
    if (!archivePath || !path) continue;
    documents.push(sourceRequest({ ...document, path }, archivePath, "pdf", overrides));
  }
  return documents;
}

function prepareScans(
  project: Project,
  scanPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides,
  projectPath: string | null,
): PackageSourceRequest[] {
  const scans: PackageSourceRequest[] = [];
  for (const document of project.documents) {
    if (document.kind !== "tiff") continue;
    const archivePath = scanPaths.get(document.id);
    const path = sourcePathFor(document, projectPath);
    if (!archivePath || !path) continue;
    scans.push(sourceRequest({ ...document, path }, archivePath, "tiff", overrides));
  }
  return scans;
}

function checksumMessage(failures: { name: string }[]): string {
  return `These drawings no longer match the checksums stored in the project:\n${failures
    .map((file) => `• ${file.name}`)
    .join(
      "\n",
    )}\n\nUse the current files only for the packaged copy, or cancel and relink them first. The open project is not changed.`;
}

function mapMismatchesToOverrides(
  documentPaths: Map<string, string>,
  scanPaths: Map<string, string>,
  failures: { file: string; actual: string; sizeBytes: number }[],
  overrides: DocumentChecksumOverrides,
): void {
  const byArchive = new Map<string, string>();
  for (const [id, path] of documentPaths) byArchive.set(path, id);
  for (const [id, path] of scanPaths) byArchive.set(path, id);
  for (const failure of failures) {
    const id = byArchive.get(failure.file);
    if (id) overrides[id] = { sha256: failure.actual, sizeBytes: failure.sizeBytes };
  }
}

/** Creates a portable package for the open project. */
export async function packageProjectFlow(host: PackageHost): Promise<void> {
  const project = store.project;
  if (!project) return;
  if (!isTauri) {
    await messageDialog("Project packages", DESKTOP_ONLY_MESSAGE, "info");
    return;
  }

  const options = await packageOptionsDialog(project.documents.length, tifCount(project), true);
  if (!options) return;

  const suggested = suggestedPackageFileName(project);
  const chosenPath = await chooseSavePath(suggested, PACKAGE_FILTERS);
  if (!chosenPath) return;
  const outputPath = chosenPath.toLowerCase().endsWith(".zip") ? chosenPath : `${chosenPath}.zip`;
  try {
    assertWritablePath(outputPath, protectedPathsFor(project));
  } catch (error) {
    await messageDialog(
      "Could not create package",
      error instanceof Error ? error.message : String(error),
      "warning",
    );
    return;
  }

  const missing = await missingSources(project, store.projectPath, options.includeSourceScans);
  if (missing.length) {
    await messageDialog(
      "Source drawings are missing",
      `These files are not available:\n${missing
        .map((file) => `• ${file.name} — ${file.path}`)
        .join("\n")}\n\nRestore or relink them, then package the project again.`,
      "warning",
    );
    return;
  }

  const documentPaths = documentArchivePaths(project);
  const scanPaths = options.includeSourceScans
    ? sourceScanArchivePaths(project)
    : new Map<string, string>();
  const overrides: DocumentChecksumOverrides = {};
  let preparedExports: PackageDataRequest[] | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const projectJson = portableProjectJson(project, documentPaths, overrides);
    const request = {
      jobId: newJobId(),
      outputPath,
      projectFileName: suggestedProjectFileName(project),
      projectJson,
      projectSchema: SCHEMA_VERSION,
      appVersion: __APP_VERSION__,
      createdAt: new Date().toISOString(),
      documents: prepareDocuments(project, documentPaths, overrides, store.projectPath),
      exports: [] as PackageDataRequest[],
      sourceScans: prepareScans(project, scanPaths, overrides, store.projectPath),
      protectedPaths: protectedPathsFor(project),
    };

    const outcome = await runPackageJob<PackageCreateResult>(
      "Creating package",
      async (report, isCancelled) => {
        if (!preparedExports) {
          report.phase("Preparing optional exports");
          preparedExports = await buildOptionalExports(project, options, host);
        }
        if (isCancelled()) {
          const cancelled = new Error("The package was cancelled.");
          (cancelled as Error & { kind?: string }).kind = "cancelled";
          throw cancelled;
        }
        request.exports = preparedExports ?? [];
        report.phase("Writing package");
        return createProjectPackage(request, (progress) => report.update(progress));
      },
      () => void cancelProjectPackage(request.jobId),
    );

    if (outcome.status === "ok") {
      toast(`Package created: ${basename(outputPath)}.`, "success");
      return;
    }
    if (outcome.status === "cancelled") {
      toast("Package cancelled. No file was written.", "info");
      return;
    }
    if (outcome.error.kind === "checksumMismatch") {
      const useCurrent = await confirmDialog(
        "Drawing checksums changed",
        checksumMessage(outcome.error.files),
        "Use current drawings",
      );
      if (!useCurrent) {
        toast("Packaging cancelled. Relink the changed drawings and try again.", "info");
        return;
      }
      mapMismatchesToOverrides(documentPaths, scanPaths, outcome.error.files, overrides);
      continue;
    }
    await messageDialog(
      "Could not create package",
      describePackageFailure(outcome.error),
      "warning",
    );
    return;
  }
  await messageDialog(
    "Could not create package",
    "The drawings kept changing while the package was written. Close other programs that edit them and try again.",
    "warning",
  );
}

/** Opens a package from disk, verifies it, extracts it and opens the project. */
export async function openPackageFlow(host: PackageHost): Promise<void> {
  if (!isTauri) {
    await messageDialog("Project packages", DESKTOP_ONLY_MESSAGE, "info");
    return;
  }
  const packagePath = await pickProjectPackage();
  if (!packagePath) return;

  let inspection: PackageInspection;
  try {
    inspection = await inspectProjectPackage(packagePath);
    parsePackageManifest(inspection.manifestJson);
  } catch (error) {
    const failure = normalizePackageFailure(error);
    await messageDialog("Could not open package", describePackageFailure(failure), "warning");
    return;
  }

  if (!(await host.confirmDiscard())) {
    return;
  }

  let destination = inspection.destinationPath;
  let mode: "new" | "replace" | "reuse" | null = null;
  while (!mode) {
    const exists = await pathExists(destination);
    const choice = await packageDestinationDialog(inspection.projectName, destination, exists);
    if (!choice) return;
    if (choice === "choose") {
      const folder = await chooseDirectory();
      if (folder) destination = joinPath(folder, inspection.projectName);
      continue;
    }
    mode = choice === "extract" ? "new" : choice;
  }

  const job = {
    jobId: newJobId(),
    packagePath,
    destinationPath: destination,
    mode,
  };
  const outcome = await runPackageJob(
    "Opening package",
    (report) => extractProjectPackage(job, (progress) => report.update(progress)),
    () => void cancelProjectPackage(job.jobId),
  );

  if (outcome.status === "cancelled") {
    toast("Opening cancelled. Temporary files were removed.", "info");
    return;
  }
  if (outcome.status === "error") {
    const failure = outcome.error;
    if (failure.kind === "checksumMismatch") {
      await messageDialog(
        "Package checksum mismatch",
        `The package is damaged or was modified:\n${failure.files
          .map((file) => `• ${file.file}`)
          .join(
            "\n",
          )}\n\nChoose Replace folder to extract it again, or download the package again.`,
        "warning",
      );
      return;
    }
    await messageDialog("Could not open package", describePackageFailure(failure), "warning");
    return;
  }

  try {
    parsePackageManifest(outcome.value.manifestJson);
    await host.openProject(outcome.value.projectPath, mode !== "reuse");
    toast(`Opened ${inspection.projectName}.`, "success");
  } catch (error) {
    await messageDialog(
      "Package extracted, but the project could not be opened",
      error instanceof Error ? error.message : String(error),
      "warning",
    );
  }
}

/** Opens the package options dialog for docs capture in the browser fallback. */
export function showPackageDialogPreview(project: Project): void {
  void packageOptionsDialog(project.documents.length, tifCount(project), false);
}
