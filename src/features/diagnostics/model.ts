import { totalPageCount } from "../../model/documents";
import { sanitizePaths } from "../../model/pathText";
import type { Project } from "../../model/types";

export type LogLevel = "info" | "warn" | "error";

export interface LogEntry {
  at: string;
  level: LogLevel;
  message: string;
}

export interface ProjectStats {
  documents: number;
  pages: number;
  measureLayers: number;
  drawingLayers: number;
  items: number;
  itemsByKind: Array<[string, number]>;
  categories: number;
  countTypes: number;
  embeddedBytes: number;
}

export interface DiagnosticsInput {
  version: string;
  schemaVersion: number;
  platform: string;
  desktop: boolean;
  userAgent: string;
  mode: string;
  locale: string;
  viewport: { width: number; height: number; dpr: number };
  project: ProjectStats | null;
  autosaveFailure: string | null;
  log: LogEntry[];
}

/** Diagnostics must never carry drawing names, labels or file paths. */
export function sanitizeDiagnosticText(value: string, maxLength = 400): string {
  let text = sanitizePaths(value.replace(/\s+/g, " ").trim());
  if (text.length > maxLength) text = `${text.slice(0, maxLength - 1)}…`;
  return text;
}

export function projectStats(project: Project): ProjectStats {
  const kinds = new Map<string, number>();
  let items = 0;
  let measureLayers = 0;
  let drawingLayers = 0;
  for (const layer of project.layers) {
    if (layer.kind === "measure") measureLayers += 1;
    else drawingLayers += 1;
    for (const item of layer.items) {
      items += 1;
      kinds.set(item.kind, (kinds.get(item.kind) ?? 0) + 1);
    }
  }
  let embeddedBytes = 0;
  for (const asset of Object.values(project.assets)) embeddedBytes += asset.byteSize;
  for (const document of project.documents) {
    if (document.embeddedPdf) embeddedBytes += Math.round(document.embeddedPdf.length * 0.75);
  }
  return {
    documents: project.documents.length,
    pages: totalPageCount(project.documents),
    measureLayers,
    drawingLayers,
    items,
    itemsByKind: [...kinds.entries()].sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    ),
    categories: project.categories.length,
    countTypes: project.countTypes.length,
    embeddedBytes,
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function buildDiagnostics(input: DiagnosticsInput): string {
  const lines: string[] = [];
  lines.push(`GridScalr ${input.version} · project schema ${input.schemaVersion}`);
  lines.push(
    `Platform: ${input.platform}${input.desktop ? "" : " (browser fallback)"} · ${input.mode} build`,
  );
  lines.push(
    `Locale: ${input.locale} · viewport ${input.viewport.width}×${input.viewport.height} @${input.viewport.dpr}x`,
  );
  lines.push(`WebView: ${sanitizeDiagnosticText(input.userAgent, 200)}`);

  const project = input.project;
  if (!project) {
    lines.push("Project: none open");
  } else {
    lines.push(
      `Project: ${project.documents} document(s), ${project.pages} page(s), ` +
        `${project.measureLayers} measurement + ${project.drawingLayers} drawing layer(s), ` +
        `${project.items} item(s)`,
    );
    const kinds = project.itemsByKind.map(([kind, count]) => `${kind} ${count}`).join(", ");
    lines.push(`Items: ${kinds || "none"}`);
    lines.push(
      `Categories: ${project.categories} · count types: ${project.countTypes}` +
        (project.embeddedBytes ? ` · embedded data ~${formatBytes(project.embeddedBytes)}` : ""),
    );
  }

  lines.push(
    `Autosave: ${
      input.autosaveFailure ? `failing — ${sanitizeDiagnosticText(input.autosaveFailure)}` : "ok"
    }`,
  );

  if (input.log.length) {
    lines.push(`Recent log (${input.log.length}):`);
    for (const entry of input.log) {
      // Entries are sanitised on write; sanitise again so older or imported
      // logs can never leak a path into diagnostics.
      lines.push(`  ${entry.at} ${entry.level} ${sanitizeDiagnosticText(entry.message)}`);
    }
  }
  return lines.join("\n");
}
