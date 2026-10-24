import type { RecentEntry } from "../model/types";
import { sha256Fallback } from "./sha256";

export const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

const RECENT_KEY = "gridscalr.recent.v1";

async function tauriInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

function browserFilePicker(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.querySelector<HTMLInputElement>("#browser-file-input");
    if (!input) {
      resolve(null);
      return;
    }
    input.value = "";
    input.accept = accept;
    const cleanup = () => {
      input.removeEventListener("change", onChange);
      input.removeEventListener("cancel", onCancel);
    };
    const onChange = () => {
      const file = input.files?.[0] ?? null;
      cleanup();
      resolve(file);
    };
    const onCancel = () => {
      cleanup();
      resolve(null);
    };
    input.addEventListener("change", onChange, { once: true });
    input.addEventListener("cancel", onCancel, { once: true });
    input.click();
  });
}

export interface PickedPdf {
  name: string;
  path: string | null;
  bytes: Uint8Array;
}

/** Picks a drawing: PDF or a scanned TIF. */
export async function pickDrawing(): Promise<PickedPdf | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [
        { name: "Drawing", extensions: ["pdf", "tif", "tiff"] },
        { name: "PDF", extensions: ["pdf"] },
        { name: "TIFF image", extensions: ["tif", "tiff"] },
      ],
    });
    if (!path || Array.isArray(path)) return null;
    const bytes = await readFileBytes(path);
    return { name: path.split(/[\\/]/).pop() ?? "Drawing.pdf", path, bytes };
  }
  const file = await browserFilePicker("application/pdf,.pdf,image/tiff,.tif,.tiff");
  if (!file) return null;
  return {
    name: file.name,
    path: null,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export async function pickPdf(): Promise<PickedPdf | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "PDF drawing", extensions: ["pdf"] }],
    });
    if (!path || Array.isArray(path)) return null;
    const bytes = await readFileBytes(path);
    return { name: path.split(/[\\/]/).pop() ?? "Document.pdf", path, bytes };
  }
  const file = await browserFilePicker("application/pdf,.pdf");
  if (!file) return null;
  return {
    name: file.name,
    path: null,
    bytes: new Uint8Array(await file.arrayBuffer()),
  };
}

export interface PickedProject {
  name: string;
  path: string | null;
  text: string;
}

export async function pickImage(): Promise<File | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "Image", extensions: ["png", "jpg", "jpeg"] }],
    });
    if (!path || Array.isArray(path)) return null;
    const name = path.split(/[\\/]/).pop() ?? "Image.png";
    const mime = /\.png$/i.test(name) ? "image/png" : "image/jpeg";
    const bytes = await readFileBytes(path);
    return new File([new Uint8Array(bytes).buffer], name, { type: mime });
  }
  return browserFilePicker("image/png,image/jpeg,.png,.jpg,.jpeg");
}

export async function pickProject(): Promise<PickedProject | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({
      multiple: false,
      directory: false,
      filters: [{ name: "GridScalr project", extensions: ["gridscalr", "json"] }],
    });
    if (!path || Array.isArray(path)) return null;
    const text = await readFileText(path);
    return { name: path.split(/[\\/]/).pop() ?? "Project.gridscalr", path, text };
  }
  const file = await browserFilePicker(".gridscalr,.json,application/json");
  if (!file) return null;
  return { name: file.name, path: null, text: await file.text() };
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  if (!isTauri) throw new Error("Direct file access is not available in the browser.");
  const result = await tauriInvoke<ArrayBuffer | number[]>("read_binary", { path });
  if (result instanceof ArrayBuffer) return new Uint8Array(result);
  if (ArrayBuffer.isView(result)) {
    return new Uint8Array(result.buffer, result.byteOffset, result.byteLength);
  }
  if (Array.isArray(result)) return new Uint8Array(result);
  throw new Error("Unexpected file response.");
}

export async function readFileText(path: string): Promise<string> {
  if (!isTauri) throw new Error("Direct file access is not available in the browser.");
  return tauriInvoke<string>("read_text", { path });
}

export async function pathExists(path: string): Promise<boolean> {
  if (!isTauri) return false;
  try {
    return await tauriInvoke<boolean>("path_exists", { path });
  } catch {
    return false;
  }
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function chooseSavePath(
  filename: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  if (!isTauri) return filename;
  const { save } = await import("@tauri-apps/plugin-dialog");
  return save({ defaultPath: filename, filters });
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  if (!isTauri) {
    downloadBlob(new Blob([contents], { type: "text/plain;charset=utf-8" }), path);
    return;
  }
  await tauriInvoke("write_text", { path, contents });
}

export async function saveTextFile(
  contents: string,
  filename: string,
  filters: { name: string; extensions: string[] }[],
): Promise<string | null> {
  const path = await chooseSavePath(filename, filters);
  if (!path) return null;
  await writeTextFile(path, contents);
  return path;
}

export async function saveBinaryFile(
  bytes: Uint8Array,
  filename: string,
  filters: { name: string; extensions: string[] }[],
  mime = "application/octet-stream",
  forbiddenPath?: string | null,
): Promise<string | null> {
  if (isTauri) {
    const path = await chooseSavePath(filename, filters);
    if (!path) return null;
    if (forbiddenPath && sameFilePath(path, forbiddenPath)) {
      throw new Error(
        "Choose a different file name. GridScalr will not overwrite the source PDF.",
      );
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    await tauriInvoke("write_binary_base64", { path, data: btoa(binary) });
    return path;
  }
  downloadBlob(new Blob([new Uint8Array(bytes).buffer], { type: mime }), filename);
  return filename;
}

function sameFilePath(a: string, b: string): boolean {
  const normalize = (path: string) => path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return normalize(a) === normalize(b);
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (globalThis.crypto?.subtle) {
    try {
      const data = new Uint8Array(bytes).buffer;
      const digest = await crypto.subtle.digest("SHA-256", data);
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    } catch {
      // Web Crypto is unavailable outside a secure context in some browsers.
    }
  }
  return sha256Fallback(bytes);
}

export function getRecent(): RecentEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentEntry[];
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.path === "string") : [];
  } catch {
    return [];
  }
}

export function addRecent(entry: RecentEntry): void {
  if (!entry.path) return;
  try {
    const entries = getRecent().filter((e) => e.path !== entry.path || e.kind !== entry.kind);
    entries.unshift(entry);
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, 8)));
  } catch {
    // Recent files are a convenience only.
  }
}

export function clearRecent(): void {
  try {
    localStorage.removeItem(RECENT_KEY);
  } catch {
    // Ignore.
  }
}

export function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
