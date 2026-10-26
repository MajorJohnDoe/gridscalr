import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { COLORS, MEZZANINE, PLAN, SHEET, SITE } from "./plan-geometry.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "..", "fixtures");
const output = resolve(outputDir, "industrial-plan.pdf");

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);
const oblique = await doc.embedFont(StandardFonts.HelveticaOblique);

const C = Object.fromEntries(
  Object.entries(COLORS).map(([key, value]) => [key, rgb(value[0], value[1], value[2])]),
);

const planProject = (x, y) => ({
  x: PLAN.origin.x + x * PLAN.scalePpm,
  y: PLAN.origin.y + y * PLAN.scalePpm,
});
const planMetre = (value) => value * PLAN.scalePpm;
let P = planProject;
let M = planMetre;
const SP = (x, y) => ({
  x: SITE.origin.x + x * SITE.scalePpm,
  y: SITE.origin.y + y * SITE.scalePpm,
});
const SM = (value) => value * SITE.scalePpm;

function withProject(project, metre, callback) {
  const previousProject = P;
  const previousMetre = M;
  P = project;
  M = metre;
  try {
    return callback();
  } finally {
    P = previousProject;
    M = previousMetre;
  }
}

function text(page, value, x, y, options = {}) {
  const {
    size = 8,
    color = C.ink,
    fontRef = font,
    align = "left",
    rotate = 0,
    opacity = 1,
  } = options;
  let drawX = x;
  if (align === "center") drawX -= fontRef.widthOfTextAtSize(value, size) / 2;
  if (align === "right") drawX -= fontRef.widthOfTextAtSize(value, size);
  page.drawText(value, {
    x: drawX,
    y,
    size,
    font: fontRef,
    color,
    opacity,
    rotate: rotate ? { type: "degrees", angle: rotate } : undefined,
  });
}

function line(page, x1, y1, x2, y2, options = {}) {
  const { width = 0.6, color = C.ink, dash = null, opacity = 1 } = options;
  const drawOptions = {
    start: { x: x1, y: y1 },
    end: { x: x2, y: y2 },
    thickness: width,
    color,
    opacity,
  };
  if (dash) {
    drawOptions.dashArray = dash;
    drawOptions.dashPhase = 0;
  }
  page.drawLine(drawOptions);
}

function rect(page, x, y, width, height, options = {}) {
  const {
    fill = null,
    border = null,
    borderWidth = 0.5,
    dash = null,
    opacity = 1,
    borderOpacity = 1,
  } = options;
  const drawOptions = {
    x,
    y,
    width,
    height,
    opacity,
    borderOpacity,
  };
  if (fill) drawOptions.color = fill;
  if (border) {
    drawOptions.borderColor = border;
    drawOptions.borderWidth = borderWidth;
  }
  if (dash) {
    drawOptions.borderDashArray = dash;
    drawOptions.borderDashPhase = 0;
  }
  page.drawRectangle(drawOptions);
}

function circle(page, x, y, radius, options = {}) {
  const { fill = null, border = null, borderWidth = 0.5, opacity = 1 } = options;
  page.drawCircle({
    x,
    y,
    size: radius,
    color: fill ?? undefined,
    borderColor: border ?? undefined,
    borderWidth: border ? borderWidth : 0,
    opacity,
  });
}

function ellipse(page, x, y, rx, ry, options = {}) {
  const { fill = null, border = null, borderWidth = 0.5, opacity = 1 } = options;
  page.drawEllipse({
    x,
    y,
    xScale: rx,
    yScale: ry,
    color: fill ?? undefined,
    borderColor: border ?? undefined,
    borderWidth: border ? borderWidth : 0,
    opacity,
  });
}

function polyline(page, points, options = {}) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = points[index];
    const b = points[index + 1];
    line(page, a.x, a.y, b.x, b.y, options);
  }
}

function arcPoints(cx, cy, radius, start, end, steps = 18) {
  let delta = end - start;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const angle = start + (delta * index) / steps;
    points.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) });
  }
  return points;
}

function sheet(page, meta) {
  rect(page, 0, 0, SHEET.width, SHEET.height, { fill: C.paper });
  rect(
    page,
    SHEET.margin,
    SHEET.margin,
    SHEET.width - SHEET.margin * 2,
    SHEET.height - SHEET.margin * 2,
    {
      border: C.ink,
      borderWidth: 1.1,
    },
  );
  rect(
    page,
    SHEET.margin + 4,
    SHEET.margin + 4,
    SHEET.width - SHEET.margin * 2 - 8,
    SHEET.height - SHEET.margin * 2 - 8,
    {
      border: C.mid,
      borderWidth: 0.3,
    },
  );

  const x = 760;
  const y = 38;
  const w = 403;
  const h = 60;
  rect(page, x, y, w, h, { fill: C.paper, border: C.ink, borderWidth: 0.8 });
  line(page, x, y + 24, x + w, y + 24, { width: 0.4, color: C.mid });
  line(page, x, y + 42, x + w, y + 42, { width: 0.4, color: C.mid });
  line(page, x + 220, y, x + 220, y + h, { width: 0.4, color: C.mid });
  line(page, x + 325, y, x + 325, y + h, { width: 0.4, color: C.mid });

  text(page, "NORTHGATE LOGISTICS HUB", x + 10, y + 47, { size: 10, fontRef: bold });
  text(page, meta.title, x + 10, y + 28.5, { size: 13, fontRef: bold });
  text(page, `SCALE ${meta.scale}`, x + 10, y + 14.2, { size: 6.5, fontRef: bold });
  text(page, "DATE 2026-10-26", x + 10, y + 6.5, { size: 5.8, color: C.mid });
  text(page, "NOT FOR CONSTRUCTION", x + 110, y + 14.2, {
    size: 6.2,
    color: C.amber,
    fontRef: bold,
  });
  text(page, "DIMENSIONS IN METRES", x + 110, y + 6.5, { size: 5.4, color: C.mid });
  text(page, "REV P01", x + 230, y + 14.2, { size: 7, fontRef: bold });
  text(page, "CHECKED", x + 230, y + 6.5, { size: 5.4, color: C.mid });
  text(page, "SHEET", x + 333, y + 46, { size: 5.6, color: C.mid });
  text(page, meta.sheet, x + 333, y + 27, { size: 21, fontRef: bold });
  text(page, "A3 / 420 × 297", x + 330, y + 6.5, { size: 5.2, color: C.mid });
}

function borderTicks(page) {
  for (let x = 100; x < SHEET.width - 30; x += 100) {
    line(page, x, SHEET.margin, x, SHEET.margin + 5, { width: 0.3, color: C.mid });
    line(page, x, SHEET.height - SHEET.margin, x, SHEET.height - SHEET.margin - 5, {
      width: 0.3,
      color: C.mid,
    });
  }
  for (let y = 100; y < SHEET.height - 30; y += 100) {
    line(page, SHEET.margin, y, SHEET.margin + 5, y, { width: 0.3, color: C.mid });
    line(page, SHEET.width - SHEET.margin, y, SHEET.width - SHEET.margin - 5, y, {
      width: 0.3,
      color: C.mid,
    });
  }
}

function gridBubbles(page) {
  const grid = PLAN.grid;
  for (let index = 0; index < grid.x.length; index += 1) {
    const p = P(grid.x[index], grid.y[grid.y.length - 1]);
    circle(page, p.x, p.y + M(0.45), 8, { fill: C.paper, border: C.ink, borderWidth: 0.5 });
    text(page, grid.xLabels[index], p.x, p.y + M(0.45) - 2.5, {
      size: 7,
      fontRef: bold,
      align: "center",
    });
  }
  for (let index = 0; index < grid.y.length; index += 1) {
    const p = P(grid.x[0], grid.y[index]);
    circle(page, p.x - M(0.75), p.y, 8, { fill: C.paper, border: C.ink, borderWidth: 0.5 });
    text(page, grid.yLabels[index], p.x - M(0.75), p.y - 2.5, {
      size: 7,
      fontRef: bold,
      align: "center",
    });
  }
}

