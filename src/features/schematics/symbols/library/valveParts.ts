import { joinPaths, linePath, polyPath, rectPath, smallCircle } from "../primitives";

/** Filled seat band along the right-hand outlet of a valve triangle. */
export const RIGHT_SEAT_BAND = polyPath([46, 22, 42, 24.8571, 42, 39.1429, 46, 42], true);

/** The same band along the base of the downward-facing third branch. */
export const BOTTOM_SEAT_BAND = polyPath([24.8571, 42, 39.1429, 42, 42, 46, 22, 46], true);

export function valveBody(): string {
  return joinPaths(
    polyPath([18, 22, 32, 32, 18, 42], true),
    polyPath([46, 22, 32, 32, 46, 42], true),
  );
}

/** Stem and square actuator box above a valve body. */
export function valveActuatorBody(): string {
  return joinPaths(linePath(32, 15, 32, 32), rectPath(23, 3, 18, 12));
}

/** The letter M drawn as stroke paths inside the actuator box. */
export function motorLetter(): string {
  return joinPaths(
    linePath(27, 13, 27, 6),
    linePath(27, 6, 32, 10),
    linePath(32, 10, 37, 6),
    linePath(37, 6, 37, 13),
  );
}

/** The letter H drawn as stroke paths inside the actuator box. */
export function hydraulicLetter(): string {
  return joinPaths(linePath(27, 6, 27, 13), linePath(37, 6, 37, 13), linePath(27, 9.5, 37, 9.5));
}

/** Block-letter S for a solenoid actuator box. */
export function solenoidLetter(): string {
  return joinPaths(
    linePath(36.5, 7.5, 28, 7.5),
    linePath(28, 7.5, 28, 9.5),
    linePath(28, 9.5, 36, 9.5),
    linePath(36, 9.5, 36, 12),
    linePath(36, 12, 27.5, 12),
  );
}

/** Block-letter P for a pilot actuator box. */
export function pilotLetter(): string {
  return joinPaths(
    linePath(28, 6, 28, 13),
    linePath(28, 6, 36, 6),
    linePath(36, 6, 36, 9.5),
    linePath(36, 9.5, 28, 9.5),
  );
}

/** Block-letter W for a weight actuator box. */
export function weightLetter(): string {
  return joinPaths(
    linePath(27, 6, 29, 13),
    linePath(29, 13, 32, 8),
    linePath(32, 8, 35, 13),
    linePath(35, 13, 37, 6),
  );
}

export const SELF_DRAINING_HEAD = polyPath([27, 48, 32, 56, 37, 48], true);

export const ANGLE_VALVE_BODY = joinPaths(
  polyPath([18, 22, 32, 32, 18, 42], true),
  polyPath([22, 46, 42, 46, 32, 32], true),
);

export const RELIEF_SPRING = joinPaths(
  linePath(32, 32, 32, 14),
  linePath(24, 13, 40, 13),
  linePath(26, 10, 38, 10),
  linePath(24, 7, 40, 7),
  linePath(26, 4, 38, 4),
);

export const ANGLE_BLOWDOWN_BRANCH = joinPaths(linePath(32, 32, 48, 16), linePath(42, 10, 54, 22));

export const SPRING_GATE_SPRING = joinPaths(
  linePath(32, 32, 32, 14),
  linePath(26, 13, 38, 13),
  linePath(28, 10, 36, 10),
  linePath(26, 7, 38, 7),
  linePath(28, 4, 36, 4),
);

export const SELF_OPERATING_RELEASE_FILL = polyPath(
  Array.from({ length: 33 }, (_, index) => {
    const angle = ((135 - (180 * index) / 32) * Math.PI) / 180;
    return [32 + Math.cos(angle) * 14, 32 + Math.sin(angle) * 14];
  }).flat(),
  true,
);

const STRAINER_FLANGES = joinPaths(
  linePath(8, 24, 8, 40),
  linePath(56, 24, 56, 40),
  linePath(8, 32, 56, 32),
);

export const Y_STRAINER_BODY = joinPaths(
  STRAINER_FLANGES,
  linePath(32, 32, 50, 54),
  linePath(45, 42, 39, 47),
  linePath(47.5, 45, 41.5, 50),
  polyPath([45.2, 52.8, 49.8, 49, 50, 54], true),
  polyPath([50.2, 59, 54.8, 55.2, 50, 54], true),
);

export const Y_TYPE_STRAINER_BODY = joinPaths(
  STRAINER_FLANGES,
  linePath(32, 32, 50, 54),
  linePath(42, 54, 58, 54),
);

export const DIVERTER_VALVE_BODY = joinPaths(
  linePath(8, 24, 8, 40),
  linePath(56, 24, 56, 40),
  linePath(8, 32, 56, 32),
  smallCircle(32, 32, 10),
  linePath(39, 39, 50, 54),
  linePath(42, 54, 58, 54),
);
