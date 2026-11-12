// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { withTestPageIds } from "./helpers/pages";
import { createProject, defaultDocument } from "../src/model/layers";
import { validateProject } from "../src/model/integrity";
import { containsAbsolutePath } from "../src/model/pathText";
import type { DocumentRef, Project } from "../src/model/types";
import {
  buildDoctorDiagnostics,
  runProjectDoctor,
  type ProjectDoctorDialogState,
} from "../src/features/projectIntegrity";
import { addDoctorSources } from "../src/features/projectIntegrity/sourceUi";
import type { DoctorSourceRequest } from "../src/features/projectIntegrity/sourceUi";
import {
  buildSourceSnapshot,
  classifyManagedCopies,
  referencedSourceKeys,
  type DoctorSourceSnapshot,
} from "../src/features/projectIntegrity/sourceModel";
import {
  confirmUnusedDrawings,
  deleteUnusedDrawings,
  loadDoctorSources,
} from "../src/features/projectIntegrity/sourceAvailability";
import type * as Platform from "../src/io/platform";
import type { ManagedCopyEntry } from "../src/features/projectIntegrity/sourceFiles";

const mocks = vi.hoisted(() => ({
  state: { tauri: true },
  pathExists: vi.fn(),
  fileSize: vi.fn(),
  listManagedCopies: vi.fn(),
  deleteManagedCopy: vi.fn(),
  confirmDialog: vi.fn(),
}));

vi.mock("../src/io/platform", async (importOriginal) => {
  const actual = await importOriginal<typeof Platform>();
  return {
    ...actual,
    get isTauri() {
      return mocks.state.tauri;
    },
    pathExists: mocks.pathExists,
    fileSize: mocks.fileSize,
  };
});

vi.mock("../src/features/projectIntegrity/sourceFiles", () => ({
  listManagedCopies: mocks.listManagedCopies,
  deleteManagedCopy: mocks.deleteManagedCopy,
}));

vi.mock("../src/ui/dialogs", () => ({
  confirmDialog: mocks.confirmDialog,
  showModal: vi.fn(),
  messageDialog: vi.fn(),
}));

const PROJECT_PATH = "/work/Level 01.gridscalr";

function entry(fileName: string, sizeBytes = 100): ManagedCopyEntry {
  return {
    path: `/work/Level 01.drawings/${fileName}`,
    fileName,
    sizeBytes,
    modifiedAt: 0,
  };
}

function projectWith(documents: DocumentRef[]): Project {
  const project = withTestPageIds(createProject(documents[0] ?? defaultDocument("Plan.pdf", 1)));
  for (const [index, document] of documents.slice(1).entries()) {
    project.documents.push(document);
    project.pages.push({
      id: `page_extra_${index}`,
      documentId: document.id,
      localPage: 1,
      state: {},
    });
  }
  return project;
}

function sourceDocument(name: string, path: string, extra: Partial<DocumentRef> = {}): DocumentRef {
  return {
    ...defaultDocument(name, 1),
    path,
    sizeBytes: 100,
    ...extra,
  };
}

beforeEach(() => {
  mocks.state.tauri = true;
  vi.clearAllMocks();
  mocks.confirmDialog.mockResolvedValue(true);
  mocks.pathExists.mockResolvedValue(true);
  mocks.fileSize.mockResolvedValue(100);
  mocks.listManagedCopies.mockResolvedValue([]);
  mocks.deleteManagedCopy.mockResolvedValue(undefined);
});

