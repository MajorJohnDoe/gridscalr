import { describe, expect, it, vi } from "vitest";
import { setCategoryQuantityOverride, setQuantityDefaults } from "../src/model/commands/settings";
import { createProject, defaultDocument } from "../src/model/layers";
import { SessionStore } from "../src/state/sessionStore";
import { ProjectStore } from "../src/state/projectStore";
import { Store } from "../src/state/store";
import { withTestPageIds } from "./helpers/pages";

function makeProject(pageCount = 2) {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pageCount)));
}

function makeProjectStore() {
  const notify = vi.fn();
  const mark = vi.fn();
  const holder: { store?: ProjectStore } = {};
  const session = new SessionStore({
    notify,
    project: () => holder.store?.project ?? null,
    readOnly: () => holder.store?.readOnly ?? false,
  });
  const projectStore = new ProjectStore({ session, mark });
  holder.store = projectStore;
  projectStore.subscribe(notify);
  return { projectStore, session, notify, mark };
}

describe("ProjectStore loading", () => {
  it("installs a project, clears history and ensures an asset map", () => {
    const project = makeProject();
    delete (project as Partial<typeof project>).assets;
    const { projectStore } = makeProjectStore();
    const before = projectStore.revision;

    projectStore.loadProject(project, "/drawings/Plan.gridscalr", true);

    expect(projectStore.project).toBe(project);
    expect(projectStore.projectPath).toBe("/drawings/Plan.gridscalr");
    expect(projectStore.dirty).toBe(true);
    expect(projectStore.readOnly).toBe(false);
    expect(projectStore.fileStamp).toBeNull();
    expect(projectStore.autosaveError).toBeNull();
    expect(projectStore.revision).toBe(before + 1);
    expect(project.assets).toEqual({});
    expect(projectStore.canUndo).toBe(false);
    expect(projectStore.canRedo).toBe(false);
  });

  it("unloads the project and starts an empty timeline", () => {
    const { projectStore } = makeProjectStore();
    projectStore.loadProject(makeProject(), "/drawings/Plan.gridscalr");
    projectStore.mutate((project) => {
      project.name = "Changed";
    });
    expect(projectStore.canUndo).toBe(true);
    const before = projectStore.revision;

    projectStore.unloadProject();

    expect(projectStore.project).toBeNull();
    expect(projectStore.projectPath).toBeNull();
    expect(projectStore.dirty).toBe(false);
    expect(projectStore.revision).toBe(before + 1);
    expect(projectStore.canUndo).toBe(false);
    expect(projectStore.canRedo).toBe(false);
  });
});

describe("ProjectStore mutation and history", () => {
  it("records one undo step and one notification per mutate call", () => {
    const { projectStore, notify } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);
    const before = projectStore.revision;
    notify.mockClear();

    projectStore.mutate((project) => {
      project.name = "Changed";
    }, "change");

    expect(projectStore.project!.name).toBe("Changed");
    expect(projectStore.dirty).toBe(true);
    expect(projectStore.revision).toBe(before + 1);
    expect(projectStore.canUndo).toBe(true);
    expect(projectStore.canRedo).toBe(false);
    expect(notify).toHaveBeenCalledWith("change");

    projectStore.undo();
    expect(projectStore.project!.name).not.toBe("Changed");
    expect(projectStore.canUndo).toBe(false);
    expect(projectStore.canRedo).toBe(true);
    expect(projectStore.revision).toBe(before + 2);

    projectStore.redo();
    expect(projectStore.project!.name).toBe("Changed");
    expect(projectStore.canUndo).toBe(true);
    expect(projectStore.canRedo).toBe(false);
  });

  it("marks the project saved without touching the history", () => {
    const { projectStore, notify } = makeProjectStore();
    projectStore.loadProject(makeProject(), "/drawings/Plan.gridscalr", true);
    projectStore.mutate((project) => {
      project.name = "Changed";
    });
    notify.mockClear();

    projectStore.markSaved("/drawings/Renamed.gridscalr");

    expect(projectStore.projectPath).toBe("/drawings/Renamed.gridscalr");
    expect(projectStore.dirty).toBe(false);
    expect(projectStore.canUndo).toBe(true);
    expect(notify).toHaveBeenCalledWith("save");
  });

  it("keeps only the changed mutations as history steps", () => {
    const { projectStore } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);

    const changed = projectStore.mutateIfChanged((project) => {
      project.name = "Changed";
      return true;
    });
    const unchanged = projectStore.mutateIfChanged(() => false);

    expect(changed).toBe(true);
    expect(unchanged).toBe(false);
    expect(projectStore.canUndo).toBe(true);

    projectStore.undo();
    expect(projectStore.canUndo).toBe(false);
  });
});

