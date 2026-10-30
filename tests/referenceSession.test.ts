import { describe, expect, it, vi } from "vitest";

const destroyMock = vi.fn(async () => undefined);

vi.mock("../src/pdf/pdfRenderer", () => ({
  loadPdfDocument: vi.fn(async () => ({
    numPages: 3,
    loadingTask: { destroy: destroyMock },
  })),
  PdfRenderer: class {
    readonly pageCount = 3;
    destroy = destroyMock;
  },
}));

import { openPdfReferenceSession } from "../src/compare/referenceSession";

describe("PDF reference sessions", () => {
  it("describes a raw drawing reference without a project", async () => {
    const session = await openPdfReferenceSession(
      new TextEncoder().encode("%PDF-1.7"),
      "Revision B.pdf",
      "/drawings/revision-b.pdf",
    );

    expect(session.kind).toBe("pdf");
    expect(session.name).toBe("Revision B.pdf");
    expect(session.pageCount).toBe(3);
    expect(session.path).toBe("/drawings/revision-b.pdf");
    expect(session.sourcePaths).toEqual(["/drawings/revision-b.pdf"]);
    expect(session.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect("project" in session).toBe(false);
  });
});
