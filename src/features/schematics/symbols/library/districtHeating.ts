import type { SymbolDefinition } from "../../../../model/symbols";
import {
  stroke,
  fill,
  joinPaths,
  linePath,
  polyPath,
  rectPath,
  smallCircle,
  schematicSymbol,
} from "../primitives";
import { roundedRectPathData } from "../../../../model/symbolPaths";
import { INLINE_PORTS, meterBody } from "./parts";

/**
 * district heating symbols, split out of the schematic library by category.
 */

/** A district-heating meter panel with a bezelled display and two indicator dots. */
function meterPanelBody(): string {
  return joinPaths(
    roundedRectPathData(10, 8, 44, 48, 3),
    roundedRectPathData(15, 13, 34, 17, 3),
    roundedRectPathData(18, 16, 28, 11, 1.5),
  );
}

const METER_PANEL_DOTS = joinPaths(smallCircle(41, 38, 1.5), smallCircle(47, 38, 1.5));

export const DISTRICT_HEATING_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.substation",
    category: "district-heating",
    keywords: ["undercentral", "substation", "fjärrvärme", "växlare", "uc"],
    tagPrefix: "UC",
    ports: [
      { id: "primaryIn", x: 2, y: 20, direction: "in" },
      { id: "primaryOut", x: 2, y: 46, direction: "out" },
      { id: "secondaryIn", x: 62, y: 20, direction: "in" },
      { id: "secondaryOut", x: 62, y: 46, direction: "out" },
    ],
    shapes: [
      stroke(rectPath(8, 8, 48, 48)),
      stroke(linePath(32, 8, 32, 56)),
      stroke(joinPaths(smallCircle(22, 24, 6), smallCircle(22, 40, 6))),
      stroke(joinPaths(smallCircle(42, 24, 6), smallCircle(42, 40, 6))),
      stroke(
        joinPaths(
          linePath(2, 20, 16, 20),
          linePath(28, 24, 36, 24),
          linePath(48, 40, 62, 40),
          linePath(2, 46, 16, 46),
          linePath(48, 24, 62, 24),
        ),
      ),
    ],
  }),
  schematicSymbol({
    id: "schematic.district-energy-meter",
    category: "district-heating",
    keywords: ["fjärrvärmemätare", "district heating meter", "energimätare", "fjärrvärme", "fem"],
    tagPrefix: "FEM",
    ports: INLINE_PORTS(),
    shapes: [
      stroke(meterBody()),
      stroke(joinPaths(linePath(2, 32, 12, 32), linePath(52, 32, 62, 32))),
      stroke(polyPath([26, 34, 31, 26, 30, 32, 36, 28, 31, 40])),
    ],
  }),
  schematicSymbol({
    id: "schematic.district-energy-meter-panel",
    category: "district-heating",
    keywords: [
      "fjärrvärmemätare",
      "panel",
      "display",
      "fjärrvärme",
      "mätare",
      "district heating meter",
      "meter panel",
    ],
    tagPrefix: "FEM",
    ports: [],
    shapes: [stroke(meterPanelBody()), fill(METER_PANEL_DOTS)],
  }),

  // --- Cooling -----------------------------------------------------------
];
