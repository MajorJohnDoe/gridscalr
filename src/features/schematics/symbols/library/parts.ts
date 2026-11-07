import { joinPaths, linePath, polyPath, rectPath, smallCircle } from "../primitives";

/** Pump inlet and outlet anchors around the body. */
export const PUMP_PORTS = () => [
  { id: "in", x: 16, y: 32, direction: "in" as const },
  { id: "out", x: 48, y: 32, direction: "out" as const },
];

/** Process connection below a sensor funnel. */
export const SENSOR_PORTS = (x = 32) => [{ id: "process", x, y: 58, direction: "both" as const }];

/** Pump circle with a down-pointing flow triangle. */
export function pumpBody(): string {
  return joinPaths(smallCircle(32, 32, 16), polyPath([32, 20, 44, 40, 20, 40], true));
}

/** Meter body with a round dial and a baseline. */
export function meterBody(): string {
  return joinPaths(rectPath(12, 16, 40, 32), smallCircle(32, 30, 9), linePath(26, 38, 38, 38));
}
