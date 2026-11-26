import { describe, expect, it, vi } from "vitest";
import { createProject, defaultDocument } from "../src/model/layers";
import { DEFAULT_LINE_TYPE_ID, defaultLineTypes } from "../src/model/lineTypes";
import { DEFAULT_SYMBOL_ID } from "../src/model/symbols";
import { SessionStore, type SessionStoreHost } from "../src/state/sessionStore";
import { withTestPageIds } from "./helpers/pages";

function makeProject(pageCount = 3) {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", pageCount)));
}

function makeSession(
  options: { readOnly?: boolean; project?: ReturnType<typeof makeProject> } = {},
) {
  const notify = vi.fn();
  let project = options.project ?? makeProject();
  let readOnly = options.readOnly ?? false;
  const host: SessionStoreHost = {
    notify,
    project: () => project,
    readOnly: () => readOnly,
  };
  const session = new SessionStore(host);
  return {
    session,
    notify,
    setProject(next: ReturnType<typeof makeProject>) {
      project = next;
    },
    setReadOnly(next: boolean) {
      readOnly = next;
    },
  };
}

const ref = (itemId: string, layerId = "layer-1") => ({ layerId, itemId });

describe("SessionStore reset", () => {
  it("applies the project-open UI reset without touching project data", () => {
    const project = makeProject();
    project.settings.stampPresets = ["REVIEWED"];
    const { session, notify } = makeSession({ project });
    session.ui.deltaText = "B";
    session.ui.zoom = 4;
    session.ui.style.color = "#000000";

    session.reset(project);

    expect(session.ui.page).toBe(1);
    expect(session.ui.activeTool).toBe("select");
    expect(session.ui.selection).toEqual([]);
    expect(session.ui.hover).toBeNull();
    expect(session.ui.cursor).toBeNull();
    expect(session.ui.leftTab).toBe("pages");
    expect(session.ui.stampText).toBe("REVIEWED");
    expect(session.ui.symbolId).toBe(DEFAULT_SYMBOL_ID);
    expect(session.ui.symbolStatus).toBeNull();
    expect(session.ui.measureCategoryId).toBeNull();
    expect(session.ui.measureRoom).toBe("");
    expect(session.ui.measureCountType).toBe("other");
    expect(session.ui.measureAreaMode).toBe("add");
    expect(session.ui.measureAreaShape).toBe("polygon");
    // Reset is not closeProject: view-only and style defaults survive.
    expect(session.ui.deltaText).toBe("B");
    expect(session.ui.zoom).toBe(4);
    expect(session.ui.style.color).toBe("#000000");
    expect(notify).not.toHaveBeenCalled();
  });

  it("restores every default when the project closes", () => {
    const { session } = makeSession();
    session.ui.activeTool = "area";
    session.ui.page = 2;
    session.ui.deltaText = "C";
    session.ui.zoom = 3;

    session.resetDefaults();

    expect(session.ui.activeTool).toBe("select");
    expect(session.ui.page).toBe(1);
    expect(session.ui.deltaText).toBe("A");
    expect(session.ui.zoom).toBe(1);
    expect(session.ui.symbolId).toBe(DEFAULT_SYMBOL_ID);
    expect(session.ui.lineTypeId).toBe(DEFAULT_LINE_TYPE_ID);
  });

  it("keeps a valid line type and falls back to the first project line type", () => {
    const project = makeProject();
    const { session } = makeSession({ project });

    session.setLineType("extract");
    expect(session.ui.lineTypeId).toBe("extract");
    expect(session.ui.lineStyle).toEqual({
      color: project.lineTypes.find((entry) => entry.id === "extract")!.color,
      widthPt: 2,
      dashed: false,
    });

    session.reset(project);
    expect(session.ui.lineTypeId).toBe("extract");

    session.ui.lineTypeId = "missing";
    session.reset(project);
    expect(session.ui.lineTypeId).toBe(defaultLineTypes()[0].id);
    expect(session.ui.lineStyle.color).toBe(defaultLineTypes()[0].color);
  });
});

describe("SessionStore selection", () => {
  it("adds, toggles, tests and clears selection through one path", () => {
    const { session, notify } = makeSession();
    const first = ref("item-1");
    const second = ref("item-2");

    session.setSelection(first);
    expect(session.primarySelection).toEqual(first);
    expect(session.isSelected(second)).toBe(false);
    expect(notify).toHaveBeenLastCalledWith("selection");

    session.setSelectionMany([first, second, first]);
    expect(session.ui.selection).toEqual([first, second]);

    session.toggleSelection(first);
    expect(session.ui.selection).toEqual([second]);
    session.toggleSelection(first);
    expect(session.ui.selection).toEqual([second, first]);

    session.clearSelection();
    expect(session.ui.selection).toEqual([]);
    expect(session.primarySelection).toBeNull();
  });

  it("does not notify when the selection is unchanged", () => {
    const { session, notify } = makeSession();
    const first = ref("item-1");
    session.setSelectionMany([first]);
    notify.mockClear();

    session.setSelectionMany([first]);
    session.toggleSelection(ref("other"));

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith("selection");
  });
});

