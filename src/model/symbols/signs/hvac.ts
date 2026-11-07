import type { SymbolArt } from "../types";
import { filled, stroked } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the hvac category. */
export const HVAC_SIGN_ART: Record<string, SymbolArt> = {
  "hvac.supply": {
    shapes: [
      filled(
        [roundedRectPathData(8, 10, 42, 40, 4), roundedRectPathData(16, 18, 26, 24, 3)].join(" "),
        "evenodd",
      ),
      filled("M 26 30 H 32 V 22 H 37 L 29 12 L 21 22 H 26 Z"),
      filled("M 26 30 H 32 V 38 H 37 L 29 48 L 21 38 H 26 Z"),
      filled("M 29 27 V 33 H 21 V 38 L 11 30 L 21 22 V 27 Z"),
      filled("M 29 27 V 33 H 37 V 38 L 47 30 L 37 22 V 27 Z"),
    ],
  },
  "hvac.extract": {
    shapes: [
      filled(
        [roundedRectPathData(8, 10, 42, 40, 4), roundedRectPathData(16, 18, 26, 24, 3)].join(" "),
        "evenodd",
      ),
      filled("M 26 12 H 32 V 22 H 37 L 29 30 L 21 22 H 26 Z"),
      filled("M 26 48 H 32 V 38 H 37 L 29 30 L 21 38 H 26 Z"),
      filled("M 11 27 V 33 H 21 V 38 L 29 30 L 21 22 V 27 Z"),
      filled("M 47 27 V 33 H 37 V 38 L 29 30 L 37 22 V 27 Z"),
    ],
  },
  "hvac.valve": {
    shapes: [
      filled("M 8 18 L 29 30 L 8 42 Z"),
      filled("M 50 18 L 29 30 L 50 42 Z"),
      filled(roundedRectPathData(26, 14, 6, 18, 2)),
      filled(roundedRectPathData(18, 8, 22, 6, 3)),
    ],
  },
  "hvac.radiator": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 20, 42, 24, 3),
          roundedRectPathData(14, 24, 4, 16, 1.5),
          roundedRectPathData(21, 24, 4, 16, 1.5),
          roundedRectPathData(28, 24, 4, 16, 1.5),
          roundedRectPathData(35, 24, 4, 16, 1.5),
          roundedRectPathData(42, 24, 4, 16, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(14, 44, 5, 5, 1.5)),
      filled(roundedRectPathData(39, 44, 5, 5, 1.5)),
    ],
  },
  "hvac.ahu": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 42, 28, 4), roundedRectPathData(13, 23, 32, 18, 3)].join(" "),
        "evenodd",
      ),
      filled(
        [
          circlePathData(21, 32, 6),
          circlePathData(21, 32, 1.8),
          circlePathData(37, 32, 6),
          circlePathData(37, 32, 1.8),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(3, 29, 6, 6, 2)),
      filled(roundedRectPathData(49, 29, 6, 6, 2)),
    ],
  },
  "hvac.pump": {
    shapes: [
      filled([circlePathData(27, 30, 14), "M 18 21 L 37 30 L 18 39 Z"].join(" "), "evenodd"),
      filled(roundedRectPathData(41, 27, 10, 6, 2)),
    ],
  },
  "hvac.water-meter": {
    shapes: [
      filled([circlePathData(28, 30, 16), circlePathData(28, 30, 9)].join(" "), "evenodd"),
      filled(circlePathData(28, 30, 3.5)),
      stroked("M 28 30 L 38 22", 3.5),
      filled(roundedRectPathData(4, 27, 8, 6, 2)),
      filled(roundedRectPathData(44, 27, 8, 6, 2)),
    ],
  },
  "hvac.transfer": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), roundedRectPathData(14, 24, 32, 16, 2)].join(" "),
        "evenodd",
      ),
      filled("M 18 25 H 32 V 23 L 38 28 L 32 33 V 31 H 18 Z"),
      filled("M 42 35 H 28 V 33 L 22 37 L 28 41 V 39 H 42 Z"),
    ],
  },
  "hvac.convector": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 22, 44, 20, 3),
          roundedRectPathData(14, 27, 32, 3, 1.5),
          roundedRectPathData(14, 33, 32, 3, 1.5),
          roundedRectPathData(14, 39, 32, 3, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(14, 42, 5, 6, 1.5)),
      filled(roundedRectPathData(41, 42, 5, 6, 1.5)),
    ],
  },
  "hvac.cooling": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), circlePathData(30, 32, 10)].join(" "),
        "evenodd",
      ),
      stroked("M 30 23 L 30 41", 3),
      stroked("M 22 27 L 38 37", 3),
      stroked("M 22 37 L 38 27", 3),
    ],
  },
  "hvac.heat-exchanger": {
    shapes: [
      filled(
        [roundedRectPathData(8, 18, 44, 28, 4), roundedRectPathData(14, 24, 32, 16, 2)].join(" "),
        "evenodd",
      ),
      stroked("M 15 32 L 21 25 L 27 39 L 33 25 L 39 39 L 45 32", 4),
    ],
  },
  "hvac.energy-meter": {
    shapes: [
      filled(
        [circlePathData(28, 30, 16), "M 33 18 L 24 31 L 30 31 L 27 42 L 38 27 L 31 27 Z"].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(4, 27, 8, 6, 2)),
      filled(roundedRectPathData(44, 27, 8, 6, 2)),
    ],
  },
  "hvac.expansion-vessel": {
    shapes: [
      filled(
        [roundedRectPathData(18, 8, 24, 40, 12), roundedRectPathData(22, 28, 16, 4, 2)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(28, 48, 4, 8, 2)),
      filled(roundedRectPathData(20, 54, 20, 4, 2)),
    ],
  },
  "hvac.floor-drain": {
    shapes: [
      filled(
        [
          roundedRectPathData(10, 10, 40, 40, 3),
          roundedRectPathData(16, 16, 28, 3, 1.5),
          roundedRectPathData(16, 22, 28, 3, 1.5),
          roundedRectPathData(16, 37, 28, 3, 1.5),
          roundedRectPathData(16, 43, 28, 3, 1.5),
          circlePathData(30, 30, 4),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "hvac.oil-separator": {
    shapes: [
      filled(
        [roundedRectPathData(6, 14, 46, 28, 6), roundedRectPathData(12, 20, 34, 16, 3)].join(" "),
        "evenodd",
      ),
      filled("M 30 22 C 26 27 23 31 24 35 C 25 39 30 41 34 38 C 38 35 36 29 32 24 L 30 22 Z"),
      filled("M 28 42 H 34 V 50 H 41 L 31 59 L 21 50 H 28 Z"),
    ],
  },
};