function gridLines(page) {
  for (const x of PLAN.grid.x) {
    const a = P(x, 0);
    const b = P(x, PLAN.grid.y[PLAN.grid.y.length - 1]);
    line(page, a.x, a.y, b.x, b.y, { width: 0.28, color: C.faint, dash: [4, 5] });
  }
  for (const y of PLAN.grid.y) {
    const a = P(0, y);
    const b = P(PLAN.grid.x[PLAN.grid.x.length - 1], y);
    line(page, a.x, a.y, b.x, b.y, { width: 0.28, color: C.faint, dash: [4, 5] });
  }
}

function drawDoorLeaf(page, hinge, radius, closedAngle, swingAngle, color = C.mid) {
  const open = {
    x: hinge.x + radius * Math.cos(swingAngle),
    y: hinge.y + radius * Math.sin(swingAngle),
  };
  line(page, hinge.x, hinge.y, open.x, open.y, { width: 0.8, color });
  polyline(page, arcPoints(hinge.x, hinge.y, radius, closedAngle, swingAngle), {
    width: 0.45,
    color,
  });
  circle(page, hinge.x, hinge.y, 0.9, { fill: color });
}

function drawDoorX(page, wall, opening) {
  const y = P(0, wall.y).y;
  const from = P(opening.from, wall.y).x;
  const to = P(opening.to, wall.y).x;
  const width = to - from;
  const swing = opening.swing >= 0 ? Math.PI / 2 : -Math.PI / 2;
  if (opening.hinge === "both") {
    const half = width / 2;
    drawDoorLeaf(page, { x: from, y }, half, 0, swing);
    drawDoorLeaf(page, { x: to, y }, half, Math.PI, swing);
  } else {
    const atEnd = opening.hinge === "end";
    const hinge = { x: atEnd ? to : from, y };
    const closed = atEnd ? Math.PI : 0;
    drawDoorLeaf(page, hinge, width, closed, swing);
  }
}

function drawDoorY(page, wall, opening) {
  const x = P(wall.x, 0).x;
  const from = P(wall.x, opening.from).y;
  const to = P(wall.x, opening.to).y;
  const width = to - from;
  const swing = opening.swing >= 0 ? 0 : Math.PI;
  if (opening.hinge === "both") {
    const half = width / 2;
    drawDoorLeaf(page, { x, y: from }, half, Math.PI / 2, swing);
    drawDoorLeaf(page, { x, y: to }, half, -Math.PI / 2, swing);
  } else {
    const atEnd = opening.hinge === "end";
    const hinge = { x, y: atEnd ? to : from };
    const closed = atEnd ? -Math.PI / 2 : Math.PI / 2;
    drawDoorLeaf(page, hinge, width, closed, swing);
  }
}

function drawWindowX(page, wall, opening) {
  const y = P(0, wall.y).y;
  const from = P(opening.from, wall.y).x;
  const to = P(opening.to, wall.y).x;
  const thickness = M(wall.t);
  const color = opening.clerestory ? C.mid : C.ink;
  for (const offset of [-0.26, 0, 0.26]) {
    line(page, from, y + thickness * offset, to, y + thickness * offset, {
      width: opening.clerestory ? 0.55 : 0.45,
      color,
    });
  }
  line(page, from, y - thickness / 2, from, y + thickness / 2, { width: 0.4, color: C.mid });
  line(page, to, y - thickness / 2, to, y + thickness / 2, { width: 0.4, color: C.mid });
  line(page, from - 2, y + thickness / 2 + 1, to + 2, y + thickness / 2 + 1, {
    width: 0.3,
    color: C.faint,
  });
}

function drawWindowY(page, wall, opening) {
  const x = P(wall.x, 0).x;
  const from = P(wall.x, opening.from).y;
  const to = P(wall.x, opening.to).y;
  const thickness = M(wall.t);
  const color = opening.clerestory ? C.mid : C.ink;
  for (const offset of [-0.26, 0, 0.26]) {
    line(page, x + thickness * offset, from, x + thickness * offset, to, {
      width: opening.clerestory ? 0.55 : 0.45,
      color,
    });
  }
  line(page, x - thickness / 2, from, x + thickness / 2, from, { width: 0.4, color: C.mid });
  line(page, x - thickness / 2, to, x + thickness / 2, to, { width: 0.4, color: C.mid });
  line(page, x + thickness / 2 + 1, from - 2, x + thickness / 2 + 1, to + 2, {
    width: 0.3,
    color: C.faint,
  });
}

function drawGateX(page, wall, opening) {
  const y = P(0, wall.y).y;
  const from = P(opening.from, wall.y).x;
  const to = P(opening.to, wall.y).x;
  line(page, from, y, to, y, { width: 0.7, color: C.mid, dash: [6, 3] });
  const step = M(0.65);
  for (let x = from; x <= to; x += step) {
    line(page, x, y - M(0.16), x, y + M(0.16), { width: 0.35, color: C.mid });
  }
  text(page, opening.label, (from + to) / 2, y - 12, {
    size: 6.2,
    color: C.mid,
    align: "center",
    fontRef: bold,
  });
}

function drawRollerY(page, wall, opening) {
  const x = P(wall.x, 0).x;
  const from = P(wall.x, opening.from).y;
  const to = P(wall.x, opening.to).y;
  line(page, x, from, x, to, { width: 0.7, color: C.mid, dash: [6, 3] });
  const step = M(0.55);
  for (let y = from; y <= to; y += step) {
    line(page, x - M(0.13), y, x + M(0.13), y, { width: 0.35, color: C.mid });
  }
  text(page, opening.label, x + 10, (from + to) / 2 - 2.5, {
    size: 5.6,
    color: C.mid,
    rotate: 90,
    fontRef: bold,
  });
}

function drawDock(page, wall, opening) {
  const x = P(wall.x, 0).x;
  const y1 = P(wall.x, opening.from).y;
  const y2 = P(wall.x, opening.to).y;
  const mid = (y1 + y2) / 2;

  // Sectional door leaf in the wall plane.
  for (let y = y1 + 4; y < y2 - 2; y += 7) {
    line(page, x - 1.5, y, x + 1.5, y, { width: 0.35, color: C.mid });
  }
  line(page, x - 1.5, y1, x - 1.5, y2, { width: 0.45, color: C.mid });
  line(page, x + 1.5, y1, x + 1.5, y2, { width: 0.45, color: C.mid });

  // Bumpers and dock leveller.
  rect(page, x - M(0.55), y1 - M(0.35), M(0.3), M(0.45), { fill: C.ink });
  rect(page, x - M(0.55), y2 - M(0.1), M(0.3), M(0.45), { fill: C.ink });
  rect(page, x + M(0.35), y1 + 2, M(2.5), y2 - y1 - 4, {
    fill: C.pale,
    border: C.mid,
    borderWidth: 0.5,
  });
  for (let offset = M(0.5); offset < M(2.4); offset += M(0.35)) {
    line(page, x + M(0.4) + offset, y1 + 2, x + M(0.4) + offset, y2 - 2, {
      width: 0.25,
      color: C.faint,
    });
  }

  text(page, opening.label, x + M(1.6), y2 + M(0.65), {
    size: 8,
    fontRef: bold,
    align: "center",
  });
  text(page, "DOCK LEVELLER", x + M(1.6), y1 - M(0.45), {
    size: 5.5,
    color: C.mid,
    align: "center",
  });
}

function drawWallX(page, wall) {
  const thickness = M(wall.t);
  const y = P(0, wall.y).y;
  const color = wall.exterior ? C.wall : C.wallInner;
  const sorted = [...wall.openings].sort((a, b) => a.from - b.from);
  let cursor = wall.x1;
  for (const opening of sorted) {
    if (opening.from > cursor) {
      rect(page, P(cursor, wall.y).x, y - thickness / 2, M(opening.from - cursor), thickness, {
        fill: color,
      });
    }
    const from = P(opening.from, wall.y).x;
    const to = P(opening.to, wall.y).x;
    line(page, from, y - thickness / 2, from, y + thickness / 2, { width: 0.4, color: C.ink });
    line(page, to, y - thickness / 2, to, y + thickness / 2, { width: 0.4, color: C.ink });
    if (opening.type === "door") drawDoorX(page, wall, opening);
    else if (opening.type === "window") drawWindowX(page, wall, opening);
    else if (opening.type === "gate") drawGateX(page, wall, opening);
    cursor = opening.to;
  }
  if (cursor < wall.x2) {
    rect(page, P(cursor, wall.y).x, y - thickness / 2, M(wall.x2 - cursor), thickness, {
      fill: color,
    });
  }
}

