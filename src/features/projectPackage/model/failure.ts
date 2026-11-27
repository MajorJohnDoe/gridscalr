import { formatBytes } from "../../../io/platform";
import { describeError } from "../../../io/platformError";
import { t } from "../../../i18n";
import type { ChecksumMismatch, MissingFile, PackageFailure } from "./format";

/** Normalises the structured error returned by the Rust commands. */
export function normalizePackageFailure(error: unknown): PackageFailure {
  if (typeof error === "object" && error !== null && "kind" in error) {
    const value = error as Record<string, unknown>;
    const kind = String(value.kind);
    if (kind === "cancelled") return { kind: "cancelled" };
    if (kind === "missingSource" && Array.isArray(value.files)) {
      return { kind: "missingSource", files: value.files as MissingFile[] };
    }
    if (kind === "checksumMismatch" && Array.isArray(value.files)) {
      return { kind: "checksumMismatch", files: value.files as ChecksumMismatch[] };
    }
    if (kind === "destinationExists") {
      return { kind: "destinationExists", path: String(value.path ?? "") };
    }
    if (kind === "sourceOverwrite") {
      return { kind: "sourceOverwrite" };
    }
    if (kind === "insufficientSpace") {
      return {
        kind: "insufficientSpace",
        requiredBytes: Number(value.requiredBytes ?? 0),
        availableBytes: Number(value.availableBytes ?? 0),
      };
    }
    if (kind === "tooLarge") {
      return {
        kind: "tooLarge",
        requiredBytes: Number(value.requiredBytes ?? 0),
        maxBytes: Number(value.maxBytes ?? 0),
      };
    }
    if (kind === "invalidPackage") {
      return {
        kind: "invalidPackage",
        message: String(value.message ?? t("package.errorInvalid")),
      };
    }
    if (kind === "io") {
      return { kind: "io", message: String(value.message ?? t("package.errorOperationFailed")) };
    }
    if (typeof value.message === "string" && value.message) {
      return { kind: "unknown", message: value.message };
    }
  }
  return {
    kind: "unknown",
    message: describeError(error) || t("package.errorOperationFailed"),
  };
}

function messageWithDetail(headline: string, detail: string): string {
  const trimmed = detail.trim();
  return trimmed && trimmed !== headline ? `${headline}\n\n${trimmed}` : headline;
}

export function describePackageFailure(failure: PackageFailure): string {
  switch (failure.kind) {
    case "missingSource":
      return t("package.describeMissingSources", {
        files: failure.files.map((file) => `• ${file.name} — ${file.path}`).join("\n"),
      });
    case "checksumMismatch":
      return t("package.describeChecksumMismatch", {
        files: failure.files.map((file) => `• ${file.name}`).join("\n"),
      });
    case "destinationExists":
      return t("package.describeDestinationExists", { path: failure.path });
    case "sourceOverwrite":
      return t("error.sourceOverwrite");
    case "insufficientSpace":
      return t("package.insufficientSpace", {
        required: formatBytes(failure.requiredBytes),
        available: formatBytes(failure.availableBytes),
      });
    case "tooLarge":
      return t("package.tooLarge", {
        required: formatBytes(failure.requiredBytes),
        limit: formatBytes(failure.maxBytes),
      });
    case "invalidPackage":
      return messageWithDetail(t("package.errorInvalid"), failure.message);
    case "io":
      return messageWithDetail(t("package.errorOperationFailed"), failure.message);
    case "cancelled":
      return t("package.describeCancelled");
    case "unknown":
      return failure.message;
  }
}
