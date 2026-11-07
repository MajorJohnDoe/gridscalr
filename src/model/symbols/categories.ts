import { translate } from "../../i18n";
import type {
  InspectionStatus,
  SchematicSymbolCategory,
  SignSymbolCategory,
  SymbolCategory,
} from "../types";

/** Facility-sign categories, in library order. */
export const SIGN_CATEGORIES: SignSymbolCategory[] = [
  "fire",
  "egress",
  "hvac",
  "electrical",
  "building",
  "waste",
];

/** Schematic-equipment categories, in library and catalogue order. */
export const SCHEMATIC_CATEGORIES: SchematicSymbolCategory[] = [
  "instrument",
  "valve",
  "pump",
  "exchanger",
  "ventilation",
  "heating",
  "district-heating",
  "cooling",
  "domestic-water",
  "control",
  "general",
];

/** Kept as the sign list for callers that only group facility signs. */
export const SYMBOL_CATEGORIES: SymbolCategory[] = [...SIGN_CATEGORIES];

export const ALL_SYMBOL_CATEGORIES: SymbolCategory[] = [
  ...SIGN_CATEGORIES,
  ...SCHEMATIC_CATEGORIES,
];

export const SYMBOL_CATEGORY_LABELS: Record<SymbolCategory, string> = {
  fire: translate("en", "symbolCategory.fire"),
  egress: translate("en", "symbolCategory.egress"),
  hvac: translate("en", "symbolCategory.hvac"),
  electrical: translate("en", "symbolCategory.electrical"),
  building: translate("en", "symbolCategory.building"),
  waste: translate("en", "symbolCategory.waste"),
  instrument: translate("en", "symbolCategory.instrument"),
  valve: translate("en", "symbolCategory.valve"),
  pump: translate("en", "symbolCategory.pump"),
  exchanger: translate("en", "symbolCategory.exchanger"),
  ventilation: translate("en", "symbolCategory.ventilation"),
  heating: translate("en", "symbolCategory.heating"),
  "district-heating": translate("en", "symbolCategory.district-heating"),
  cooling: translate("en", "symbolCategory.cooling"),
  "domestic-water": translate("en", "symbolCategory.domestic-water"),
  control: translate("en", "symbolCategory.control"),
  general: translate("en", "symbolCategory.general"),
};

export const SYMBOL_CATEGORY_COLORS: Record<SymbolCategory, string> = {
  fire: "#d3202a",
  egress: "#009b48",
  hvac: "#005eb8",
  electrical: "#f2a900",
  building: "#6b4fa0",
  waste: "#6e7b3a",
  instrument: "#8a4fbf",
  valve: "#c0392b",
  pump: "#1f6fb2",
  exchanger: "#2a8c82",
  ventilation: "#2d7dd2",
  heating: "#d97706",
  "district-heating": "#b0248c",
  cooling: "#0891b2",
  "domestic-water": "#15803d",
  control: "#475569",
  general: "#334155",
};

export const INSPECTION_STATUSES: InspectionStatus[] = [
  "approved",
  "not-approved",
  "action-required",
  "missing",
];

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  approved: translate("en", "inspectionStatus.approved"),
  "not-approved": translate("en", "inspectionStatus.not-approved"),
  "action-required": translate("en", "inspectionStatus.action-required"),
  missing: translate("en", "inspectionStatus.missing"),
};

export const INSPECTION_STATUS_COLORS: Record<InspectionStatus, string> = {
  approved: "#2fa573",
  "not-approved": "#d64545",
  "action-required": "#c08a12",
  missing: "#7a888e",
};
