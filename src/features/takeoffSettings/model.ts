import type {
  Category,
  CountTypeDef,
  FieldDefinition,
  Project,
  QuantitySettings,
  SummaryCardId,
} from "../../model/types";

/**
 * Pure rules for the Takeoff settings hub. The hub only presents existing
 * project data: it derives the card source lists, the field applies-to labels
 * and the effective waste and rounding from the same model the canvas, the
 * takeoff tables and the order dialog already use.
 */

export type TakeoffSettingsTab = "objects" | "fields" | "tables" | "cards";

export interface TakeoffSettingsTarget {
  tab: TakeoffSettingsTab;
  /** Row to focus when the hub opens from a card or the inspector. */
  focusId?: string;
}

export const TAKEOFF_SETTINGS_TABS: readonly TakeoffSettingsTab[] = [
  "objects",
  "fields",
  "tables",
  "cards",
];

export function isTakeoffSettingsTab(value: unknown): value is TakeoffSettingsTab {
  return typeof value === "string" && (TAKEOFF_SETTINGS_TABS as readonly string[]).includes(value);
}

/** The four KPI cards, in dock order. Roles without a card are not listed. */
export const TAKEOFF_CARD_IDS: readonly SummaryCardId[] = ["rooms", "area", "wallLength", "doors"];

export interface CardFeed {
  categories: Category[];
  countTypes: CountTypeDef[];
}

/**
 * What a card counts. Walls read the categories whose stored role is `wall`;
 * Doors read the count types whose stored role is `door`. Rooms and Area read
 * the space register, so they carry no object list.
 */
export function cardFeed(
  project: Pick<Project, "categories" | "countTypes">,
  cardId: SummaryCardId,
): CardFeed {
  if (cardId === "wallLength") {
    return {
      categories: project.categories.filter((category) => category.summaryRole === "wall"),
      countTypes: [],
    };
  }
  if (cardId === "doors") {
    return {
      categories: [],
      countTypes: project.countTypes.filter((type) => type.summaryRole === "door"),
    };
  }
  return { categories: [], countTypes: [] };
}

/** True when the card carries an editable Fed by list rather than a space note. */
export function cardHasObjectFeed(cardId: SummaryCardId): boolean {
  return cardId === "wallLength" || cardId === "doors";
}

/** Field labels that explicitly apply to one category, in saved order. */
export function categoryFieldLabels(
  project: Pick<Project, "fieldDefinitions">,
  categoryId: string,
): string[] {
  return fieldLabels(project, (field) => field.appliesTo?.categoryIds?.includes(categoryId));
}

/** Field labels that explicitly apply to one count type, in saved order. */
export function countTypeFieldLabels(
  project: Pick<Project, "fieldDefinitions">,
  countTypeId: string,
): string[] {
  return fieldLabels(project, (field) => field.appliesTo?.countTypes?.includes(countTypeId));
}

function fieldLabels(
  project: Pick<Project, "fieldDefinitions">,
  predicate: (field: FieldDefinition) => boolean | undefined,
): string[] {
  return project.fieldDefinitions
    .filter((field) => predicate(field) === true)
    .sort((left, right) => left.order - right.order)
    .map((field) => field.label);
}

/**
 * Shows or hides one KPI card by its stable id. Other cards keep their own
 * visibility, and an unchanged value is reported as no change.
 */
export function setSummaryCardVisible(
  project: Pick<Project, "settings">,
  id: SummaryCardId,
  visible: boolean,
): boolean {
  const target = project.settings.summary.cards.find((entry) => entry.id === id);
  if (!target || target.visible === visible) return false;
  target.visible = visible;
  return true;
}

/** A category override falls back to the project default when it is unset. */
export function effectiveWaste(category: Category, quantity: QuantitySettings): number {
  return category.wastePercent ?? quantity.wastePercent;
}

export function effectiveRounding(category: Category, quantity: QuantitySettings): number {
  return category.roundingStep ?? quantity.roundingStep;
}
