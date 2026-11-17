import { countTypeLabel } from "../../../model/countTypes";
import { setCategorySummaryRole, setCountTypeSummaryRole } from "../../schedules";
import type { SummaryCardId } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el } from "../../../ui/dom";
import { t, type MessageKey } from "../../../i18n";
import { TAKEOFF_CARD_IDS, cardFeed, cardHasObjectFeed } from "../model";

/**
 * Cards tab. Each of the four KPI cards shows its visibility switch and, for
 * Walls and Doors, the list of objects that feed it. Rooms and Area explain
 * that they read the space register. A stored role without a card stays in the
 * project and is never listed here.
 */

export function cardsSection(focusId?: string): HTMLElement {
  const root = el("section", "settings-section takeoff-cards");
  root.append(el("h3", "", t("takeoffSettings.cards.title")));
  root.append(el("p", "settings-note", t("takeoffSettings.cards.intro")));
  const list = el("div", "takeoff-card-list");
  root.append(list);

  const render = () => {
    clear(list);
    for (const id of TAKEOFF_CARD_IDS) list.append(cardBlock(id, render));
    list.append(el("p", "settings-note takeoff-cards-later", t("takeoffSettings.cards.moreLater")));
  };

  render();
  if (focusId) {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const card = list.querySelector<HTMLElement>(`[data-card-id="${focusId}"]`);
        card?.focus();
        card?.scrollIntoView?.({ block: "nearest" });
      }),
    );
  }
  return root;
}

function cardBlock(id: SummaryCardId, onChanged: () => void): HTMLElement {
  const project = store.project!;
  const card = el("article", "takeoff-card");
  card.dataset.cardId = id;
  card.tabIndex = -1;
  const headingId = `takeoff-card-${id}`;
  card.setAttribute("aria-labelledby", headingId);

  const head = el("div", "takeoff-card-head");
  const cardLabel = t(`schedules.card.${id}` as MessageKey);
  const title = el("h4", "", cardLabel);
  title.id = headingId;
  const toggle = el("label", "check-row takeoff-card-toggle");
  const input = el("input");
  input.type = "checkbox";
  input.checked =
    project.settings.summary.cards.find((entry) => entry.id === id)?.visible !== false;
  input.setAttribute("aria-label", t("takeoffSettings.cards.visibleAria", { card: cardLabel }));
  input.addEventListener("change", () => {
    store.mutate((current) => {
      const target = current.settings.summary.cards.find((entry) => entry.id === id);
      if (target) target.visible = input.checked;
    }, "change");
    onChanged();
  });
  toggle.append(input, el("span", "", t("takeoffSettings.cards.visible")));
  head.append(title, toggle);
  card.append(head);

  card.append(el("p", "settings-note", t(`takeoffSettings.cards.${id}Note` as MessageKey)));

  if (!cardHasObjectFeed(id)) {
    card.append(el("p", "takeoff-card-feed-note", t("takeoffSettings.cards.spaceNote")));
    return card;
  }

  const feed = cardFeed(project, id);
  const isWalls = id === "wallLength";
  const rows: { id: string; name: string }[] = isWalls
    ? project.categories.map((entry) => ({ id: entry.id, name: entry.name }))
    : project.countTypes.map((entry) => ({
        id: entry.id,
        name: countTypeLabel(project, entry.id),
      }));
  const fedIds = new Set(
    isWalls ? feed.categories.map((entry) => entry.id) : feed.countTypes.map((entry) => entry.id),
  );

  const block = el("div", "takeoff-card-feed");
  block.append(el("h5", "", t("takeoffSettings.cards.fedBy")));
  if (!fedIds.size) {
    block.append(
      el(
        "p",
        "takeoff-card-feed-note",
        t(isWalls ? "takeoffSettings.cards.emptyWalls" : "takeoffSettings.cards.emptyDoors"),
      ),
    );
  }
  const list = el("ul", "takeoff-card-feed-list");
  for (const object of rows) {
    const row = el("li", "takeoff-card-feed-row");
    const label = el("label", "check-row");
    const checkbox = el("input");
    checkbox.type = "checkbox";
    checkbox.checked = fedIds.has(object.id);
    checkbox.setAttribute(
      "aria-label",
      t(isWalls ? "takeoffSettings.cards.feedWallsAria" : "takeoffSettings.cards.feedDoorsAria", {
        name: object.name,
      }),
    );
    checkbox.addEventListener("change", () => {
      store.mutate((current) => {
        if (isWalls) {
          setCategorySummaryRole(current, object.id, checkbox.checked ? "wall" : undefined);
        } else {
          setCountTypeSummaryRole(current, object.id, checkbox.checked ? "door" : undefined);
        }
      }, "change");
      onChanged();
    });
    label.append(checkbox, el("span", "", object.name));
    row.append(label);
    list.append(row);
  }
  block.append(list);
  card.append(block);
  return card;
}
