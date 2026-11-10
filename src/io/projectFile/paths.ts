import { t } from "../../i18n";
import type { Project } from "../../model/types";
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
 * absolute path and the path resolved from the project's relative reference, so
 * an export can never overwrite a drawing even if it was located through the
 * portable fallback.
 */
export function sourceDocumentPaths(project: Project, projectPath: string | null = null): string[] {
  const paths = new Set<string>();
  for (const document of project.documents) {
    if (document.path) paths.add(document.path);
    if (projectPath && document.relativePath) {
      const resolved = resolveRelativePath(projectPath, document.relativePath);
      if (resolved) paths.add(resolved);
    }
  }
  return [...paths];
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
