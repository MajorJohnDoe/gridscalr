import type { SymbolArt } from "../types";
import { filled, stroked } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the building category. */
export const BUILDING_SIGN_ART: Record<string, SymbolArt> = {
  "building.window": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 10, 42, 40, 3),
          roundedRectPathData(13, 15, 14, 30, 2),
          roundedRectPathData(29, 15, 14, 30, 2),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(5, 50, 48, 6, 2)),
    ],
  },
  "building.door": {
    shapes: [
      filled(roundedRectPathData(14, 4, 36, 50, 3)),
      filled(
        [
          roundedRectPathData(14, 4, 36, 50, 3),
          roundedRectPathData(18, 10, 4, 38, 2),
          circlePathData(43, 32, 2.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(10, 54, 44, 4, 2)),
    ],
  },
  "building.damage": {
    shapes: [
      filled(
        [
          "M 30 6 Q 34 6 37 11 L 51 44 Q 54 49 48 52 L 12 52 Q 6 49 9 44 L 23 11 Q 26 6 30 6 Z",
          roundedRectPathData(27, 19, 6, 18, 3),
          circlePathData(30, 45, 3.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "building.elevator": {
    shapes: [
      filled(
        [roundedRectPathData(10, 4, 40, 52, 3), roundedRectPathData(16, 10, 28, 40, 2)].join(" "),
        "evenodd",
      ),
      filled("M 30 16 L 22 26 H 27 V 30 H 33 V 26 H 38 Z"),
      filled("M 30 44 L 22 34 H 27 V 30 H 33 V 34 H 38 Z"),
    ],
  },
  "building.stair-lift": {
    shapes: [
      stroked("M 6 54 H 16 V 46 H 26 V 38 H 36 V 30 H 46 V 22 H 56", 5),
      filled(roundedRectPathData(24, 26, 14, 5, 2)),
      filled(roundedRectPathData(24, 16, 5, 14, 2)),
      filled(roundedRectPathData(30, 31, 5, 7, 2)),
      filled(circlePathData(35, 38, 2.5)),
    ],
  },
  "building.dock": {
    shapes: [
      filled(roundedRectPathData(12, 18, 28, 14, 2)),
      filled(roundedRectPathData(40, 22, 10, 10, 2)),
      filled([circlePathData(20, 34, 4), circlePathData(20, 34, 1.5)].join(" "), "evenodd"),
      filled([circlePathData(42, 34, 4), circlePathData(42, 34, 1.5)].join(" "), "evenodd"),
      filled(roundedRectPathData(6, 40, 48, 6, 2)),
      filled(roundedRectPathData(10, 46, 4, 6, 1.5)),
      filled(roundedRectPathData(46, 46, 4, 6, 1.5)),
    ],
  },
};
