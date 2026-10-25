import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProject } from "../src/io/projectFile";

describe("documentation demo project", () => {
  const project = parseProject(
    readFileSync(new URL("../fixtures/demo-project.gridscalr", import.meta.url), "utf8"),
  );

  it("parses and keeps both pages and their calibrations", () => {
    expect(project.name).toBe("Riverside House - Takeoff");
    expect(project.documents).toHaveLength(1);
    expect(project.documents[0].pageCount).toBe(2);
    expect(project.pages["1"].calibration?.pointsPerMeter).toBe(30);
    expect(project.pages["2"].calibration?.source).toBe("manual");
  });

  it("contains the measurement and drawing samples used by the screenshots", () => {
    const measure = project.layers.find((layer) => layer.kind === "measure");
    const draw = project.layers.find((layer) => layer.kind === "draw");
    expect(measure?.items).toHaveLength(9);
    expect(draw?.items).toHaveLength(6);
    expect(measure?.items.some((item) => item.areaMode === "subtract")).toBe(true);
    expect(measure?.items.some((item) => item.kind === "count")).toBe(true);
    expect(draw?.items.some((item) => item.kind === "cloud")).toBe(true);
    expect(draw?.items.some((item) => item.kind === "stamp" && item.text === "INSPECTED")).toBe(true);
  });
});
