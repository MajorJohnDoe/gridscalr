import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = resolve(here, "..", "fixtures");
const output = resolve(outputDir, "sample-plan.pdf");

const ink = rgb(0.11, 0.14, 0.16);
const mid = rgb(0.42, 0.47, 0.5);
const faint = rgb(0.78, 0.81, 0.82);
const teal = rgb(0.16, 0.55, 0.48);
const white = rgb(1, 1, 1);

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const bold = await doc.embedFont(StandardFonts.HelveticaBold);

function text(page, value, x, y, size = 9, color = ink, fontRef = font) {
  page.drawText(value, { x, y, size, font: fontRef, color });
}

function line(page, x1, y1, x2, y2, width = 1, color = ink) {
  page.drawLine({ start: { x: x1, y: y1 }, end: { x: x2, y: y2 }, thickness: width, color });
}

function dashed(page, x1, y1, x2, y2, color = mid) {
  const length = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.max(1, Math.floor(length / 8));
  for (let i = 0; i < steps; i += 2) {
    const t0 = i / steps;
    const t1 = Math.min(1, (i + 1) / steps);
    line(
      page,
      x1 + (x2 - x1) * t0,
      y1 + (y2 - y1) * t0,
      x1 + (x2 - x1) * t1,
      y1 + (y2 - y1) * t1,
      0.7,
      color,
    );
  }
}

function dimension(page, x1, y1, x2, y2, label, offset = 0) {
  const horizontal = Math.abs(y2 - y1) < 0.01;
  const nx = horizontal ? 0 : offset;
  const ny = horizontal ? offset : 0;
  line(page, x1, y1, x2, y2, 0.7, mid);
  line(
    page,
    x1 - (horizontal ? 0 : 4),
    y1 - (horizontal ? 4 : 0),
    x1 + (horizontal ? 0 : 4),
    y1 + (horizontal ? 4 : 0),
    0.7,
    mid,
  );
  line(
    page,
    x2 - (horizontal ? 0 : 4),
    y2 - (horizontal ? 4 : 0),
    x2 + (horizontal ? 0 : 4),
    y2 + (horizontal ? 4 : 0),
    0.7,
    mid,
  );
  const x = (x1 + x2) / 2 + nx;
  const y = (y1 + y2) / 2 + ny;
  if (horizontal) {
    text(page, label, x - label.length * 2.2, y + 4, 8, mid);
  } else {
    page.drawText(label, {
      x: x - 10,
      y: y - 2,
      size: 8,
      font,
      color: mid,
      rotate: { type: "degrees", angle: 90 },
    });
  }
}

function titleBlock(page, title, sheet) {
  line(page, 62, 44, 780, 44, 1.3);
  line(page, 62, 44, 62, 88, 1.3);
  line(page, 780, 44, 780, 88, 1.3);
  line(page, 62, 88, 780, 88, 1.3);
  text(page, "GRIDSCALR SAMPLE PROJECT", 75, 68, 9, mid, bold);
  text(page, title, 75, 53, 12, ink, bold);
  line(page, 520, 44, 520, 88, 0.8);
  line(page, 660, 44, 660, 88, 0.8);
  text(page, `SHEET ${sheet}`, 535, 63, 9, ink, bold);
  text(page, "SCALE 1:100  ·  DIMENSIONS IN METRES", 675, 63, 7, mid);
  text(page, "NOT FOR CONSTRUCTION", 675, 52, 7, mid);
}