describe("SessionStore tools", () => {
  it("resolves editing tools to Select in a view-only session", () => {
    const { session, notify } = makeSession({ readOnly: true });
    session.ui.activeTool = "pan";
    session.setTool("area");

    expect(session.ui.activeTool).toBe("select");
    expect(notify).toHaveBeenLastCalledWith("tool");

    notify.mockClear();
    session.setTool("pan");
    expect(session.ui.activeTool).toBe("pan");
    expect(notify).toHaveBeenCalledWith("tool");
  });

  it("keeps an already armed inspection tool without another notification", () => {
    const { session, notify } = makeSession({ readOnly: true });
    session.setTool("select");

    expect(session.ui.activeTool).toBe("select");
    expect(notify).not.toHaveBeenCalled();
  });

  it("arms a symbol and opens the symbol library tab", () => {
    const { session } = makeSession();
    session.selectSymbol("schematic.valve");

    expect(session.ui.symbolId).toBe("schematic.valve");
    expect(session.ui.activeTool).toBe("symbol");
    expect(session.ui.leftTab).toBe("symbols");
  });

  it("clamps the visible page against the project page list", () => {
    const { session, notify } = makeSession({ project: makeProject(3) });
    session.setSelection(ref("item-1"));
    notify.mockClear();

    session.setPage(99);
    expect(session.ui.page).toBe(3);
    expect(session.ui.selection).toEqual([]);
    expect(notify).toHaveBeenLastCalledWith("page");

    session.setPage(-4);
    expect(session.ui.page).toBe(1);

    session.setPage(1);
    expect(notify).toHaveBeenCalledTimes(2);
  });

  it("does nothing without a project", () => {
    const { session, notify } = makeSession();
    const hostless = new SessionStore({
      notify,
      project: () => null,
      readOnly: () => false,
    });

    session.setView(2, 10, 20);
    expect(session.ui.zoom).toBe(2);
    expect(session.ui.panX).toBe(10);

    hostless.setPage(2);
    hostless.setTool("area");
    hostless.setLineType("extract");
    hostless.setMeasureCategory("missing");

    expect(hostless.ui.page).toBe(1);
    expect(hostless.ui.activeTool).toBe("area");
    expect(hostless.ui.lineTypeId).toBe(DEFAULT_LINE_TYPE_ID);
    expect(notify).toHaveBeenCalledTimes(2);
  });
});

describe("SessionStore defaults", () => {
  it("merges style and measure defaults and emits cursor for typing", () => {
    const { session, notify } = makeSession();
    const color = session.ui.style.color;

    session.setStyle({ strokeWidth: 3, dashed: true });
    expect(session.ui.style).toMatchObject({ color, strokeWidth: 3, dashed: true });
    expect(notify).toHaveBeenLastCalledWith("tool");

    session.setMeasureRoom("  Kitchen  ");
    expect(session.ui.measureRoom).toBe("  Kitchen  ");
    expect(notify).toHaveBeenLastCalledWith("cursor");

    session.setMeasureCountType("door");
    expect(session.ui.measureCountType).toBe("door");

    session.setMeasureCountQuantity(Number.NaN);
    expect(session.ui.measureCountQuantity).toBe(1);
    session.setMeasureCountQuantity(0);
    expect(session.ui.measureCountQuantity).toBe(1);
    session.setMeasureCountQuantity(1000000);
    expect(session.ui.measureCountQuantity).toBe(100000);

    session.setMeasureAreaMode("subtract");
    session.setMeasureAreaShape("rectangle");
    expect(session.ui.measureAreaMode).toBe("subtract");
    expect(session.ui.measureAreaShape).toBe("rectangle");

    session.setHover({ layerId: "layer-1", itemId: "item-1", vertexIndex: 0 });
    expect(notify).toHaveBeenLastCalledWith("cursor");
    session.setCursor({ x: 4, y: 5 });
    expect(session.ui.cursor).toEqual({ x: 4, y: 5 });
  });

  it("rejects an unknown measure category", () => {
    const project = makeProject();
    const { session, notify } = makeSession({ project });
    session.setMeasureCategory("missing");

    expect(session.ui.measureCategoryId).toBeNull();
    expect(notify).not.toHaveBeenCalled();

    session.setMeasureCategory(project.categories[0].id);
    expect(session.ui.measureCategoryId).toBe(project.categories[0].id);
    expect(notify).toHaveBeenCalledWith("cursor");
  });
});
