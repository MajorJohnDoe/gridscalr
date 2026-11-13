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
  type DoctorSourceCleanupResult,
} from "../src/features/projectIntegrity/sourceAvailability";
import type * as Platform from "../src/io/platform";
import type { ManagedCopyEntry } from "../src/features/projectIntegrity/sourceFiles";

const mocks = vi.hoisted(() => ({
  state: { tauri: true },
  pathExists: vi.fn(),
  fileSize: vi.fn(),
  listManagedCopies: vi.fn(),
  removeManagedCopies: vi.fn(),
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
  removeManagedCopies: mocks.removeManagedCopies,
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
  mocks.removeManagedCopies.mockResolvedValue({
    removed: [],
    skipped: [],
    failed: [],
    folder: null,
  });
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

  it("lists the replaced managed copy as unused and protects the new copy", () => {
    const folder = "/work/Level 01.drawings/";
    const project = projectWith([
      sourceDocument("Revision B.pdf", `${folder}Revision B-bbbbbbbb.pdf`, {
        storage: "managed",
        relativePath: "Level 01.drawings/Revision B-bbbbbbbb.pdf",
        originalPath: "/home/ana/Shared/Revision B.pdf",
        originalSha256: "c".repeat(64),
      }),
    ]);
    const entries = [entry("Old-aaaaaaaa.pdf"), entry("Revision B-bbbbbbbb.pdf")];

    const { referenced, orphans } = classifyManagedCopies(
      entries,
      referencedSourceKeys(project, PROJECT_PATH),
    );

    expect(referenced.map((copy) => copy.fileName)).toEqual(["Revision B-bbbbbbbb.pdf"]);
    expect(orphans.map((copy) => copy.fileName)).toEqual(["Old-aaaaaaaa.pdf"]);
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
  it("lists the full set, the total and the trash policy in the confirmation", async () => {
    mocks.confirmDialog.mockResolvedValue(false);
    const files = [entry("One-aaaaaaaa.pdf"), entry("Two-bbbbbbbb.pdf", 2048)];

    expect(await confirmUnusedDrawings(files)).toBe(false);

    expect(mocks.confirmDialog).toHaveBeenCalledTimes(1);
    const [title, message, action, options] = mocks.confirmDialog.mock.calls[0];
    expect(title).toBe("Remove unused drawings?");
    expect(message).toContain("2");
    expect(message).toContain("One-aaaaaaaa.pdf");
    expect(message).toContain("Two-bbbbbbbb.pdf");
    expect(message).toContain("operating system trash");
    expect(message).not.toContain("cannot be undone");
    expect(action).toBe("Remove drawings");
    expect(options).toEqual({ danger: true });
    expect(mocks.removeManagedCopies).not.toHaveBeenCalled();
  });

  it("removes only the selected copies and never a referenced one", async () => {
    const referenced = entry("Referenced-aaaaaaaa.pdf");
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([
      sourceDocument("Plan.pdf", referenced.path, { storage: "managed" }),
    ]);
    mocks.listManagedCopies.mockResolvedValue([referenced, orphan]);
    mocks.removeManagedCopies.mockResolvedValue({
      removed: [{ fileName: orphan.fileName, destination: "trash" }],
      skipped: [],
      failed: [],
      folder: null,
    });

    const result = await deleteUnusedDrawings(project, [referenced, orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 1, skipped: 1, failed: 0, trashed: 1, folder: null });
    expect(mocks.removeManagedCopies).toHaveBeenCalledTimes(1);
    expect(mocks.removeManagedCopies).toHaveBeenCalledWith(PROJECT_PATH, [orphan.fileName]);
  });

  it("skips a copy that became referenced before the removal", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    // The file is still listed, but the current project now points at it.
    project.documents[0].path = orphan.path;
    project.documents[0].storage = "managed";
    mocks.listManagedCopies.mockResolvedValue([orphan]);

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 1, failed: 0, trashed: 0, folder: null });
    expect(mocks.removeManagedCopies).not.toHaveBeenCalled();
  });

  it("skips a copy that vanished from the folder before the removal", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockResolvedValue([]);

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 1, failed: 0, trashed: 0, folder: null });
    expect(mocks.removeManagedCopies).not.toHaveBeenCalled();
  });

  it("reports a failed move without retrying or removing another copy", async () => {
    const first = entry("First-aaaaaaaa.pdf");
    const second = entry("Second-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockResolvedValue([first, second]);
    mocks.removeManagedCopies.mockResolvedValue({
      removed: [{ fileName: first.fileName, destination: "trash" }],
      skipped: [],
      failed: [second.fileName],
      folder: null,
    });

    const result = await deleteUnusedDrawings(project, [first, second], PROJECT_PATH);

    expect(result).toEqual({ removed: 1, skipped: 0, failed: 1, trashed: 1, folder: null });
    expect(mocks.removeManagedCopies).toHaveBeenCalledTimes(1);
  });

  it("reports the fallback folder when the operating system trash is unavailable", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockResolvedValue([orphan]);
    mocks.removeManagedCopies.mockResolvedValue({
      removed: [{ fileName: orphan.fileName, destination: "folder" }],
      skipped: [],
      failed: [],
      folder: "/work/.Level 01.gridscalr.1.2.0.removed",
    });

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result.removed).toBe(1);
    expect(result.trashed).toBe(0);
    expect(result.folder).toBe("/work/.Level 01.gridscalr.1.2.0.removed");
  });

  it("counts the whole request as failed when the removal command fails", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockResolvedValue([orphan]);
    mocks.removeManagedCopies.mockRejectedValue(new Error("denied"));

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 0, failed: 1, trashed: 0, folder: null });
  });

  it("does not remove anything when the drawings folder cannot be listed", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    mocks.listManagedCopies.mockRejectedValue(new Error("denied"));

    const result = await deleteUnusedDrawings(project, [orphan], PROJECT_PATH);

    expect(result).toEqual({ removed: 0, skipped: 0, failed: 1, trashed: 0, folder: null });
    expect(mocks.removeManagedCopies).not.toHaveBeenCalled();
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
          delete: async () => ({
            removed: 0,
            skipped: 0,
            failed: 0,
            trashed: 0,
            folder: null,
          }),
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

  it("moves nothing when the explicit confirmation is cancelled", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    const sources = buildSourceSnapshot({
      checked: true,
      managed: [orphan],
      orphans: [orphan],
    });
    const confirmCleanup = vi.fn().mockResolvedValue(false);
    const remove = vi.fn();
    let opens = 0;

    const outcome = await runProjectDoctor(
      {
        project,
        host: { saveRepairedCopy: async () => true, exportDiagnostics: async () => undefined },
        sources: {
          canChange: true,
          load: async () => sources,
          confirmCleanup,
          delete: remove,
        },
      },
      {
        dialog: async () => {
          opens += 1;
          return opens === 1
            ? { kind: "cleanup-sources" as const, files: [orphan] }
            : { kind: "close" as const };
        },
      },
    );

    expect(confirmCleanup).toHaveBeenCalledWith([orphan]);
    expect(remove).not.toHaveBeenCalled();
    expect(outcome.action).toBe("close");
  });

  it("moves the confirmed set and reloads the section", async () => {
    const orphan = entry("Unused-bbbbbbbb.pdf");
    const project = projectWith([sourceDocument("Plan.pdf", "/drawings/plan.pdf")]);
    const sources = buildSourceSnapshot({
      checked: true,
      managed: [orphan],
      orphans: [orphan],
    });
    const notice = {
      removed: 1,
      skipped: 0,
      failed: 0,
      trashed: 0,
      folder: "/work/.Level 01.gridscalr.1.2.0.removed",
    };
    const remove = vi.fn().mockResolvedValue(notice);
    const load = vi.fn().mockResolvedValue(sources);
    const seen: ProjectDoctorDialogState[] = [];
    let opens = 0;

    await runProjectDoctor(
      {
        project,
        host: { saveRepairedCopy: async () => true, exportDiagnostics: async () => undefined },
        sources: {
          canChange: true,
          load,
          confirmCleanup: async () => true,
          delete: remove,
        },
      },
      {
        dialog: async (state) => {
          seen.push(state);
          opens += 1;
          return opens === 1
            ? { kind: "cleanup-sources" as const, files: [orphan] }
            : { kind: "close" as const };
        },
      },
    );

    expect(remove).toHaveBeenCalledWith(project, [orphan]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(seen[1].sourceNotice).toEqual(notice);
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
  function renderSnapshot(
    snapshot: DoctorSourceSnapshot,
    options: { canChange?: boolean; notice?: DoctorSourceCleanupResult } = {},
  ): { body: HTMLElement; requests: DoctorSourceRequest[] } {
    const requests: DoctorSourceRequest[] = [];
    const body = document.createElement("div");
    addDoctorSources(body, {
      snapshot,
      notice: options.notice,
      canChange: options.canChange ?? true,
      canRelink: true,
      canCopy: true,
      request: (request) => requests.push(request),
    });
    return { body, requests };
  }

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
    return renderSnapshot(snapshot, { canChange });
  }

  it("shows the file sizes, the total and submits only the selected copies", () => {
    const { body, requests } = render(true);

    expect(body.textContent).toContain("Sources");
    expect(body.textContent).toContain("Plan.pdf — reference, missing");
    expect(body.textContent).toContain("Upper.pdf — reference, available");
    expect(body.textContent).toContain("Unused-bbbbbbbb.pdf (100 B)");
    expect(body.textContent).toContain("2 unused file(s)");
    const boxes = body.querySelectorAll<HTMLInputElement>("input[data-orphan-index]");
    expect(boxes).toHaveLength(2);
    boxes[0].checked = false;
    const remove = [...body.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Remove unused drawings"),
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
      (button.textContent ?? "").includes("Remove unused drawings"),
    ) as HTMLButtonElement | undefined;
    expect(remove?.disabled).toBe(true);
    remove?.click();
    expect(requests).toEqual([]);
  });

  it("disables the action when the project has no unused managed copies", () => {
    const snapshot = buildSourceSnapshot({ checked: true, managed: [], orphans: [] });
    const { body, requests } = renderSnapshot(snapshot);

    expect(body.textContent).toContain("No unused managed copies.");
    const remove = [...body.querySelectorAll("button")].find((button) =>
      (button.textContent ?? "").includes("Remove unused drawings"),
    ) as HTMLButtonElement | undefined;
    expect(remove?.disabled).toBe(true);
    remove?.click();
    expect(requests).toEqual([]);
  });

  it("reports the trash count and the fallback folder after a removal", () => {
    const snapshot = buildSourceSnapshot({ checked: true, managed: [], orphans: [] });
    const { body } = renderSnapshot(snapshot, {
      notice: {
        removed: 3,
        skipped: 1,
        failed: 0,
        trashed: 2,
        folder: "/work/.Level 01.gridscalr.1.2.0.removed",
      },
    });

    expect(body.textContent).toContain("Removed 3, skipped 1, failed 0.");
    expect(body.textContent).toContain("Moved to the operating system trash: 2.");
    expect(body.textContent).toContain("/work/.Level 01.gridscalr.1.2.0.removed");
  });
});