function drawWallY(page, wall) {
  const thickness = M(wall.t);
  const x = P(wall.x, 0).x;
  const color = wall.exterior ? C.wall : C.wallInner;
  const sorted = [...wall.openings].sort((a, b) => a.from - b.from);
  let cursor = wall.y1;
  for (const opening of sorted) {
    if (opening.from > cursor) {
      rect(page, x - thickness / 2, P(wall.x, cursor).y, thickness, M(opening.from - cursor), {
        fill: color,
      });
    }
    const from = P(wall.x, opening.from).y;
    const to = P(wall.x, opening.to).y;
    line(page, x - thickness / 2, from, x + thickness / 2, from, { width: 0.4, color: C.ink });
    line(page, x - thickness / 2, to, x + thickness / 2, to, { width: 0.4, color: C.ink });
    if (opening.type === "door") drawDoorY(page, wall, opening);
    else if (opening.type === "window") drawWindowY(page, wall, opening);
    else if (opening.type === "roller") drawRollerY(page, wall, opening);
    else if (opening.type === "dock") drawDock(page, wall, opening);
    cursor = opening.to;
  }
  if (cursor < wall.y2) {
    rect(page, x - thickness / 2, P(wall.x, cursor).y, thickness, M(wall.y2 - cursor), {
      fill: color,
    });
  }
}

function drawBuildingWalls(page) {
  for (const wall of PLAN.walls.horizontal) drawWallX(page, wall);
  for (const wall of PLAN.walls.vertical) drawWallY(page, wall);
}

function drawRoomLabels(page, rooms, projector, scale) {
  for (const room of rooms) {
    const p = projector(room.label.x, room.label.y);
    text(page, room.name, p.x, p.y + 3, {
      size: room.labelSize * (scale / 28.3464567),
      fontRef: bold,
      align: "center",
    });
    text(page, room.area, p.x, p.y - 6 * (scale / 28.3464567), {
      size: Math.max(5.2, room.labelSize * 0.62) * (scale / 28.3464567),
      color: C.mid,
      align: "center",
    });
  }
}

function drawDesk(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.45 });
  line(page, x + 2, y + h * 0.62, x + w - 2, y + h * 0.62, { width: 0.25, color: C.faint });
  rect(page, x + w * 0.28, y + h * 0.25, w * 0.44, h * 0.28, {
    border: C.mid,
    borderWidth: 0.3,
  });
  circle(page, x + w / 2, y - M(0.36), M(0.24), { border: C.mid, borderWidth: 0.35 });
}

function drawMeetingTable(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.5 });
  const chairs = fixture.chairs ?? 4;
  const xs = chairs >= 6 ? [0.2, 0.5, 0.8] : [0.3, 0.7];
  for (const t of xs) {
    circle(page, x + w * t, y - M(0.35), M(0.22), { border: C.mid, borderWidth: 0.35 });
    circle(page, x + w * t, y + h + M(0.35), M(0.22), { border: C.mid, borderWidth: 0.35 });
  }
  if (chairs >= 4) {
    circle(page, x - M(0.35), y + h / 2, M(0.22), { border: C.mid, borderWidth: 0.35 });
    circle(page, x + w + M(0.35), y + h / 2, M(0.22), { border: C.mid, borderWidth: 0.35 });
  }
}

function drawReceptionDesk(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.5 });
  line(page, x + 3, y + h * 0.25, x + w - 3, y + h * 0.25, { width: 0.3, color: C.faint });
  circle(page, x + w / 2, y + h + M(0.42), M(0.24), { border: C.mid, borderWidth: 0.35 });
}

function drawKitchen(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.45 });
  const alongX = w > h;
  const count = alongX ? 4 : 3;
  for (let index = 0; index < count; index += 1) {
    if (alongX) {
      line(
        page,
        x + (w * (index + 1)) / (count + 1),
        y + 2,
        x + (w * (index + 1)) / (count + 1),
        y + h - 2,
        {
          width: 0.25,
          color: C.faint,
        },
      );
    } else {
      line(
        page,
        x + 2,
        y + (h * (index + 1)) / (count + 1),
        x + w - 2,
        y + (h * (index + 1)) / (count + 1),
        {
          width: 0.25,
          color: C.faint,
        },
      );
    }
  }
  circle(page, x + w * 0.5, y + h * 0.28, Math.min(w, h) * 0.16, {
    border: C.mid,
    borderWidth: 0.3,
  });
  for (const [dx, dy] of [
    [0.7, 0.7],
    [0.85, 0.7],
    [0.7, 0.85],
    [0.85, 0.85],
  ]) {
    circle(page, x + w * dx, y + h * dy, Math.min(w, h) * 0.055, {
      border: C.mid,
      borderWidth: 0.25,
    });
  }
}

function drawBreakTable(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.45 });
  for (const [cx, cy] of [
    [x + w / 2, y - M(0.32)],
    [x + w / 2, y + h + M(0.32)],
    [x - M(0.32), y + h / 2],
    [x + w + M(0.32), y + h / 2],
  ]) {
    circle(page, cx, cy, M(0.21), { border: C.mid, borderWidth: 0.35 });
  }
}

function drawToilet(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const dir = fixture.rotation === 180 ? 1 : -1;
  rect(page, x - M(0.25), y + dir * M(0.28) - M(0.1), M(0.5), M(0.2), {
    border: C.mid,
    borderWidth: 0.35,
  });
  ellipse(page, x, y - dir * M(0.1), M(0.22), M(0.34), {
    border: C.mid,
    borderWidth: 0.4,
  });
}

function drawBasin(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.35 });
  ellipse(page, x + w / 2, y + h / 2, w * 0.32, h * 0.3, {
    border: C.mid,
    borderWidth: 0.3,
  });
}

function drawShower(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.4 });
  line(page, x, y, x + w, y + h, { width: 0.3, color: C.faint });
  line(page, x, y + h, x + w, y, { width: 0.3, color: C.faint });
  circle(page, x + w / 2, y + h / 2, 2, { border: C.mid, borderWidth: 0.3 });
}

function drawWorkbench(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.45 });
  for (let cx = x + 12; cx < x + w - 4; cx += 18) {
    line(page, cx, y + 2, cx, y + h - 2, { width: 0.25, color: C.faint });
    circle(page, cx + 5, y + h * 0.55, 1.2, { border: C.mid, borderWidth: 0.25 });
  }
}

function drawCabinet(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.4 });
  for (let cy = y + 8; cy < y + h - 2; cy += 8) {
    line(page, x + 1, cy, x + w - 1, cy, { width: 0.22, color: C.faint });
  }
}

function drawCompressor(page, fixture) {
  const p = P(fixture.x, fixture.y);
  circle(page, p.x, p.y, M(0.38), { fill: C.pale, border: C.mid, borderWidth: 0.4 });
  text(page, "C", p.x, p.y - 2.2, { size: 6, fontRef: bold, align: "center", color: C.mid });
}

function drawFireExtinguisher(page, fixture) {
  const p = P(fixture.x, fixture.y);
  circle(page, p.x, p.y, M(0.18), { fill: C.paper, border: C.mid, borderWidth: 0.35 });
  text(page, "FE", p.x, p.y - 1.8, { size: 3.8, align: "center", color: C.mid });
}

function drawFloorDrain(page, fixture) {
  const p = P(fixture.x, fixture.y);
  circle(page, p.x, p.y, M(0.12), { border: C.mid, borderWidth: 0.3 });
  line(page, p.x - M(0.1), p.y, p.x + M(0.1), p.y, { width: 0.25, color: C.mid });
  line(page, p.x, p.y - M(0.1), p.x, p.y + M(0.1), { width: 0.25, color: C.mid });
}

