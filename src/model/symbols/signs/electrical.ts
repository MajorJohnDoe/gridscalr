import type { SymbolArt } from "../types";
import { filled, stroked } from "../signArtHelpers";
import { circlePathData, roundedRectPathData } from "../../symbolPaths";

/** Classic sign plates for the electrical category. */
export const ELECTRICAL_SIGN_ART: Record<string, SymbolArt> = {
  "electrical.emergency-light": {
    shapes: [
      filled(roundedRectPathData(18, 12, 24, 10, 2.5)),
      stroked("M 22 27 L 20 35", 3),
      stroked("M 30 27 L 30 37", 3),
      stroked("M 38 27 L 40 35", 3),
      filled("M 18 44 H 36 V 38 L 50 47 L 36 56 V 50 H 18 Z"),
    ],
  },
  "electrical.main-panel": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [roundedRectPathData(8, 4, 43, 56, 6), roundedRectPathData(14, 10, 31, 44, 3)].join(" "),
        "evenodd",
      ),
      filled("M 33 15 L 22 34 L 29 34 L 26 49 L 39 29 L 31 29 Z"),
      filled(roundedRectPathData(41, 28, 3, 10, 1.5)),
    ],
  },
  "electrical.light": {
    glyphColor: "#111111",
    shapes: [
      filled([circlePathData(30, 30, 9), circlePathData(30, 30, 4)].join(" "), "evenodd"),
      stroked("M 30 18 L 30 12", 4),
      stroked("M 38.5 21.5 L 42.7 17.3", 4),
      stroked("M 42 30 L 48 30", 4),
      stroked("M 38.5 38.5 L 42.7 42.7", 4),
      stroked("M 30 42 L 30 48", 4),
      stroked("M 21.5 38.5 L 17.3 42.7", 4),
      stroked("M 18 30 L 12 30", 4),
      stroked("M 21.5 21.5 L 17.3 17.3", 4),
    ],
  },
  "electrical.access": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(18, 8, 24, 44, 4),
          circlePathData(24, 17, 1.6),
          circlePathData(30, 17, 1.6),
          circlePathData(36, 17, 1.6),
          circlePathData(24, 24, 1.6),
          circlePathData(30, 24, 1.6),
          circlePathData(36, 24, 1.6),
          circlePathData(24, 31, 1.6),
          circlePathData(30, 31, 1.6),
          circlePathData(36, 31, 1.6),
          roundedRectPathData(23, 40, 14, 4, 1.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.cctv": {
    glyphColor: "#111111",
    shapes: [
      filled(
        ["M 10 20 H 33 L 41 25 V 35 L 33 40 H 10 Z", circlePathData(34, 30, 4)].join(" "),
        "evenodd",
      ),
      filled(circlePathData(34, 30, 1.5)),
      filled(roundedRectPathData(18, 40, 5, 8, 1.5)),
      filled(roundedRectPathData(12, 48, 17, 4, 2)),
    ],
  },
  "electrical.fuse-cabinet": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [roundedRectPathData(8, 4, 43, 56, 6), roundedRectPathData(14, 10, 31, 44, 3)].join(" "),
        "evenodd",
      ),
      filled(roundedRectPathData(18, 16, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 16, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 24, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 24, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 32, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 32, 10, 5, 1.5)),
      filled(roundedRectPathData(18, 40, 10, 5, 1.5)),
      filled(roundedRectPathData(31, 40, 10, 5, 1.5)),
      filled(roundedRectPathData(42, 28, 3, 10, 1.5)),
    ],
  },
  "electrical.outlet-230": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(16, 10, 28, 40, 5),
          roundedRectPathData(22, 20, 4, 10, 2),
          roundedRectPathData(34, 20, 4, 10, 2),
          roundedRectPathData(28, 38, 4, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.outlet-400": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(14, 10, 32, 40, 5),
          roundedRectPathData(20, 20, 4, 10, 2),
          roundedRectPathData(28, 20, 4, 10, 2),
          roundedRectPathData(36, 20, 4, 10, 2),
          roundedRectPathData(27, 38, 6, 6, 2),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.data-outlet": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          roundedRectPathData(16, 10, 28, 40, 5),
          roundedRectPathData(22, 20, 16, 10, 1.5),
          roundedRectPathData(27, 30, 6, 4, 1.5),
          roundedRectPathData(22, 38, 16, 3, 1.5),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.temperature": {
    glyphColor: "#111111",
    shapes: [
      filled(roundedRectPathData(27, 10, 6, 28, 3)),
      filled([circlePathData(30, 43, 7), circlePathData(30, 43, 3.5)].join(" "), "evenodd"),
      filled(roundedRectPathData(36, 16, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 23, 5, 3, 1.5)),
      filled(roundedRectPathData(36, 30, 5, 3, 1.5)),
    ],
  },
  "electrical.co2": {
    glyphColor: "#111111",
    shapes: [
      filled([circlePathData(30, 30, 16), circlePathData(30, 30, 12)].join(" "), "evenodd"),
      stroked("M 22 34 L 30 30 L 36 22", 3),
      filled(circlePathData(22, 34, 4)),
      filled(circlePathData(30, 30, 4)),
      filled(circlePathData(36, 22, 4)),
    ],
  },
  "electrical.humidity": {
    glyphColor: "#111111",
    shapes: [
      filled(
        [
          "M 30 8 C 24 18 18 26 18 34 C 18 42 23 48 30 48 C 37 48 42 42 42 34 C 42 26 36 18 30 8 Z",
          circlePathData(30, 36, 4),
        ].join(" "),
        "evenodd",
      ),
    ],
  },
  "electrical.wifi": {
    glyphColor: "#111111",
    shapes: [
      stroked("M 14 32 Q 30 14 46 32", 5),
      stroked("M 20 38 Q 30 26 40 38", 5),
      filled(circlePathData(30, 45, 4)),
    ],
  },
};
