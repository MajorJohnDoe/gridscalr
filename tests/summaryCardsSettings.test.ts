// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderSummaryPanel } from "../src/features/schedules";
import type { SummaryPanelHost } from "../src/features/schedules";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { displaySection } from "../src/ui/settings/display";
import { withTestPageIds } from "./helpers/pages";

function cardCheckbox(root: HTMLElement, label: string): HTMLInputElement {
  const row = [...root.querySelectorAll<HTMLLabelElement>("label.check-row")].find((entry) =>
    entry.textContent?.includes(label),
  );
  const input = row?.querySelector<HTMLInputElement>('input[type="checkbox"]');
  if (!input) throw new Error(`missing ${label} checkbox`);
  return input;
}

function paintSummary(container: HTMLElement): void {
  const host: SummaryPanelHost = {
    navigateToItem: () => undefined,
    goToPage: () => undefined,
    openSpaces: () => undefined,
    refresh: () => undefined,
  };
  container.replaceChildren(renderSummaryPanel(host));
}

afterEach(() => {
  document.querySelectorAll(".modal-backdrop").forEach((node) => node.remove());
  document.body.replaceChildren();
  store.closeProject();
});

describe("summary card settings", () => {
  it("hides and restores a card as one undo step", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    store.setProject(project, null);
    const summary = document.createElement("div");
    document.body.append(summary);
    paintSummary(summary);
    expect(summary.querySelector(".schedules-card-doors")).not.toBeNull();

    const section = displaySection();
    document.body.append(section);
    // Every change is its own history step, so the editor is not a live preview
    // and the checkbox state is the stored setting.
    const undoSteps = store.canUndo ? 1 : 0;
    const doors = cardCheckbox(section, "Doors");
    expect(doors.checked).toBe(true);
    doors.checked = false;
    doors.dispatchEvent(new Event("change"));

    expect(store.project!.settings.summary.cards.find((card) => card.id === "doors")!.visible).toBe(
      false,
    );
    paintSummary(summary);
    expect(summary.querySelector(".schedules-card-doors")).toBeNull();
    expect(store.canUndo).toBe(true);

    store.undo();
    expect(store.project!.settings.summary.cards.find((card) => card.id === "doors")!.visible).toBe(
      true,
    );
    paintSummary(summary);
    expect(summary.querySelector(".schedules-card-doors")).not.toBeNull();
    expect(store.canUndo).toBe(undoSteps > 0);
  });

  it("restores a hidden card from the settings editor", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    project.settings.summary.cards = project.settings.summary.cards.map((card) =>
      card.id === "area" ? { ...card, visible: false } : card,
    );
    store.setProject(project, null);

    const section = displaySection();
    document.body.append(section);
    const area = cardCheckbox(section, "Area");
    expect(area.checked).toBe(false);
    area.checked = true;
    area.dispatchEvent(new Event("change"));
    expect(store.project!.settings.summary.cards.find((card) => card.id === "area")!.visible).toBe(
      true,
    );
  });
});
