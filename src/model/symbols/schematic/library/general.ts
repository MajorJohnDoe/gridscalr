import type { SymbolDefinition } from "../../types";
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
import { roundedRectPathData } from "../../../symbolPaths";

/**
 * general symbols, split out of the schematic library by category.
 */

export const GENERAL_SYMBOLS: SymbolDefinition[] = [
  schematicSymbol({
    id: "schematic.connection-dot",
    category: "general",
    keywords: ["anslutningsprick", "connection dot", "prick", "anslutning", "dot"],
    tagPrefix: "DOT",
    ports: [{ id: "connection", x: 32, y: 32, direction: "both" }],
    defaultSize: 10,
    shapes: [fill(smallCircle(32, 32, 5))],
  }),
  schematicSymbol({
    id: "schematic.arrow",
    category: "general",
    keywords: ["pil", "arrow", "riktning", "flöde", "pil"],
    tagPrefix: "PIL",
    ports: [
      { id: "start", x: 8, y: 32, direction: "in" },
      { id: "end", x: 56, y: 32, direction: "out" },
    ],
    shapes: [stroke(linePath(8, 32, 48, 32)), fill(polyPath([44, 24, 56, 32, 44, 40], true))],
  }),
  schematicSymbol({
    id: "schematic.reference",
    category: "general",
    keywords: ["hänvisning", "reference", "referens", "länk", "ref"],
    tagPrefix: "REF",
    ports: [{ id: "link", x: 62, y: 32, direction: "out" }],
    shapes: [
      stroke(rectPath(8, 18, 40, 28)),
      stroke(joinPaths(linePath(18, 38, 42, 22), polyPath([34, 22, 44, 21, 42, 31], true))),
      stroke(joinPaths(linePath(48, 34, 62, 34))),
    ],
  }),
  schematicSymbol({
    id: "schematic.tag-holder",
    category: "general",
    keywords: ["beteckningshållare", "tag holder", "beteckning", "text", "bet"],
    tagPrefix: "BET",
    ports: [
      { id: "in", x: 2, y: 32, direction: "in" },
      { id: "out", x: 62, y: 32, direction: "out" },
    ],
    shapes: [
      stroke(roundedRectPathData(10, 22, 44, 20, 5)),
      stroke(
        joinPaths(linePath(2, 32, 10, 32), linePath(54, 32, 62, 32), linePath(20, 32, 44, 32)),
      ),
    ],
  }),
];