describe("doctor source availability", () => {
  it("reports missing, changed and available sources without a save error", async () => {
    const available = sourceDocument("Plan.pdf", "/drawings/plan.pdf");
    const missing = sourceDocument("Old plan.pdf", "/drawings/missing.pdf");
    const changed = sourceDocument("Upper.pdf", "/drawings/upper.pdf");
    const project = projectWith([available, missing, changed]);
    mocks.pathExists.mockImplementation(async (path: string) => path !== missing.path);
    mocks.fileSize.mockImplementation(async (path: string) => (path === changed.path ? 80 : 100));

    const snapshot = await loadDoctorSources(project, PROJECT_PATH);

    expect(snapshot.checked).toBe(true);
    expect(snapshot.missing).toBe(1);
    expect(snapshot.changed).toBe(1);
    expect(snapshot.statuses.map((status) => [status.name, status.state])).toEqual([
      ["Plan.pdf", "ok"],
      ["Old plan.pdf", "missing"],
      ["Upper.pdf", "changed"],
    ]);
    expect(validateProject(project).filter((issue) => issue.severity === "error")).toEqual([]);
  });

  it("reports unchecked in the browser fallback instead of calling every source missing", async () => {
    mocks.state.tauri = false;
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);

    const snapshot = await loadDoctorSources(project, PROJECT_PATH);

    expect(snapshot.checked).toBe(false);
    expect(snapshot.statuses).toEqual([]);
    expect(snapshot.missing).toBe(0);
    expect(mocks.pathExists).not.toHaveBeenCalled();
  });

  it("classifies referenced and orphan copies by exact canonical path", () => {
    const managed = entry("Plan-aaaaaaaa.pdf");
    managed.path = "/work/Level 01.drawings/PLAN-aaaaaaaa.pdf";
    const project = projectWith([
      sourceDocument("Plan.pdf", managed.path, {
        storage: "managed",
        relativePath: "Level 01.drawings/PLAN-aaaaaaaa.pdf",
      }),
      sourceDocument("Nested.pdf", "/work/Level 01.drawings/sub/Nested-cccccccc.pdf", {
        storage: "managed",
        relativePath: "Level 01.drawings/sub/Nested-cccccccc.pdf",
      }),
    ]);
    const nested = entry("Nested-cccccccc.pdf");
    nested.path = "/work/Level 01.drawings/sub/nested-CCCCCCCC.pdf";
    const entries = [managed, entry("Unused-bbbbbbbb.pdf"), nested];

    const { referenced, orphans } = classifyManagedCopies(
      entries,
      referencedSourceKeys(project, PROJECT_PATH),
    );

    expect(referenced.map((copy) => copy.fileName)).toEqual([
      "Plan-aaaaaaaa.pdf",
      "Nested-cccccccc.pdf",
    ]);
    expect(orphans.map((copy) => copy.fileName)).toEqual(["Unused-bbbbbbbb.pdf"]);
  });

  it("counts managed copies and orphans in one snapshot", async () => {
    const referenced = entry("Plan-aaaaaaaa.pdf");
    const project = projectWith([
      sourceDocument("Plan.pdf", referenced.path, { storage: "managed" }),
    ]);
    mocks.listManagedCopies.mockResolvedValue([referenced, entry("Unused-bbbbbbbb.pdf", 40)]);

    const snapshot = await loadDoctorSources(project, PROJECT_PATH);

    expect(snapshot.managed).toHaveLength(2);
    expect(snapshot.referencedManaged).toBe(1);
    expect(snapshot.orphans.map((copy) => copy.fileName)).toEqual(["Unused-bbbbbbbb.pdf"]);
    expect(snapshot.orphanBytes).toBe(40);
  });
});

describe("unused managed-copy cleanup", () => {
  it("lists the full set and count in the confirmation and does nothing when cancelled", async () => {
    mocks.confirmDialog.mockResolvedValue(false);
    const files = [entry("One-aaaaaaaa.pdf"), entry("Two-bbbbbbbb.pdf", 2048)];

    expect(await confirmUnusedDrawings(files)).toBe(false);

    expect(mocks.confirmDialog).toHaveBeenCalledTimes(1);
    const [title, message, action, options] = mocks.confirmDialog.mock.calls[0];
    expect(title).toBe("Remove unused drawings?");
    expect(message).toContain("2");
    expect(message).toContain("One-aaaaaaaa.pdf");
    expect(message).toContain("Two-bbbbbbbb.pdf");
    expect(action).toBe("Delete drawings");
    expect(options).toEqual({ danger: true });
    expect(mocks.deleteManagedCopy).not.toHaveBeenCalled();
  });

  it("never deletes a referenced copy and skips one that becomes referenced", async () => {
    const referenced = entry("Referenced-aaaaaaaa.pdf");
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([
      sourceDocument("Plan.pdf", referenced.path, { storage: "managed" }),
    ]);
    mocks.listManagedCopies.mockResolvedValue([referenced, orphan]);

    const result = await deleteUnusedDrawings(project, [referenced, orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 1, skipped: 1, failed: 0 });
    expect(mocks.deleteManagedCopy).toHaveBeenCalledTimes(1);
    expect(mocks.deleteManagedCopy).toHaveBeenCalledWith(PROJECT_PATH, orphan.fileName);
  });

  it("re-verifies the listing and the reference set immediately before deleting", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    // The file is still listed, but the current project now points at it.
    project.documents[0].path = orphan.path;
    project.documents[0].storage = "managed";
    mocks.listManagedCopies.mockResolvedValue([orphan]);

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 1, failed: 0 });
    expect(mocks.deleteManagedCopy).not.toHaveBeenCalled();
  });

  it("counts a failed deletion and still removes the next selected copy", async () => {
    const first = entry("First-aaaaaaaa.pdf");
    const second = entry("Second-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockResolvedValue([first, second]);
    mocks.deleteManagedCopy.mockImplementation(async (_path: string, name: string) => {
      if (name === first.fileName) throw new Error("locked");
    });

    const result = await deleteUnusedDrawings(project, [first, second], PROJECT_PATH);

    expect(result).toEqual({ removed: 1, skipped: 0, failed: 1 });
    expect(mocks.deleteManagedCopy).toHaveBeenCalledTimes(2);
  });

  it("does not delete when the drawings folder cannot be listed", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockRejectedValue(new Error("denied"));

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 0, failed: 1 });
    expect(mocks.deleteManagedCopy).not.toHaveBeenCalled();
  });
});

