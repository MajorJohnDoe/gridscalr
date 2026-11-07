import type { SymbolArt } from "../types";
import { filled, stroked } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the fire category. */
export const FIRE_SIGN_ART: Record<string, SymbolArt> = {
  "fire.extinguisher": {
    shapes: [
      filled(
        [roundedRectPathData(22, 22, 20, 30, 5), roundedRectPathData(27, 28, 10, 5, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(27, 17, 10, 8, 2)),
      filled(roundedRectPathData(25, 13, 14, 6, 2)),
      filled(roundedRectPathData(20, 7, 28, 6, 3)),
      filled(roundedRectPathData(31, 12, 6, 7, 2)),
      stroked("M 40 16 C 50 17 54 24 54 33 C 54 38 53 41 52 44", 4.2),
      filled(roundedRectPathData(47, 42, 9, 5, 2.5)),
      filled("M 48 47 H 55 L 51.5 52 Z"),
      filled(roundedRectPathData(20, 50, 24, 5, 2.5)),
    ],
  },
  "fire.hose": {
    shapes: [
      filled([circlePathData(31, 30, 18), circlePathData(31, 30, 12)].join(" "), "evenodd"),
      stroked("M 31 30 L 45 20", 3),
      filled(circlePathData(31, 30, 5)),
      filled(circlePathData(31, 30, 2)),
      stroked("M 45 24 L 50 19", 4),
      filled(roundedRectPathData(47, 15, 4, 4, 1.5)),
      filled(roundedRectPathData(28, 44, 6, 10, 1.5)),
    ],
  },
  "fire.blanket": {
    shapes: [
      filled(
        [roundedRectPathData(18, 8, 26, 40, 4), roundedRectPathData(23, 24, 16, 7, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(26, 46, 10, 11, 2)),
    ],
  },
  "fire.call-point": {
    shapes: [
      filled(
        [
          roundedRectPathData(12, 11, 36, 38, 5),
          roundedRectPathData(17, 16, 26, 28, 3),
          circlePathData(30, 30, 6),
          roundedRectPathData(28, 20, 4, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "fire.smoke-detector": {
    shapes: [
      filled([circlePathData(31, 36, 11), circlePathData(31, 36, 4)].join(" "), "evenodd"),
      stroked("M 16 26 Q 20 22 24 26", 3),
      stroked("M 28 19 Q 32 15 36 19", 3),
      stroked("M 40 12 Q 44 8 48 12", 3),
    ],
  },
  "fire.door": {
    shapes: [
      filled(
        [
          roundedRectPathData(14, 4, 36, 52, 3),
          "M 30 14 C 25 21 24 28 28 33 C 24 32 24 37 27 41 C 29 45 34 47 37 43 C 40 39 39 33 36 29 C 37 34 34 36 33 33 C 35 27 33 20 30 14 Z",
          circlePathData(43, 32, 2.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "fire.heat-detector": {
    shapes: [
      filled(roundedRectPathData(27, 8, 6, 30, 3)),
      filled(circlePathData(30, 42, 7)),
      filled(roundedRectPathData(36, 16, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 23, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 30, 5, 3, 1.5)),
    ],
  },
  "fire.smoke-vent": {
    shapes: [
      filled(
        [roundedRectPathData(8, 40, 44, 12, 3), roundedRectPathData(14, 44, 32, 4, 2)].join(" "),
        "evenodd",
      ),
      filled("M 13 38 H 19 V 24 H 24 L 16 14 L 8 24 H 13 Z"),
      filled("M 27 38 H 33 V 24 H 38 L 30 14 L 22 24 H 27 Z"),
      filled("M 41 38 H 47 V 24 H 52 L 44 14 L 36 24 H 41 Z"),
    ],
  },
};
