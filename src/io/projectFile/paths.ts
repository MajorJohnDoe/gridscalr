import { t } from "../../i18n";
import type { Project } from "../../model/types";
import { sameFilePath } from "../writeGuard";
import { serializeProject } from "./serialize";

export function suggestedProjectName(project: Project): string {
  const safe = project.name.replace(/[^\w\-. ]+/g, "").trim() || t("app.untitledProject");
  return `${safe}.gridscalr`;
}

export function relativeDocumentPath(
  projectPath: string,
  documentPath: string | null,
): string | null {
  if (!documentPath) return null;
  const normalize = (path: string) => path.replace(/\\/g, "/");
  const projectDir = normalize(projectPath).split("/").slice(0, -1).join("/");
  const doc = normalize(documentPath);
  if (!projectDir) return doc;
  const projectParts = projectDir.split("/");
  const docParts = doc.split("/");
  if (projectParts[0] !== docParts[0]) return null;
  let i = 0;
  while (i < projectParts.length && i < docParts.length && projectParts[i] === docParts[i]) i++;
  const up = projectParts.length - i;
  return [...Array(up).fill(".."), ...docParts.slice(i)].join("/");
}

export function resolveRelativePath(
  projectPath: string,
  relativePath: string | null,
): string | null {
  if (!relativePath) return null;
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const projectDir = projectPath.split(/[\\/]/).slice(0, -1).join(separator);
  if (!projectDir) return relativePath;
  const parts = `${projectDir}${separator}${relativePath.replace(/[\\/]/g, separator)}`.split(
    separator,
  );
  const resolved: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") resolved.pop();
    else resolved.push(part);
  }
  return (projectPath.startsWith("/") ? "/" : "") + resolved.join(separator);
}

/**
 * Every path that belongs to a source document. This includes both the stored
 * absolute path, the original drawing behind a managed copy, the path resolved
 * from the project's relative reference and the managed-copy folder itself, so
 * an export can never overwrite a drawing even if it was located through the
 * portable fallback or reached the folder through a new file name.
 */
export function sourceDocumentPaths(project: Project, projectPath: string | null = null): string[] {
  const paths = new Set<string>();
  for (const document of project.documents) {
    if (document.path) paths.add(document.path);
    // F-031: a managed copy keeps its original drawing in `originalPath`. That
    // file must never be a save or export target either.
    if (document.originalPath) paths.add(document.originalPath);
    if (projectPath && document.relativePath) {
      const resolved = resolveRelativePath(projectPath, document.relativePath);
      if (resolved) {
        paths.add(resolved);
        if (document.storage === "managed") {
          const folder = resolved.replace(/[\\/][^\\/]*$/, "");
          if (folder) paths.add(folder);
        }
      }
    }
  }
  return [...paths];
}

/**
 * The managed-copy folder of a project, `<project folder>/<stem>.drawings`.
 * A verified copy is only ever written here.
 */
export function managedDrawingsFolder(projectPath: string | null): string | null {
  if (!projectPath) return null;
  const separator = projectPath.includes("\\") ? "\\" : "/";
  const parts = projectPath.split(/[\\/]/);
  const name = parts.pop() ?? "";
  if (!name) return null;
  const stem = name.replace(/\.gridscalr$/i, "");
  const folder = parts.join(separator);
  if (!folder) return projectPath.startsWith("/") ? `/${stem}.drawings` : null;
  return `${folder}${separator}${stem}.drawings`;
}

/**
 * Protected paths for the managed-copy command: every source document,
 * including each managed copy and the original drawing behind it, minus the
 * project's own drawings folder.
 *
 * That folder is the copy destination, so protecting it as a root refuses every
 * copy once a project already holds one managed drawing. The Rust guard still
 * refuses a destination that resolves outside the folder, and every existing
 * document path stays individually protected.
 */
export function managedCopyProtectedPaths(project: Project, projectPath: string | null): string[] {
  const folder = managedDrawingsFolder(projectPath);
  return sourceDocumentPaths(project, projectPath).filter(
    (path) => !folder || !sameFilePath(path, folder),
  );
}

/** Recomputes every document's relative path for a new project location. */
export function updateRelativeDocumentPaths(project: Project, projectPath: string | null): void {
  for (const document of project.documents) {
    document.relativePath =
      projectPath && document.path ? relativeDocumentPath(projectPath, document.path) : null;
  }
}

/**
 * Serializes the project for a destination without changing the open project's
 * stored links. Used by **Save a copy** so the copy finds its drawings through
 * paths relative to the copy's own folder while the original stays untouched.
 */
export function serializeProjectCopy(project: Project, projectPath: string | null): string {
  const previous = project.documents.map((document) => document.relativePath);
  try {
    updateRelativeDocumentPaths(project, projectPath);
    return serializeProject(project);
  } finally {
    project.documents.forEach((document, index) => {
      document.relativePath = previous[index] ?? null;
    });
  }
}