function planPage(pageNumber) {
  const page = doc.addPage([842, 595]);
  page.drawRectangle({ x: 0, y: 0, width: 842, height: 595, color: white });
  page.drawRectangle({ x: 34, y: 34, width: 774, height: 527, borderColor: ink, borderWidth: 1.2 });
  titleBlock(page, pageNumber === 1 ? "GROUND FLOOR PLAN" : "FIRST FLOOR PLAN", String(pageNumber));

  // Drawing grid.
  for (let x = 90; x < 760; x += 50) line(page, x, 110, x, 540, 0.35, faint);
  for (let y = 110; y < 540; y += 50) line(page, 90, y, 760, y, 0.35, faint);

  if (pageNumber === 1) {
    // Outer walls.
    page.drawRectangle({
      x: 150,
      y: 180,
      width: 460,
      height: 290,
      borderColor: ink,
      borderWidth: 5,
    });
    // Inner partitions.
    line(page, 330, 180, 330, 370, 4);
    line(page, 330, 370, 610, 370, 4);
    line(page, 480, 370, 480, 470, 4);
    // Door openings.
    line(page, 150, 300, 150, 235, 7, white);
    line(page, 330, 280, 330, 225, 7, white);
    line(page, 530, 370, 585, 370, 7, white);
    // Doors.
    line(page, 150, 300, 180, 300, 0.9, ink);
    line(page, 330, 280, 355, 255, 0.9, ink);
    // Windows.
    line(page, 230, 470, 295, 470, 8, white);
    line(page, 230, 470, 295, 470, 1.4, teal);
    line(page, 520, 470, 580, 470, 8, white);
    line(page, 520, 470, 580, 470, 1.4, teal);
    line(page, 610, 230, 610, 300, 8, white);
    line(page, 610, 230, 610, 300, 1.4, teal);

    // Fixtures.
    page.drawRectangle({ x: 180, y: 200, width: 70, height: 42, borderColor: mid, borderWidth: 1 });
    page.drawRectangle({ x: 180, y: 258, width: 70, height: 42, borderColor: mid, borderWidth: 1 });
    page.drawRectangle({ x: 365, y: 195, width: 70, height: 35, borderColor: mid, borderWidth: 1 });
    page.drawEllipse({ x: 515, y: 430, xScale: 27, yScale: 27, borderColor: mid, borderWidth: 1 });
    page.drawEllipse({ x: 400, y: 300, xScale: 18, yScale: 12, borderColor: mid, borderWidth: 1 });

    // Room labels.
    text(page, "LIVING", 205, 385, 11, ink, bold);
    text(page, "6.0 × 4.5 m", 205, 372, 8, mid);
    text(page, "KITCHEN / DINING", 360, 405, 11, ink, bold);
    text(page, "8.5 × 4.0 m", 360, 392, 8, mid);
    text(page, "STUDY", 370, 330, 10, ink, bold);
    text(page, "3.0 × 3.0 m", 370, 318, 8, mid);
    text(page, "BATH", 500, 330, 10, ink, bold);
    text(page, "2.4 × 2.0 m", 500, 318, 8, mid);
    text(page, "ENTRY", 170, 255, 9, mid);

    // Known dimension: exactly 300 pt labelled 10.00 m.
    const y = 135;
    line(page, 150, 160, 150, 128, 0.6, mid);
    line(page, 450, 160, 450, 128, 0.6, mid);
    dimension(page, 150, y, 450, y, "10.00 m", 12);
    text(page, "KNOWN DIMENSION — USE FOR CALIBRATION", 238, 104, 8, teal, bold);

    dimension(page, 150, 470, 610, 470, "9.20 m", 40);
    dimension(page, 610, 180, 610, 470, "5.80 m", 42);
    text(page, "GROUND FLOOR", 98, 520, 10, mid, bold);
  } else {
    page.drawRectangle({
      x: 190,
      y: 205,
      width: 400,
      height: 270,
      borderColor: ink,
      borderWidth: 5,
    });
    line(page, 390, 205, 390, 360, 4);
    line(page, 190, 360, 590, 360, 4);
    line(page, 500, 360, 500, 475, 4);
    line(page, 190, 280, 190, 230, 7, white);
    line(page, 390, 320, 390, 270, 7, white);
    line(page, 480, 360, 535, 360, 7, white);
    line(page, 250, 475, 315, 475, 8, white);
    line(page, 250, 475, 315, 475, 1.4, teal);
    line(page, 520, 475, 575, 475, 8, white);
    line(page, 520, 475, 575, 475, 1.4, teal);

    text(page, "BEDROOM 1", 235, 400, 11, ink, bold);
    text(page, "5.0 × 4.2 m", 235, 387, 8, mid);
    text(page, "BEDROOM 2", 420, 400, 11, ink, bold);
    text(page, "4.0 × 3.8 m", 420, 387, 8, mid);
    text(page, "LANDING", 245, 310, 9, mid);
    text(page, "BATHROOM", 405, 320, 9, ink, bold);
    text(page, "2.0 × 2.0 m", 405, 308, 8, mid);
    text(page, "STORAGE", 510, 400, 9, mid);

    line(page, 190, 530, 590, 530, 0.7, mid);
    dimension(page, 190, 500, 590, 500, "8.00 m", 12);
    dimension(page, 620, 205, 620, 475, "5.40 m", 0);
    text(page, "FIRST FLOOR", 98, 520, 10, mid, bold);
  }

  // North arrow.
  line(page, 720, 500, 720, 540, 2, ink);
  page.drawLine({ start: { x: 720, y: 540 }, end: { x: 710, y: 522 }, thickness: 2, color: ink });
  page.drawLine({ start: { x: 720, y: 540 }, end: { x: 730, y: 522 }, thickness: 2, color: ink });
  text(page, "N", 715, 508, 9, ink, bold);
}

planPage(1);
planPage(2);

const bytes = await doc.save();
await mkdir(outputDir, { recursive: true });
await writeFile(output, bytes);
console.log(
  `Wrote ${output} (${bytes.length.toLocaleString()} bytes, ${doc.getPageCount()} pages)`,
);