function drawLocker(page, fixture) {
  const x = P(fixture.x, fixture.y).x;
  const y = P(fixture.x, fixture.y).y;
  const w = M(fixture.w);
  const h = M(fixture.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.4 });
  const bays = fixture.bays ?? 3;
  for (let index = 1; index < bays; index += 1) {
    line(page, x, y + (h * index) / bays, x + w, y + (h * index) / bays, {
      width: 0.25,
      color: C.faint,
    });
  }
}

function drawFixture(page, fixture) {
  switch (fixture.type) {
    case "desk":
      drawDesk(page, fixture);
      break;
    case "meeting-table":
      drawMeetingTable(page, fixture);
      break;
    case "reception-desk":
      drawReceptionDesk(page, fixture);
      break;
    case "kitchen":
      drawKitchen(page, fixture);
      break;
    case "break-table":
      drawBreakTable(page, fixture);
      break;
    case "chair": {
      const p = P(fixture.x, fixture.y);
      circle(page, p.x, p.y, M(0.22), { border: C.mid, borderWidth: 0.35 });
      break;
    }
    case "toilet":
      drawToilet(page, fixture);
      break;
    case "basin":
      drawBasin(page, fixture);
      break;
    case "shower":
      drawShower(page, fixture);
      break;
    case "workbench":
      drawWorkbench(page, fixture);
      break;
    case "cabinet":
      drawCabinet(page, fixture);
      break;
    case "compressor":
      drawCompressor(page, fixture);
      break;
    case "fire-extinguisher":
      drawFireExtinguisher(page, fixture);
      break;
    case "floor-drain":
      drawFloorDrain(page, fixture);
      break;
    case "locker":
      drawLocker(page, fixture);
      break;
    default:
      break;
  }
}

function drawFixtures(page, fixtures) {
  for (const fixture of fixtures) drawFixture(page, fixture);
}

function drawRack(page, rack) {
  const x = P(rack.x, rack.y).x;
  const y = P(rack.x, rack.y).y;
  const w = M(rack.w);
  const h = M(rack.h);
  rect(page, x, y, w, h, { fill: C.pale, border: C.mid, borderWidth: 0.45 });
  for (let index = 1; index < rack.bays; index += 1) {
    const cx = x + (w * index) / rack.bays;
    line(page, cx, y, cx, y + h, { width: 0.3, color: C.mid });
  }
  line(page, x, y + h / 2, x + w, y + h / 2, { width: 0.25, color: C.faint });
  if (rack.label) {
    text(page, rack.label, x + w / 2, y + h + 4, {
      size: 5.4,
      color: C.mid,
      align: "center",
      fontRef: bold,
    });
  }
}

function drawPallet(page, pallet) {
  const x = P(pallet.x, pallet.y).x;
  const y = P(pallet.x, pallet.y).y;
  const w = M(pallet.w);
  const h = M(pallet.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.35 });
  for (let index = 1; index < 4; index += 1) {
    line(page, x, y + (h * index) / 4, x + w, y + (h * index) / 4, {
      width: 0.22,
      color: C.faint,
    });
  }
}

function drawForklift(page, forklift) {
  const x = P(forklift.x, forklift.y).x;
  const y = P(forklift.x, forklift.y).y;
  const w = M(forklift.w);
  const h = M(forklift.h);
  rect(page, x + w * 0.18, y + h * 0.18, w * 0.55, h * 0.64, {
    border: C.mid,
    borderWidth: 0.45,
  });
  rect(page, x + w * 0.08, y + h * 0.32, w * 0.18, h * 0.36, {
    border: C.mid,
    borderWidth: 0.35,
  });
  line(page, x + w * 0.86, y + h * 0.2, x + w * 0.86, y + h * 0.8, {
    width: 1.1,
    color: C.mid,
  });
  line(page, x + w * 0.86, y + h * 0.2, x + w, y + h * 0.2, { width: 0.5, color: C.mid });
  line(page, x + w * 0.86, y + h * 0.8, x + w, y + h * 0.8, { width: 0.5, color: C.mid });
  circle(page, x + w * 0.2, y + h * 0.12, M(0.16), { border: C.mid, borderWidth: 0.3 });
  circle(page, x + w * 0.66, y + h * 0.12, M(0.16), { border: C.mid, borderWidth: 0.3 });
}

function drawStaging(page, staging) {
  const x = P(staging.x, staging.y).x;
  const y = P(staging.x, staging.y).y;
  const w = M(staging.w);
  const h = M(staging.h);
  rect(page, x, y, w, h, {
    border: C.mid,
    borderWidth: 0.45,
    dash: [5, 3],
  });
  text(page, staging.label, x + w / 2, y + h / 2 - 2, {
    size: 6,
    color: C.mid,
    align: "center",
    fontRef: bold,
  });
}

function drawDimension(page, dimension) {
  const color = C.mid;
  const tick = M(0.32);
  if (dimension.type === "h") {
    const y = P(dimension.x1, dimension.y).y;
    const x1 = P(dimension.x1, dimension.y).x;
    const x2 = P(dimension.x2, dimension.y).x;
    line(page, x1, y, x2, y, { width: 0.45, color });
    line(page, x1 - tick, y - tick, x1 + tick, y + tick, { width: 0.45, color });
    line(page, x2 - tick, y - tick, x2 + tick, y + tick, { width: 0.45, color });
    line(page, x1, y, x1, y + M(0.8), { width: 0.3, color: C.faint });
    line(page, x2, y, x2, y + M(0.8), { width: 0.3, color: C.faint });
    text(page, dimension.label, (x1 + x2) / 2, y + 4.2, {
      size: 6.6,
      color,
      align: "center",
      fontRef: bold,
    });
  } else {
    const x = P(dimension.x, dimension.y1).x;
    const y1 = P(dimension.x, dimension.y1).y;
    const y2 = P(dimension.x, dimension.y2).y;
    line(page, x, y1, x, y2, { width: 0.45, color });
    line(page, x - tick, y1 - tick, x + tick, y1 + tick, { width: 0.45, color });
    line(page, x - tick, y2 - tick, x + tick, y2 + tick, { width: 0.45, color });
    line(page, x, y1, x - M(0.8), y1, { width: 0.3, color: C.faint });
    line(page, x, y2, x - M(0.8), y2, { width: 0.3, color: C.faint });
    text(page, dimension.label, x - 4.2, (y1 + y2) / 2 - 2, {
      size: 6.6,
      color,
      align: "center",
      rotate: 90,
      fontRef: bold,
    });
  }
}

function drawCalibration(page, calibration) {
  const p1 = P(calibration.p1.x, calibration.p1.y);
  const p2 = P(calibration.p2.x, calibration.p2.y);
  const tick = M(0.32);
  line(page, p1.x, p1.y, p2.x, p2.y, { width: 1.1, color: C.teal, dash: [8, 4] });
  line(page, p1.x, p1.y - tick, p1.x, p1.y + tick, { width: 0.8, color: C.teal });
  line(page, p2.x, p2.y - tick, p2.x, p2.y + tick, { width: 0.8, color: C.teal });
  text(page, calibration.label, (p1.x + p2.x) / 2, p1.y + 5, {
    size: 6.8,
    color: C.teal,
    align: "center",
    fontRef: bold,
  });
}

function drawNorthArrow(page, x, y, size = 24) {
  line(page, x, y - size, x, y + size, { width: 1.1, color: C.ink });
  line(page, x, y + size, x - size * 0.32, y + size * 0.32, { width: 1.1, color: C.ink });
  line(page, x, y + size, x + size * 0.32, y + size * 0.32, { width: 1.1, color: C.ink });
  circle(page, x, y + size, size * 0.32, { fill: C.paper, border: C.ink, borderWidth: 0.5 });
  text(page, "N", x, y + size - 3.2, { size: 8, fontRef: bold, align: "center" });
}

