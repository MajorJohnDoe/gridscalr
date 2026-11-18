// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { renderSummaryPanel } from "../src/features/schedules";
import type { SummaryPanelHost } from "../src/features/schedules";
import { openTakeoffSettingsDialog } from "../src/features/takeoffSettings";
import { createProject, defaultDocument } from "../src/model/layers";
import { store } from "../src/state/store";
import { closeActiveModal } from "../src/ui/dialogs";
import { withTestPageIds } from "./helpers/pages";

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

function cardToggle(card: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    `.modal [aria-label="Show the ${card} card"]`,
  );
  if (!input) throw new Error(`missing ${card} visibility switch`);
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
  closeActiveModal();
  document.querySelectorAll(".dialog-layer").forEach((node) => node.remove());
  document.body.replaceChildren();
  store.closeProject();
});

describe("takeoff card settings", () => {
  it("hides and restores a card as one undo step", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    store.setProject(project, null);
    const summary = document.createElement("div");
    document.body.append(summary);
    paintSummary(summary);
    expect(summary.querySelector(".schedules-card-doors")).not.toBeNull();

    void openTakeoffSettingsDialog({ tab: "cards" });
    const doors = cardToggle("Doors");
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
  });

  it("restores a hidden card from the Takeoff settings hub", () => {
    const project = withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
    project.settings.summary.cards = project.settings.summary.cards.map((card) =>
      card.id === "area" ? { ...card, visible: false } : card,
    );
    store.setProject(project, null);

    void openTakeoffSettingsDialog({ tab: "cards" });
    const area = cardToggle("Area");
    expect(area.checked).toBe(false);
    area.checked = true;
    area.dispatchEvent(new Event("change"));
    expect(store.project!.settings.summary.cards.find((card) => card.id === "area")!.visible).toBe(
      true,
    );
  });
});
