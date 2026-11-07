import type { SymbolDefinition } from "../../../../model/symbols";
import { FIRST_VENTILATION_SYMBOLS } from "../firstBatch";
import { REFERENCE_SYMBOLS } from "../reference";
import { INSTRUMENT_SYMBOLS } from "./instrument";
import { VALVE_SYMBOLS } from "./valve";
import { PUMP_SYMBOLS } from "./pump";
import { EXCHANGER_SYMBOLS } from "./exchanger";
import { VENTILATION_SYMBOLS } from "./ventilation";
import { HEATING_SYMBOLS } from "./heating";
import { DISTRICT_HEATING_SYMBOLS } from "./districtHeating";
import { COOLING_SYMBOLS } from "./cooling";
import { DOMESTIC_WATER_SYMBOLS } from "./domesticWater";
import { CONTROL_SYMBOLS } from "./control";
import { GENERAL_SYMBOLS } from "./general";

/**
 * The full schematic equipment library. The first ten ventilation symbols were
 * reviewed in issue #93 and are kept unchanged; everything below extends them
 * with the categories from the operation-card plan.
 */
export const SCHEMATIC_LIBRARY_SYMBOLS: SymbolDefinition[] = [
  ...INSTRUMENT_SYMBOLS,
  ...VALVE_SYMBOLS,
  ...PUMP_SYMBOLS,
  ...EXCHANGER_SYMBOLS,
  ...VENTILATION_SYMBOLS,
  ...HEATING_SYMBOLS,
  ...DISTRICT_HEATING_SYMBOLS,
  ...COOLING_SYMBOLS,
  ...DOMESTIC_WATER_SYMBOLS,
  ...CONTROL_SYMBOLS,
  ...GENERAL_SYMBOLS,
];

export const SCHEMATIC_SYMBOLS: SymbolDefinition[] = [
  ...FIRST_VENTILATION_SYMBOLS,
  ...SCHEMATIC_LIBRARY_SYMBOLS,
  ...REFERENCE_SYMBOLS,
];