describe("doctor source section", () => {
  it("does not block a save when a source is missing", async () => {
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/missing.pdf")]);
    const sources = buildSourceSnapshot({
      checked: true,
      statuses: [
        {
          documentId: project.documents[0].id,
          name: "Plan.pdf",
          path: "/drawings/missing.pdf",
          state: "missing",
          storage: "reference",
        },
      ],
    });
    const saveRepairedCopy = vi.fn().mockResolvedValue(true);
    const seen: ProjectDoctorDialogState[] = [];

    const outcome = await runProjectDoctor(
      {
        project,
        host: { saveRepairedCopy, exportDiagnostics: async () => undefined },
        sources: {
          canChange: true,
          load: async () => sources,
          confirmCleanup: async () => false,
          delete: async () => ({ removed: 0, skipped: 0, failed: 0 }),
        },
      },
      {
        dialog: async (state) => {
          seen.push(state);
          return { kind: "save" };
        },
      },
    );

    expect(outcome.action).toBe("saved");
    expect(saveRepairedCopy).toHaveBeenCalledTimes(1);
    expect(seen[0].sources?.missing).toBe(1);
    expect(seen[0].sources?.statuses[0].state).toBe("missing");
  });

  it("writes source counts without paths or drawing names to diagnostics", () => {
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    const sources: DoctorSourceSnapshot = buildSourceSnapshot({
      checked: true,
      statuses: [
        {
          documentId: project.documents[0].id,
          name: "Plan.pdf",
          path: "/drawings/plan.pdf",
          state: "missing",
          storage: "reference",
        },
      ],
      managed: [entry("Unused-bbbbbbbb.pdf", 1024)],
      orphans: [entry("Unused-bbbbbbbb.pdf", 1024)],
    });

    const text = buildDoctorDiagnostics(project, [], undefined, sources);

    expect(text).toContain("sources: 1 missing, 0 changed, 1 managed, 1 unused");
    expect(text).not.toContain("Plan.pdf");
    expect(text).not.toContain("Unused-bbbbbbbb.pdf");
    expect(containsAbsolutePath(text)).toBe(false);
  });
});

describe("doctor source section rendering", () => {
  function render(canChange: boolean): {
    body: HTMLElement;
    requests: DoctorSourceRequest[];
  } {
    const referenced = entry("Referenced-aaaaaaaa.pdf");
    const orphans = [entry("Unused-bbbbbbbb.pdf"), entry("Unused-cccccccc.pdf")];
    const snapshot = buildSourceSnapshot({
      checked: true,
      statuses: [
        {
          documentId: "doc_1",
          name: "Plan.pdf",
          path: "/drawings/plan.pdf",
          state: "missing",
          storage: "reference",
        },
        {
          documentId: "doc_2",
          name: "Upper.pdf",
          path: "/drawings/upper.pdf",
          state: "ok",
          storage: "reference",
        },
      ],
      managed: [referenced, ...orphans],
      orphans,
    });
    const requests: DoctorSourceRequest[] = [];
    const body = document.createElement("div");
    addDoctorSources(body, {
      snapshot,
      canChange,
      canRelink: true,
      canCopy: true,
      request: (request) => requests.push(request),
    });
    return { body, requests };
  }

  it("shows the state rows and submits only the selected unused copies", () => {
    const { body, requests } = render(true);

    expect(body.textContent).toContain("Sources");
    expect(body.textContent).toContain("Plan.pdf — reference, missing");
    expect(body.textContent).toContain("Upper.pdf — reference, available");
    const boxes = body.querySelectorAll<HTMLInputElement>("input[data-orphan-index]");
    expect(boxes).toHaveLength(2);
    boxes[0].checked = false;
    const remove = [...body.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Remove selected"),
    );
    expect(remove).toBeDefined();
    remove?.click();

    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      kind: "cleanup-sources",
      files: [{ fileName: "Unused-cccccccc.pdf" }],
    });
  });

  it("disables cleanup when the project cannot change sources", () => {
    const { body, requests } = render(false);

    const remove = [...body.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Remove selected"),
    ) as HTMLButtonElement | undefined;
    expect(remove?.disabled).toBe(true);
    remove?.click();
    expect(requests).toEqual([]);
  });
});
