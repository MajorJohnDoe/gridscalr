import { describe, expect, it } from "vitest";
import {
  ATTACHMENT_WARN_BYTES,
  attachmentSizeMb,
  exceedsAttachmentWarning,
  mailBody,
  mailSubject,
  normalizeComposeOutcome,
  outcomeMessage,
  safeAttachmentName,
} from "../src/features/shareByEmail";
import { drawingPdfFileName, safeExportBaseName } from "../src/model/export";
import { buildDrawingPdfBytes, isEncryptedExportError } from "../src/pdf/drawingExport";

describe("share by e-mail model", () => {
  it("uses the same safe drawing name as File -> Export", () => {
    expect(safeAttachmentName("Ground floor: block A")).toBe("Ground_floor_block_A-markups.pdf");
    expect(safeAttachmentName("Plan")).toBe(drawingPdfFileName("Plan"));
    expect(safeExportBaseName("///")).toBe("gridscalr");
  });

  it("builds a localized subject and body around the project name", () => {
    expect(mailSubject("Plan")).toContain("Plan");
    expect(mailBody("Plan")).toContain("Plan");
  });

  it("warns only above the 20 MB guide", () => {
    expect(exceedsAttachmentWarning(ATTACHMENT_WARN_BYTES)).toBe(false);
    expect(exceedsAttachmentWarning(ATTACHMENT_WARN_BYTES + 1)).toBe(true);
    expect(ATTACHMENT_WARN_BYTES).toBe(20 * 1024 * 1024);
    expect(attachmentSizeMb(25 * 1024 * 1024)).toBe("25.0");
  });

  it("accepts only a complete structured outcome", () => {
    expect(normalizeComposeOutcome({ status: "draft", path: "/tmp/a.pdf", detail: "" })).toEqual({
      status: "draft",
      path: "/tmp/a.pdf",
      detail: "",
    });
    expect(normalizeComposeOutcome({ status: "draft" })).toBeNull();
    expect(normalizeComposeOutcome({ status: "sent", path: "/tmp/a.pdf" })).toBeNull();
    expect(normalizeComposeOutcome(null)).toBeNull();
  });

  it("maps each outcome to a message that names the written file", () => {
    expect(outcomeMessage({ status: "draft", path: "/tmp/a.pdf", detail: "" }).kind).toBe(
      "success",
    );
    const noClient = outcomeMessage({
      status: "no_client",
      path: "/tmp/a.pdf",
      detail: "xdg-email missing",
    });
    expect(noClient.kind).toBe("warning");
    expect(noClient.message).toContain("/tmp/a.pdf");
    const failed = outcomeMessage({
      status: "failed",
      path: "/tmp/a.pdf",
      detail: "boom",
    });
    expect(failed.kind).toBe("error");
    expect(failed.message).toContain("/tmp/a.pdf");
  });

  it("refuses to build bytes without a renderer and recognizes encryption", async () => {
    await expect(
      buildDrawingPdfBytes({} as never, null, {
        pages: [1],
        layerIds: [],
        includeLabels: true,
        includeCalibration: true,
        includeLegend: false,
      }),
    ).rejects.toThrow();
    expect(isEncryptedExportError(new Error("PDF is encrypted"))).toBe(true);
    expect(isEncryptedExportError(new Error("other"))).toBe(false);
  });
});