function drawScaleBar(page, x, y, metreScale, label) {
  const widths = [1, 1, 2, 5];
  let cursor = x;
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index] * metreScale;
    rect(page, cursor, y, width, 4, {
      fill: index % 2 === 0 ? C.ink : C.paper,
      border: C.ink,
      borderWidth: 0.35,
    });
    cursor += width;
  }
  text(page, "0", x, y - 7, { size: 5.2, color: C.mid, align: "center" });
  text(page, "1", x + metreScale, y - 7, { size: 5.2, color: C.mid, align: "center" });
  text(page, "2", x + metreScale * 2, y - 7, { size: 5.2, color: C.mid, align: "center" });
  text(page, "5", x + metreScale * 5, y - 7, { size: 5.2, color: C.mid, align: "center" });
  text(page, label, x, y + 8, { size: 5.6, color: C.mid, fontRef: bold });
}

function drawTree(page, x, y, radius, color = C.faint) {
  circle(page, x, y, radius, { border: color, borderWidth: 0.35 });
  circle(page, x + radius * 0.45, y + radius * 0.2, radius * 0.6, {
    border: color,
    borderWidth: 0.25,
  });
  circle(page, x - radius * 0.4, y + radius * 0.25, radius * 0.5, {
    border: color,
    borderWidth: 0.25,
  });
}

function drawStair(page, stair) {
  const x = P(stair.x, stair.y).x;
  const y = P(stair.x, stair.y).y;
  const w = M(stair.w);
  const h = M(stair.h);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.5 });
  const steps = 9;
  for (let index = 1; index < steps; index += 1) {
    line(page, x, y + (h * index) / steps, x + w, y + (h * index) / steps, {
      width: 0.3,
      color: C.mid,
    });
  }
  line(page, x + w / 2, y + 4, x + w / 2, y + h - 4, { width: 0.5, color: C.mid });
  line(page, x + w / 2, y + h - 6, x + w / 2 - 3, y + h - 12, { width: 0.5, color: C.mid });
  line(page, x + w / 2, y + h - 6, x + w / 2 + 3, y + h - 12, { width: 0.5, color: C.mid });
  text(page, "UP", x + w / 2 + 8, y + h - 10, { size: 5, color: C.mid, rotate: 90 });
}

function drawRailing(page, railing) {
  const a = P(railing.x1, railing.y1);
  const b = P(railing.x2, railing.y2);
  line(page, a.x, a.y, b.x, b.y, { width: 0.9, color: C.ink });
  line(page, a.x + 2, a.y - 2, b.x + 2, b.y - 2, { width: 0.45, color: C.mid });
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const count = Math.max(1, Math.floor(length / 14));
  for (let index = 0; index <= count; index += 1) {
    const t = index / count;
    circle(page, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 1.15, {
      fill: C.paper,
      border: C.mid,
      borderWidth: 0.35,
    });
  }
}

function drawPackingArea(page) {
  const x = P(12.5, 2.0).x;
  const y = P(12.5, 2.0).y;
  const w = M(7.2);
  const h = M(6.0);
  rect(page, x, y, w, h, { border: C.mid, borderWidth: 0.4, dash: [5, 4] });
  text(page, "PACKING / ASSEMBLY", x + w / 2, y + h - 9, {
    size: 5.8,
    color: C.mid,
    align: "center",
    fontRef: bold,
  });
  for (const [dx, dy] of [
    [0.6, 1.0],
    [3.7, 1.0],
    [0.6, 3.2],
    [3.7, 3.2],
  ]) {
    const bx = x + M(dx);
    const by = y + M(dy);
    rect(page, bx, by, M(2.3), M(0.8), { border: C.mid, borderWidth: 0.4 });
    line(page, bx + 4, by + M(0.55), bx + M(2.3) - 4, by + M(0.55), {
      width: 0.25,
      color: C.faint,
    });
  }
  text(page, "GOODS OUT", x + w / 2, y + 8, {
    size: 5.2,
    color: C.faint,
    align: "center",
  });
}

function drawWorkshopDetail(page) {
  // Welding screen and a second bench.
  rect(page, P(23.5, 13.0).x, P(23.5, 13.0).y, M(2.0), M(1.5), {
    border: C.mid,
    borderWidth: 0.4,
    dash: [4, 3],
  });
  text(page, "WELDING", P(24.5, 13.25).x, P(24.5, 13.25).y, {
    size: 5,
    color: C.mid,
    align: "center",
  });
  rect(page, P(23.2, 18.3).x, P(23.2, 18.3).y, M(3.2), M(0.7), {
    border: C.mid,
    borderWidth: 0.4,
  });
  for (let index = 1; index < 4; index += 1) {
    line(
      page,
      P(23.2 + index * 0.8, 18.3).x,
      P(23.2 + index * 0.8, 18.3).y,
      P(23.2 + index * 0.8, 19.0).x,
      P(23.2 + index * 0.8, 19.0).y,
      {
        width: 0.25,
        color: C.faint,
      },
    );
  }
  // Parts rack.
  rect(page, P(32.0, 15.8).x, P(32.0, 15.8).y, M(1.1), M(2.2), {
    fill: C.pale,
    border: C.mid,
    borderWidth: 0.4,
  });
  for (let index = 1; index < 4; index += 1) {
    line(
      page,
      P(32.0, 15.8 + index * 0.55).x,
      P(32.0, 15.8 + index * 0.55).y,
      P(33.1, 15.8 + index * 0.55).x,
      P(33.1, 15.8 + index * 0.55).y,
      {
        width: 0.25,
        color: C.mid,
      },
    );
  }
  // Overhead crane rail.
  line(page, P(23.2, 14.7).x, P(23.2, 14.7).y, P(33.2, 14.7).x, P(33.2, 14.7).y, {
    width: 0.5,
    color: C.mid,
    dash: [6, 4],
  });
  text(page, "CRANE 5 t", P(28.2, 15.0).x, P(28.2, 15.0).y, {
    size: 5.2,
    color: C.mid,
    align: "center",
  });
}

function drawLocationKey(page) {
  const x = 40;
  const y = 712;
  const w = 210;
  const h = 90;
  rect(page, x, y, w, h, { fill: C.paper, border: C.mid, borderWidth: 0.5 });
  text(page, "LOCATION KEY · N.T.S.", x + 8, y + h - 12, {
    size: 5.5,
    color: C.mid,
    fontRef: bold,
  });
  // Schematic roads.
  line(page, x + 8, y + 40, x + w - 8, y + 40, { width: 0.8, color: C.mid });
  line(page, x + 92, y + 10, x + 92, y + h - 20, { width: 0.8, color: C.mid });
  line(page, x + 8, y + 58, x + w - 8, y + 58, { width: 0.35, color: C.faint });
  // Site block.
  rect(page, x + 126, y + 31, 38, 24, { fill: C.ink });
  text(page, "SITE", x + 145, y + 40, {
    size: 5.2,
    color: C.paper,
    align: "center",
    fontRef: bold,
  });
  text(page, "NORTHGATE LOGISTICS HUB", x + 8, y + 10, { size: 5, color: C.mid });
  drawNorthArrow(page, x + 188, y + 58, 10);
}

