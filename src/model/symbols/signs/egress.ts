import type { SymbolArt } from "../types";
import { filled, stroked } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the egress category. */
export const EGRESS_SIGN_ART: Record<string, SymbolArt> = {
  "egress.exit": {
    shapes: [
      filled(roundedRectPathData(4, 10, 12, 44, 2)),
      filled("M 38 28 H 30 V 22 L 18 31 L 30 40 V 34 H 38 Z"),
      filled(circlePathData(46, 18, 5)),
      stroked("M 46 24 L 42 37", 6.5),
      stroked("M 44 28 L 34 32", 5.5),
      stroked("M 44 28 L 52 34", 5),
      stroked("M 42 37 L 34 49", 6),
      stroked("M 42 37 L 50 46", 6),
    ],
  },
  "egress.assembly": {
    shapes: [
      filled(circlePathData(31, 13, 5)),
      stroked("M 31 19 L 31 34", 7),
      stroked("M 31 23 L 21 30", 4.5),
      stroked("M 31 23 L 41 30", 4.5),
      stroked("M 31 34 L 25 48", 5.5),
      stroked("M 31 34 L 37 48", 5.5),
      filled(circlePathData(15, 22, 4)),
      stroked("M 15 27 L 15 38", 5.5),
      stroked("M 15 30 L 10 35", 4),
      stroked("M 15 30 L 20 35", 4),
      stroked("M 15 38 L 11 48", 4.5),
      stroked("M 15 38 L 19 48", 4.5),
      filled(circlePathData(45, 22, 4)),
      stroked("M 45 27 L 45 38", 5.5),
      stroked("M 45 30 L 40 35", 4),
      stroked("M 45 30 L 50 35", 4),
      stroked("M 45 38 L 41 48", 4.5),
      stroked("M 45 38 L 49 48", 4.5),
    ],
  },
  "egress.aed": {
    shapes: [
      filled(
        [
          "M 31 52 C 19 44 12 36 12 27 C 12 19 17 14 24 14 C 28 14 30 16 31 19 C 32 16 34 14 38 14 C 45 14 50 19 50 27 C 50 36 43 44 31 52 Z",
          "M 34 20 L 25 35 L 31 35 L 28 45 L 38 30 L 32 30 Z",
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "egress.first-aid": {
    shapes: [filled("M 27 12 H 35 V 27 H 50 V 35 H 35 V 50 H 27 V 35 H 12 V 27 H 27 Z")],
  },
};
