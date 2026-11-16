import { el } from "../../../ui/dom";
import { t, type MessageKey } from "../../../i18n";
import type { SummaryCardId } from "../../../model/types";
import type { SummaryCardValue } from "../summary";

/**
 * The four KPI cards. Every number is real text, the label names the card and
 * a missing role reports zero with a Configure action instead of a guess.
 */

function cardLabel(id: SummaryCardId): string {
  return t(`schedules.card.${id}` as MessageKey);
}

function noteFor(card: SummaryCardValue): string[] {
  const notes: string[] = [];
  if (card.roleMissing) {
    notes.push(
      card.id === "doors" ? t("schedules.card.missingCountRole") : t("schedules.card.missingRole"),
    );
  }
  if (card.id === "area" && card.missingCount > 0) {
    notes.push(t("schedules.card.missingAreas", { count: card.missingCount }));
  }
  if (card.id === "rooms" && card.empty) notes.push(t("schedules.card.noRooms"));
  if (card.id === "wallLength" && card.uncalibratedCount > 0) {
    notes.push(t("schedules.card.uncalibrated", { count: card.uncalibratedCount }));
  }
  return notes;
}

export function summaryCardsElement(
  cards: readonly SummaryCardValue[],
  onConfigure: (id: SummaryCardId) => void,
): HTMLElement {
  const grid = el("div", "schedules-cards");
  for (const card of cards) {
    if (!card.visible) continue;
    const article = el("article", `schedules-card schedules-card-${card.id}`);
    const labelId = `schedules-card-${card.id}`;
    article.setAttribute("aria-labelledby", labelId);
    const label = el("span", "schedules-card-label", cardLabel(card.id));
    label.id = labelId;
    const value = el("span", "schedules-card-value", card.text);
    const unit = el("span", "schedules-card-unit", card.unit);
    const line = el("div", "schedules-card-value-row");
    line.append(value, unit);
    article.append(label, line);
    for (const note of noteFor(card)) {
      article.append(el("p", "schedules-card-note", note));
    }
    if (card.roleMissing || card.empty || card.missingCount > 0 || card.uncalibratedCount > 0) {
      const configure = el("button", "btn btn-small btn-ghost schedules-card-configure");
      configure.type = "button";
      configure.textContent = t("schedules.card.configure");
      configure.setAttribute(
        "aria-label",
        t("schedules.card.configureAria", { card: cardLabel(card.id) }),
      );
      configure.addEventListener("click", () => onConfigure(card.id));
      article.append(configure);
    }
    grid.append(article);
  }
  return grid;
}