function drawFloorPlan() {
  const page = doc.addPage([SHEET.width, SHEET.height]);
  sheet(page, { sheet: "A-101", title: "GROUND FLOOR PLAN", scale: "1:100" });
  borderTicks(page);
  gridLines(page);
  gridBubbles(page);

  // Warehouse floor markings.
  line(page, P(11.4, 1.2).x, P(11.4, 1.2).y, P(11.4, 15.8).x, P(11.4, 15.8).y, {
    width: 0.55,
    color: C.mid,
    dash: [7, 5],
  });
  text(page, "FORKLIFT AISLE", P(11.9, 9.0).x, P(11.9, 9.0).y, {
    size: 5.5,
    color: C.mid,
    rotate: 90,
  });
  line(page, P(2.4, 2.0).x, P(2.4, 2.0).y, P(2.4, 15.0).x, P(2.4, 15.0).y, {
    width: 0.4,
    color: C.faint,
    dash: [4, 4],
  });
  line(page, P(2.4, 15.0).x, P(2.4, 15.0).y, P(8.0, 15.0).x, P(8.0, 15.0).y, {
    width: 0.4,
    color: C.faint,
    dash: [4, 4],
  });

  drawBuildingWalls(page);
  for (const rack of PLAN.racks) drawRack(page, rack);
  for (const pallet of PLAN.pallets) drawPallet(page, pallet);
  drawStaging(page, PLAN.staging);
  drawForklift(page, PLAN.forklift);
  drawPackingArea(page);
  drawWorkshopDetail(page);
  drawFixtures(page, PLAN.fixtures);
  text(page, "MAIN ENTRANCE", P(24.2, -0.7).x, P(24.2, -0.7).y, {
    size: 5.2,
    color: C.teal,
    align: "center",
    fontRef: bold,
  });

  drawRoomLabels(page, PLAN.rooms, P, PLAN.scalePpm);
  for (const dimension of PLAN.dimensions) drawDimension(page, dimension);
  drawCalibration(page, PLAN.calibration);

  drawNorthArrow(page, 1138, 742, 13);

  // A small key keeps the sheet readable without a legend page.
  const keyX = 30;
  const keyY = 610;
  text(page, "KEY", keyX, keyY + 34, { size: 6.2, fontRef: bold, color: C.mid });
  line(page, keyX, keyY + 26, keyX + 22, keyY + 26, { width: 0.8, color: C.mid });
  text(page, "DOOR / SWING", keyX + 28, keyY + 24, { size: 5.2, color: C.mid });
  line(page, keyX, keyY + 16, keyX + 22, keyY + 16, { width: 0.5, color: C.ink });
  line(page, keyX, keyY + 13, keyX + 22, keyY + 13, { width: 0.5, color: C.ink });
  text(page, "WINDOW", keyX + 28, keyY + 12, { size: 5.2, color: C.mid });
  rect(page, keyX, keyY + 1, 10, 6, { fill: C.wall });
  text(page, "WALL", keyX + 28, keyY + 2, { size: 5.2, color: C.mid });

  return page;
}

function drawMezzVoid(page, project, metre) {
  const a = project(18.5, 12);
  const b = project(22, 22);
  const width = b.x - a.x;
  const height = b.y - a.y;
  rect(page, a.x, a.y, width, height, { fill: C.pale, opacity: 0.3 });
  const step = metre(1.9);
  for (let offset = -height; offset < width; offset += step) {
    const ax = a.x + Math.max(0, offset);
    const ay = a.y + Math.max(0, -offset);
    const bx = a.x + Math.min(width, offset + height);
    const by = a.y + Math.min(height, width - offset);
    if (bx > ax && by > ay) {
      line(page, ax, ay, bx, by, { width: 0.35, color: C.faint, opacity: 0.8 });
    }
  }
  text(page, "OPEN TO WAREHOUSE BELOW", project(20.2, 16.8).x, project(20.2, 16.8).y, {
    size: 8.5,
    color: C.faint,
    fontRef: bold,
    rotate: 90,
  });
  text(page, "GROUND FLOOR BELOW", project(19.3, 16.8).x, project(19.3, 16.8).y, {
    size: 5.4,
    color: C.faint,
    rotate: 90,
  });

  // A simple break line indicates that the warehouse continues beyond the view.
  const breakX = project(18.5, 0).x;
  const top = project(18.5, 22).y;
  const bottom = project(18.5, 12).y;
  line(page, breakX, bottom, breakX, top, { width: 0.45, color: C.mid });
  for (let y = bottom + 20; y < top - 10; y += 38) {
    line(page, breakX - 5, y - 5, breakX + 5, y + 5, { width: 0.45, color: C.mid });
  }
}

function drawMezzaninePlan() {
  const project = (x, y) => ({
    x: MEZZANINE.origin.x + (x - 22) * MEZZANINE.scalePpm,
    y: MEZZANINE.origin.y + (y - 12) * MEZZANINE.scalePpm,
  });
  const metre = (value) => value * MEZZANINE.scalePpm;

  const page = doc.addPage([SHEET.width, SHEET.height]);
  sheet(page, { sheet: "A-102", title: "MEZZANINE PLAN", scale: "1:50" });
  borderTicks(page);

  drawMezzVoid(page, project, metre);
  rect(page, project(22, 12).x, project(22, 12).y, metre(12), metre(10), {
    fill: C.paper,
  });

  withProject(project, metre, () => {
    for (const wall of MEZZANINE.shellWalls.horizontal) drawWallX(page, wall);
    for (const wall of MEZZANINE.shellWalls.vertical) drawWallY(page, wall);
    for (const wall of MEZZANINE.walls.horizontal) drawWallX(page, wall);
    for (const wall of MEZZANINE.walls.vertical) drawWallY(page, wall);
    for (const railing of MEZZANINE.railing) drawRailing(page, railing);
    drawStair(page, MEZZANINE.stair);
    drawFixtures(page, MEZZANINE.fixtures);
    drawRoomLabels(page, MEZZANINE.rooms, project, PLAN.scalePpm);
    for (const dimension of MEZZANINE.dimensions) drawDimension(page, dimension);
    drawCalibration(page, MEZZANINE.calibration);
  });

  text(page, "MEZZANINE FLOOR · 120 m²", project(28, 22.75).x, project(28, 22.75).y, {
    size: 8,
    color: C.ink,
    align: "center",
    fontRef: bold,
  });

  // Notes and key in the free right-hand margin.
  const notesX = 1070;
  const notesY = 540;
  text(page, "MEZZANINE NOTES", notesX, notesY, { size: 8, fontRef: bold });
  line(page, notesX, notesY - 4, notesX + 82, notesY - 4, { width: 0.35, color: C.mid });
  const notes = [
    "FLOOR AREA 120 m²",
    "STAIR VOID 9 m²",
    "CLEAR HEIGHT 2.8 m",
    "GLASS RAILING TO WAREHOUSE",
    "SCALE 1:50",
  ];
  notes.forEach((note, index) => {
    text(page, note, notesX, notesY - 18 - index * 12, { size: 5.4, color: C.mid });
  });

  const keyX = 30;
  const keyY = 610;
  text(page, "KEY", keyX, keyY + 34, { size: 6.2, fontRef: bold, color: C.mid });
  line(page, keyX, keyY + 26, keyX + 22, keyY + 26, { width: 0.8, color: C.mid });
  text(page, "DOOR / SWING", keyX + 28, keyY + 24, { size: 5.2, color: C.mid });
  line(page, keyX, keyY + 16, keyX + 22, keyY + 16, { width: 0.5, color: C.ink });
  line(page, keyX, keyY + 13, keyX + 22, keyY + 13, { width: 0.5, color: C.ink });
  text(page, "WINDOW", keyX + 28, keyY + 12, { size: 5.2, color: C.mid });
  rect(page, keyX, keyY + 1, 10, 6, { fill: C.wall });
  text(page, "WALL", keyX + 28, keyY + 2, { size: 5.2, color: C.mid });

  drawNorthArrow(page, 1110, 690, 22);
  return page;
}

