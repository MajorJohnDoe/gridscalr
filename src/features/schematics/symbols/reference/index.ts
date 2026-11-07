import type { SymbolDefinition } from "../../../../model/symbols";
import { INSTRUMENT_SYMBOLS } from "./instrument";
import { VALVE_SYMBOLS } from "./valve";
import { CONTROL_SYMBOLS } from "./control";
import { VENTILATION_SYMBOLS } from "./ventilation";
import { HEATING_SYMBOLS } from "./heating";
import { EXCHANGER_SYMBOLS } from "./exchanger";
import { GENERAL_SYMBOLS } from "./general";

/**
 * Additional symbols redrawn as original stroke artwork from the conventions
 * shown in the operation-card reference pages. They follow common SS/ISO
 * schematic practice but are not certified reproductions.
 */
export const REFERENCE_SYMBOLS: SymbolDefinition[] = [
  ...INSTRUMENT_SYMBOLS,
  ...VALVE_SYMBOLS,
  ...CONTROL_SYMBOLS,
  ...VENTILATION_SYMBOLS,
  ...HEATING_SYMBOLS,
  ...EXCHANGER_SYMBOLS,
  ...GENERAL_SYMBOLS,
];
