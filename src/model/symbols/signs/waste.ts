import type { SymbolArt } from "../types";
import { filled, stroked, rotateD, RECYCLING_ARM, RECYCLING_HEAD } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the waste category. */
export const WASTE_SIGN_ART: Record<string, SymbolArt> = {
  "waste.recycling": {
    shapes: [
      filled(RECYCLING_ARM),
      filled(RECYCLING_HEAD),
      filled(rotateD(RECYCLING_ARM, 120)),
      filled(rotateD(RECYCLING_HEAD, 120)),
      filled(rotateD(RECYCLING_ARM, 240)),
      filled(rotateD(RECYCLING_HEAD, 240)),
    ],
  },
  "waste.bins": {
    shapes: [
      filled(roundedRectPathData(7, 18, 14, 6, 2)),
      filled(roundedRectPathData(8, 24, 12, 24, 2)),
      filled(roundedRectPathData(23, 12, 14, 6, 2)),
      filled(roundedRectPathData(24, 18, 12, 30, 2)),
      filled(roundedRectPathData(39, 16, 14, 6, 2)),
      filled(roundedRectPathData(40, 22, 12, 26, 2)),
    ],
  },
  "waste.hazardous": {
    shapes: [
      filled(
        [
          "M 16 28 C 16 16 23 10 30 10 C 37 10 44 16 44 28 C 44 34 41 38 36 40 V 48 H 24 V 40 C 19 38 16 34 16 28 Z",
          circlePathData(23, 27, 4),
          circlePathData(37, 27, 4),
          "M 30 32 L 26 38 H 34 Z",
          roundedRectPathData(26, 43, 3, 5, 1),
          roundedRectPathData(31, 43, 3, 5, 1),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "waste.grease": {
    shapes: [
      filled(
        [roundedRectPathData(6, 14, 46, 28, 6), roundedRectPathData(12, 20, 34, 16, 3)].join(" "),
        "evenodd",
      ),
      stroked("M 14 28 Q 19 24 24 28 Q 29 32 34 28 Q 39 24 44 28", 4),
      filled("M 28 42 H 34 V 50 H 41 L 31 59 L 21 50 H 28 Z"),
    ],
  },
  "waste.battery": {
    shapes: [
      filled(
        [
          roundedRectPathData(8, 24, 36, 24, 4),
          "M 17 34 H 21 V 30 H 25 V 34 H 29 V 38 H 25 V 42 H 21 V 38 H 17 Z",
          roundedRectPathData(32, 34, 8, 4, 1.5),
        ].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(44, 30, 8, 12, 2)),
    ],
  },
  "waste.chemical": {
    shapes: [
      filled(
        [
          roundedRectPathData(14, 8, 36, 46, 4),
          "M 27 16 H 33 V 24 L 40 40 Q 42 46 35 46 H 25 Q 18 46 20 40 L 27 24 Z",
          roundedRectPathData(44, 28, 2, 10, 1),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
};