describe("ProjectStore gestures", () => {
  it("commits a changed gesture as one undo step", () => {
    const { projectStore } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);
    const before = projectStore.revision;

    projectStore.beginGesture();
    projectStore.project!.settings.snapTolerancePx = 12;
    projectStore.noteGestureChange();
    projectStore.endGesture();

    expect(projectStore.revision).toBe(before + 1);
    expect(projectStore.dirty).toBe(true);
    expect(projectStore.canUndo).toBe(true);
  });

  it("discards a gesture that changed nothing", () => {
    const { projectStore } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);
    const before = projectStore.revision;

    projectStore.beginGesture();
    projectStore.endGesture();

    expect(projectStore.revision).toBe(before);
    expect(projectStore.canUndo).toBe(false);
  });

  it("restores the project when a gesture is cancelled", () => {
    const { projectStore } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);
    const before = projectStore.revision;
    const original = projectStore.project!.settings.snapTolerancePx;

    projectStore.beginGesture();
    projectStore.project!.settings.snapTolerancePx = original + 4;
    projectStore.noteGestureChange();
    projectStore.cancelGesture();

    expect(projectStore.project!.settings.snapTolerancePx).toBe(original);
    // One bump from the direct edit and one from the restored snapshot.
    expect(projectStore.revision).toBe(before + 2);
    expect(projectStore.canUndo).toBe(false);
  });
});

describe("ProjectStore read-only", () => {
  it("refuses mutation, gestures and history changes while view-only", () => {
    const { projectStore, notify } = makeProjectStore();
    projectStore.loadProject(makeProject(), null);
    projectStore.mutate((project) => {
      project.name = "Changed";
    });
    const before = projectStore.revision;
    const name = projectStore.project!.name;

    notify.mockClear();
    projectStore.setReadOnly(true);
    projectStore.mutate((project) => {
      project.name = "Blocked";
    });
    projectStore.beginGesture();
    projectStore.noteGestureChange();
    projectStore.endGesture();
    projectStore.undo();
    projectStore.redo();

    expect(projectStore.project!.name).toBe(name);
    expect(projectStore.revision).toBe(before);
    expect(projectStore.canUndo).toBe(true);
    expect(notify).toHaveBeenCalledWith("save");
  });
});

describe("ProjectStore undo view cleanup", () => {
  it("follows the visible page by PageId across undo", () => {
    const { projectStore, session } = makeProjectStore();
    projectStore.loadProject(makeProject(3), null);
    session.ui.page = 2;

    projectStore.mutate((next) => {
      const first = next.pages[0];
      next.pages[0] = next.pages[1];
      next.pages[1] = first;
    });
    // Display page 2 now shows the page that was page 1.
    projectStore.undo();

    expect(session.ui.page).toBe(1);
  });
});

describe("quantity settings commands", () => {
  it("clamps project defaults and reports a no-op", () => {
    const project = makeProject();

    expect(setQuantityDefaults(project, { wastePercent: 150, roundingStep: -5 })).toBe(true);
    expect(project.settings.quantity.wastePercent).toBe(100);
    expect(project.settings.quantity.roundingStep).toBe(0);
    expect(setQuantityDefaults(project, { wastePercent: 100, roundingStep: 0 })).toBe(false);
    expect(setQuantityDefaults(project, { wastePercent: Number.NaN })).toBe(false);
    expect(project.settings.quantity.wastePercent).toBe(100);
  });

  it("clamps, clears and validates a category override", () => {
    const project = makeProject();
    const id = project.categories[0].id;

    expect(setCategoryQuantityOverride(project, id, "wastePercent", 150)).toBe(true);
    expect(project.categories[0].wastePercent).toBe(100);
    expect(setCategoryQuantityOverride(project, id, "wastePercent", 100)).toBe(false);
    expect(setCategoryQuantityOverride(project, id, "roundingStep", -2)).toBe(true);
    expect(project.categories[0].roundingStep).toBe(0);
    expect(setCategoryQuantityOverride(project, id, "wastePercent", null)).toBe(true);
    expect(project.categories[0].wastePercent).toBeUndefined();
    expect(setCategoryQuantityOverride(project, "missing", "wastePercent", 5)).toBe(false);
    expect(setCategoryQuantityOverride(project, id, "wastePercent", Number.NaN)).toBe(false);
  });

  it("adds one undo step for a changed facade edit and none for a no-op", () => {
    const store = new Store();
    store.setProject(makeProject(), null);
    const categoryId = store.project!.categories[0].id;
    const before = store.revision;

    expect(store.setQuantityDefaults({ wastePercent: 0 })).toBe(true);
    expect(store.setCategoryQuantityOverride(categoryId, "wastePercent", 25)).toBe(true);
    expect(store.revision).toBe(before + 1);
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.categories[0].wastePercent).toBeUndefined();
    expect(store.canUndo).toBe(false);
  });
});
