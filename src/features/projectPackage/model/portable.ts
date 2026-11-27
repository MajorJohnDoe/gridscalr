import { serializeProject } from "../../../io/projectFile";
import type { Project } from "../../../model/types";
import { documentSourceKey } from "../../sourceStorage";
import { byteLength, documentArchivePaths } from "./archive";
import type { DocumentChecksumOverrides, PackageOptions } from "./format";

/** `README.txt` and the archive headers are small but never zero. */
const PACKAGE_OVERHEAD_BYTES = 4096;

/**
 * Builds the project file that travels inside the package. Absolute document
 * paths are cleared, PDFs point at their document archive entry, TIF documents
 * keep their embedded PDF, and accepted checksum changes only touch this copy.
 */
export function portableProjectJson(
  project: Project,
  documentPaths: Map<string, string>,
  overrides: DocumentChecksumOverrides = {},
  cachePaths: Map<string, string> = new Map(),
): string {
  const copy = structuredClone(project);
  for (const document of copy.documents) {
    document.path = null;
    // The sender's original absolute path never travels inside a package.
    // The checksum stays as provenance for the managed copy.
    document.originalPath = null;
    if (document.kind === "pdf") {
      document.relativePath = documentPaths.get(document.id) ?? null;
      const override = overrides[document.id];
      if (override) {
        document.sha256 = override.sha256;
        document.sizeBytes = override.sizeBytes;
      }
    } else {
      document.relativePath = null;
      // A cache-backed scan travels as its derived cache, at the archive path
      // the manifest lists under `derivedCaches`. The scan is not carried too.
      if (document.derivedPdf) {
        const archive = cachePaths.get(document.id);
        if (archive) document.derivedPdf.relativePath = archive;
      }
    }
  }
  return serializeProject(copy);
}

/**
 * Upper bound of the package content that is known before the optional exports
 * are generated: the packaged project file, one copy per physical source and a
 * small allowance for the README and archive headers. The package dialog shows
 * it, and the controller refuses a known-too-large package before it asks for a
 * path (F-044). Generated PDFs, workbooks and reports are not included.
 */
export function estimatePackageBytes(project: Project, options: PackageOptions): number {
  const projectBytes = byteLength(portableProjectJson(project, documentArchivePaths(project)));
  const seen = new Set<string>();
  let sourceBytes = 0;
  for (const document of project.documents) {
    // A cache-backed scan always ships as its derived cache, whose size is
    // close to the scan it was built from; the manifest carries the exact size.
    const cacheBacked = document.kind === "tiff" && Boolean(document.derivedPdf);
    const included =
      document.kind === "pdf" ||
      cacheBacked ||
      (document.kind === "tiff" && options.includeSourceScans);
    if (!included) continue;
    const key = documentSourceKey(document);
    if (seen.has(key)) continue;
    seen.add(key);
    sourceBytes += document.sizeBytes ?? 0;
  }
  return projectBytes + sourceBytes + PACKAGE_OVERHEAD_BYTES;
}
