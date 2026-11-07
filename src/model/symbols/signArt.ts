import type { SymbolArt } from "./types";
import { FIRE_SIGN_ART } from "./signs/fire";
import { EGRESS_SIGN_ART } from "./signs/egress";
import { ELECTRICAL_SIGN_ART } from "./signs/electrical";
import { HVAC_SIGN_ART } from "./signs/hvac";
import { BUILDING_SIGN_ART } from "./signs/building";
import { WASTE_SIGN_ART } from "./signs/waste";
import { symbolArtBounds } from "./render";
import { parseSymbolPath, serializeSymbolPath, transformSymbolCommands } from "../symbolPaths";

/** Center the pictogram's combined bounds on the 32,32 plate centre. */
export function centerArt(art: SymbolArt): SymbolArt {
  const bounds = symbolArtBounds(art);
  if (!Number.isFinite(bounds.minX)) return art;
  const dx = 32 - (bounds.minX + bounds.maxX) / 2;
  const dy = 32 - (bounds.minY + bounds.maxY) / 2;
  if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return art;
  return {
    ...art,
    shapes: art.shapes.map((shape) => ({
      ...shape,
      d: serializeSymbolPath(
        transformSymbolCommands(parseSymbolPath(shape.d), (point) => ({
          x: point.x + dx,
          y: point.y + dy,
        })),
      ),
    })),
  };
}

/**
 * Facility-sign artwork. The shapes follow the familiar sign-board grammar (a
 * coloured plate with a white pictogram) but are original drawings for
 * GridScalr, not traced from an external sign or icon set. Every pictogram is
 * centred on the 32,32 plate centre.
 */
export const SIGN_ART: Record<string, SymbolArt> = Object.fromEntries(
  Object.entries({
    ...FIRE_SIGN_ART,
    ...EGRESS_SIGN_ART,
    ...ELECTRICAL_SIGN_ART,
    ...HVAC_SIGN_ART,
    ...BUILDING_SIGN_ART,
    ...WASTE_SIGN_ART,
  }).map(([id, art]) => [id, centerArt(art)]),
);