function drawSitePlan() {
  const page = doc.addPage([SHEET.width, SHEET.height]);
  sheet(page, { sheet: "A-103", title: "SITE PLAN", scale: "1:400" });
  borderTicks(page);

  const boundary = SITE.boundary;
  const bx = SP(0, 0);
  const bw = SM(boundary.w);
  const bh = SM(boundary.d);

  // Site boundary and access gate.
  line(page, bx.x, bx.y, bx.x + bw, bx.y, { width: 1.1, color: C.ink });
  line(page, bx.x + bw, bx.y, bx.x + bw, bx.y + bh, { width: 1.1, color: C.ink });
  line(page, bx.x + bw, bx.y + bh, bx.x, bx.y + bh, { width: 1.1, color: C.ink });
  line(page, bx.x, bx.y + bh, bx.x, bx.y, { width: 1.1, color: C.ink });
  // Gate at access road.
  line(page, SP(46, 0).x, bx.y, SP(54, 0).x, bx.y, { width: 2.4, color: C.paper });
  line(page, SP(46, 0).x, bx.y - 4, SP(54, 0).x, bx.y - 4, { width: 0.5, color: C.mid });
  text(page, "SITE ACCESS", SP(50, -2.4).x, SP(50, -2.4).y, {
    size: 6,
    color: C.mid,
    align: "center",
    fontRef: bold,
  });

  // Access road.
  const road = SITE.accessRoad;
  line(page, SP(road.x, 0).x, SP(road.x, 0).y, SP(road.x, road.h).x, SP(road.x, road.h).y, {
    width: 0.7,
    color: C.mid,
  });
  line(
    page,
    SP(road.x + road.w, 0).x,
    SP(road.x + road.w, 0).y,
    SP(road.x + road.w, road.h).x,
    SP(road.x + road.w, road.h).y,
    {
      width: 0.7,
      color: C.mid,
    },
  );
  line(
    page,
    SP(road.x + road.w / 2, 1).x,
    SP(road.x + road.w / 2, 1).y,
    SP(road.x + road.w / 2, road.h - 1).x,
    SP(road.x + road.w / 2, road.h - 1).y,
    {
      width: 0.4,
      color: C.mid,
      dash: [7, 5],
    },
  );
  text(page, "ACCESS ROAD", SP(road.x - 1.8, 12).x, SP(road.x - 1.8, 12).y, {
    size: 6,
    color: C.mid,
    rotate: 90,
    fontRef: bold,
  });

  // Truck yard and turning envelope.
  const yard = SITE.truckYard;
  rect(page, SP(yard.x, yard.y).x, SP(yard.x, yard.y).y, SM(yard.w), SM(yard.h), {
    border: C.mid,
    borderWidth: 0.4,
    dash: [5, 4],
  });
  circle(page, SP(17, 20).x, SP(17, 20).y, SM(12), {
    border: C.faint,
    borderWidth: 0.5,
    dash: [7, 5],
  });
  text(page, "TRUCK TURNING ENVELOPE", SP(17, 15).x, SP(17, 15).y, {
    size: 5.5,
    color: C.mid,
    align: "center",
  });
  text(page, "TRUCK YARD", SP(17, 4.2).x, SP(17, 4.2).y, {
    size: 7,
    color: C.mid,
    align: "center",
    fontRef: bold,
  });

  // Building footprint.
  const building = SITE.building;
  rect(
    page,
    SP(building.x, building.y).x,
    SP(building.x, building.y).y,
    SM(building.w),
    SM(building.d),
    {
      fill: C.pale,
      border: C.ink,
      borderWidth: 1.2,
    },
  );
  line(
    page,
    SP(building.x + 20, building.y).x,
    SP(building.x + 20, building.y).y,
    SP(building.x + 20, building.y + 11).x,
    SP(building.x + 20, building.y + 11).y,
    {
      width: 0.5,
      color: C.mid,
    },
  );
  line(
    page,
    SP(building.x + 20, building.y + 11).x,
    SP(building.x + 20, building.y + 11).y,
    SP(building.x + building.w, building.y + 11).x,
    SP(building.x + building.w, building.y + 11).y,
    {
      width: 0.5,
      color: C.mid,
    },
  );
  text(
    page,
    "WAREHOUSE",
    SP(building.x + 10, building.y + 13).x,
    SP(building.x + 10, building.y + 13).y,
    {
      size: 7,
      fontRef: bold,
      align: "center",
    },
  );
  text(
    page,
    "OFFICE",
    SP(building.x + 26, building.y + 6).x,
    SP(building.x + 26, building.y + 6).y,
    {
      size: 6.5,
      fontRef: bold,
      align: "center",
    },
  );
  text(
    page,
    "484 m²",
    SP(building.x + 10, building.y + 10.8).x,
    SP(building.x + 10, building.y + 10.8).y,
    {
      size: 5.5,
      color: C.mid,
      align: "center",
    },
  );
  text(
    page,
    "144 m²",
    SP(building.x + 26, building.y + 4.2).x,
    SP(building.x + 26, building.y + 4.2).y,
    {
      size: 5.2,
      color: C.mid,
      align: "center",
    },
  );

  // Dock doors and canopy.
  for (const bay of PLAN.loadingBays) {
    const y1 = building.y + bay.y1;
    const y2 = building.y + bay.y2;
    const y = (y1 + y2) / 2;
    rect(
      page,
      SP(building.x - 0.9, y1 - 0.4).x,
      SP(building.x - 0.9, y1 - 0.4).y,
      SM(1.8),
      SM(y2 - y1 + 0.8),
      {
        border: C.mid,
        borderWidth: 0.45,
        dash: [4, 3],
      },
    );
    rect(page, SP(building.x - 0.18, y1).x, SP(building.x - 0.18, y1).y, SM(0.36), SM(y2 - y1), {
      fill: C.ink,
    });
  }
  // Articulated vehicle positions at the loading bays.
  for (const bay of PLAN.loadingBays) {
    const centre = building.y + (bay.y1 + bay.y2) / 2;
    const truckY = centre - 1.25;
    rect(
      page,
      SP(building.x - 16.5, truckY).x,
      SP(building.x - 16.5, truckY).y,
      SM(14.2),
      SM(2.5),
      {
        border: C.mid,
        borderWidth: 0.4,
        dash: [5, 4],
      },
    );
    rect(
      page,
      SP(building.x - 18.0, truckY + 0.35).x,
      SP(building.x - 18.0, truckY + 0.35).y,
      SM(1.5),
      SM(1.8),
      {
        border: C.mid,
        borderWidth: 0.4,
        dash: [4, 3],
      },
    );
    line(
      page,
      SP(building.x - 16.5, centre).x,
      SP(building.x - 16.5, centre).y,
      SP(building.x, centre).x,
      SP(building.x, centre).y,
      {
        width: 0.35,
        color: C.faint,
        dash: [3, 3],
      },
    );
    text(
      page,
      "TRUCK",
      SP(building.x - 9.5, centre + 0.2).x,
      SP(building.x - 9.5, centre + 0.2).y,
      {
        size: 4.2,
        color: C.mid,
        align: "center",
      },
    );
  }

  text(page, "LOADING BAYS", SP(building.x - 4.5, 27).x, SP(building.x - 4.5, 27).y, {
    size: 5.4,
    color: C.mid,
    rotate: 90,
    fontRef: bold,
  });

  // Main entrance.
  line(
    page,
    SP(building.x + 26, building.y).x,
    SP(building.x + 26, building.y).y,
    SP(building.x + 26, building.y - 5).x,
    SP(building.x + 26, building.y - 5).y,
    {
      width: 0.8,
      color: C.teal,
    },
  );
  line(
    page,
    SP(building.x + 26, building.y - 5).x,
    SP(building.x + 26, building.y - 5).y,
    SP(building.x + 24.5, building.y - 3.2).x,
    SP(building.x + 26, building.y - 5).y,
    {
      width: 0.8,
      color: C.teal,
    },
  );
  text(
    page,
    "MAIN ENTRANCE",
    SP(building.x + 26, building.y - 7).x,
    SP(building.x + 26, building.y - 7).y,
    {
      size: 5.4,
      color: C.teal,
      align: "center",
    },
  );

  // Car park.
  const park = SITE.carPark;
  text(
    page,
    "CAR PARK · 12 SPACES",
    SP(park.x + park.w / 2, park.y + park.h + 2.2).x,
    SP(park.x + park.w / 2, park.y + park.h + 2.2).y,
    {
      size: 6.5,
      color: C.mid,
      align: "center",
      fontRef: bold,
    },
  );
  for (let row = 0; row < 3; row += 1) {
    const rowY = park.y + row * 8;
    for (let stall = 0; stall < 4; stall += 1) {
      const stallX = park.x + 2 + stall * 6;
      rect(page, SP(stallX, rowY).x, SP(stallX, rowY).y, SM(2.5), SM(5), {
        border: C.mid,
        borderWidth: 0.35,
      });
      line(
        page,
        SP(stallX + 1.25, rowY).x,
        SP(stallX + 1.25, rowY).y,
        SP(stallX + 1.25, rowY + 2.5).x,
        SP(stallX + 1.25, rowY + 2.5).y,
        {
          width: 0.3,
          color: C.faint,
        },
      );
    }
  }
  // Connect the car park to the main access road.
  line(page, SP(54, 21).x, SP(54, 21).y, SP(72, 21).x, SP(72, 21).y, { width: 0.7, color: C.mid });
  line(page, SP(54, 27).x, SP(54, 27).y, SP(72, 27).x, SP(72, 27).y, { width: 0.7, color: C.mid });
  line(page, SP(54, 24).x, SP(54, 24).y, SP(72, 24).x, SP(72, 24).y, {
    width: 0.35,
    color: C.mid,
    dash: [6, 5],
  });
  text(page, "PARKING AISLE", SP(63, 25.2).x, SP(63, 25.2).y, {
    size: 4.8,
    color: C.mid,
    align: "center",
  });

  // Landscaping, pond, waste, transformer and sprinkler.
  for (const area of SITE.landscaping) {
    for (let index = 0; index < 18; index += 1) {
      const t = (index + 0.5) / 18;
      const x = area.x + 2 + t * (area.w - 4);
      const y = area.y + 2 + (index % 3) * 1.7;
      drawTree(page, SP(x, y).x, SP(x, y).y, SM(0.45 + (index % 4) * 0.08));
    }
  }
  const pond = SITE.pond;
  ellipse(
    page,
    SP(pond.x + pond.w / 2, pond.y + pond.h / 2).x,
    SP(pond.x + pond.w / 2, pond.y + pond.h / 2).y,
    SM(pond.w / 2),
    SM(pond.h / 2),
    {
      fill: C.paper,
      border: C.mid,
      borderWidth: 0.6,
    },
  );
  for (let index = 0; index < 4; index += 1) {
    line(
      page,
      SP(pond.x + 2, pond.y + 2 + index * 1.5).x,
      SP(pond.x + 2, pond.y + 2 + index * 1.5).y,
      SP(pond.x + pond.w - 2, pond.y + 2 + index * 1.5).x,
      SP(pond.x + pond.w - 2, pond.y + 2 + index * 1.5).y,
      {
        width: 0.3,
        color: C.faint,
      },
    );
  }
  text(
    page,
    "DETENTION POND",
    SP(pond.x + pond.w / 2, pond.y - 2).x,
    SP(pond.x + pond.w / 2, pond.y - 2).y,
    {
      size: 5.2,
      color: C.mid,
      align: "center",
    },
  );

  const waste = SITE.waste;
  rect(page, SP(waste.x, waste.y).x, SP(waste.x, waste.y).y, SM(waste.w), SM(waste.h), {
    border: C.mid,
    borderWidth: 0.5,
  });
  text(
    page,
    "WASTE / RECYCLING",
    SP(waste.x + waste.w / 2, waste.y + waste.h / 2 - 2).x,
    SP(waste.x + waste.w / 2, waste.y + waste.h / 2 - 2).y,
    {
      size: 5,
      color: C.mid,
      align: "center",
    },
  );

  const transformer = SITE.transformer;
  rect(
    page,
    SP(transformer.x, transformer.y).x,
    SP(transformer.x, transformer.y).y,
    SM(transformer.w),
    SM(transformer.h),
    {
      border: C.mid,
      borderWidth: 0.5,
    },
  );
  text(
    page,
    "TRAFO",
    SP(transformer.x + transformer.w / 2, transformer.y + 1).x,
    SP(transformer.x + transformer.w / 2, transformer.y + 1).y,
    {
      size: 5,
      color: C.mid,
      align: "center",
    },
  );

  const sprinkler = SITE.sprinkler;
  circle(
    page,
    SP(sprinkler.x + sprinkler.w / 2, sprinkler.y + sprinkler.h / 2).x,
    SP(sprinkler.x + sprinkler.w / 2, sprinkler.y + sprinkler.h / 2).y,
    SM(sprinkler.w / 2),
    {
      border: C.mid,
      borderWidth: 0.5,
    },
  );
  text(
    page,
    "SPRINKLER",
    SP(sprinkler.x + sprinkler.w / 2, sprinkler.y + sprinkler.h / 2 - 2).x,
    SP(sprinkler.x + sprinkler.w / 2, sprinkler.y + sprinkler.h / 2 - 2).y,
    {
      size: 4.8,
      color: C.mid,
      align: "center",
    },
  );

  // Drainage arrows.
  for (const [x, y] of [
    [10, 8],
    [26, 8],
    [60, 8],
    [80, 45],
  ]) {
    line(page, SP(x, y).x, SP(x, y).y, SP(x + 3, y).x, SP(x + 3, y).y, {
      width: 0.5,
      color: C.mid,
    });
    line(page, SP(x + 3, y).x, SP(x + 3, y).y, SP(x + 2.2, y + 0.8).x, SP(x + 3, y).y, {
      width: 0.4,
      color: C.mid,
    });
    line(page, SP(x + 3, y).x, SP(x + 3, y).y, SP(x + 2.2, y - 0.8).x, SP(x + 3, y).y, {
      width: 0.4,
      color: C.mid,
    });
  }
  text(page, "DRAINAGE FALLS TO POND", SP(20, 6).x, SP(20, 6).y, {
    size: 5,
    color: C.mid,
  });

  withProject(SP, SM, () => {
    for (const dimension of SITE.dimensions) drawDimension(page, dimension);
    drawCalibration(page, SITE.calibration);
  });

  drawNorthArrow(page, 1090, 742, 24);
  drawScaleBar(page, 960, 620, SM(1), "SCALE 1:400");
  drawLocationKey(page);

  // Site notes and schedule.
  const notesX = 960;
  const notesY = 560;
  text(page, "SITE NOTES", notesX, notesY, { size: 8, fontRef: bold });
  line(page, notesX, notesY - 4, notesX + 200, notesY - 4, { width: 0.35, color: C.mid });
  const notes = [
    "1. SITE AREA 7,920 m². BUILDING FOOTPRINT 748 m².",
    "2. ACCESS ROAD 8.0 m WIDE, DESIGNED FOR 16.5 m ARTICULATED VEHICLES.",
    "3. TRUCK YARD AND TURNING ENVELOPE KEPT CLEAR AT ALL TIMES.",
    "4. ATTENUATION POND AND DRAINAGE TO BE VERIFIED BY CIVIL ENGINEER.",
    "5. LANDSCAPING AND FENCING BY SITE CONTRACTOR.",
  ];
  notes.forEach((note, index) => {
    text(page, note, notesX, notesY - 18 - index * 12, { size: 5.4, color: C.mid });
  });

  text(page, "AREA SCHEDULE", notesX, notesY - 92, { size: 8, fontRef: bold });
  line(page, notesX, notesY - 96, notesX + 200, notesY - 96, { width: 0.35, color: C.mid });
  const schedule = [
    ["SITE AREA", "7,920 m²"],
    ["BUILDING FOOTPRINT", "748 m²"],
    ["WAREHOUSE", "484 m²"],
    ["OFFICE", "144 m²"],
    ["WORKSHOP", "120 m²"],
    ["CAR PARK", "12 SPACES"],
    ["LOADING BAYS", "2"],
  ];
  schedule.forEach(([label, value], index) => {
    const y = notesY - 110 - index * 11;
    text(page, label, notesX, y, { size: 5.4, color: C.mid });
    text(page, value, notesX + 200, y, { size: 5.4, color: C.ink, align: "right", fontRef: bold });
    line(page, notesX, y - 3, notesX + 200, y - 3, { width: 0.2, color: C.faint });
  });

  return page;
}

drawFloorPlan();
drawMezzaninePlan();
drawSitePlan();

const bytes = await doc.save();
await mkdir(outputDir, { recursive: true });
await writeFile(output, bytes);
console.log(
  `Wrote ${output} (${bytes.length.toLocaleString()} bytes, ${doc.getPageCount()} pages)`,
);
