import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseProject } from "../src/io/projectFile";

describe("documentation demo project", () => {
  const project = parseProject(
    readFileSync(new URL("../fixtures/demo-project.gridscalr", import.meta.url), "utf8"),
  );

  it("parses and keeps all three sheets and their calibrations", () => {
    expect(project.name).toBe("Northgate Logistics Hub - Takeoff");
    expect(project.documents).toHaveLength(1);
    expect(project.documents[0].name).toBe("industrial-plan.pdf");
    expect(project.documents[0].pageCount).toBe(3);
    expect(project.pages["1"].calibration?.pointsPerMeter).toBeCloseTo(28.3464567, 4);
    expect(project.pages["2"].calibration?.source).toBe("manual");
    expect(project.pages["2"].calibration?.pointsPerMeter).toBeCloseTo(56.6929134, 4);
    expect(project.pages["3"].calibration?.source).toBe("manual");
    expect(project.pages["3"].calibration?.pointsPerMeter).toBeCloseTo(7.08661417, 5);
  });

  it("contains the measurement and drawing samples used by the screenshots", () => {
    const measure = project.layers.find((layer) => layer.kind === "measure");
    const draw = project.layers.find((layer) => layer.kind === "draw");
    expect(measure?.items).toHaveLength(14);
    expect(draw?.items).toHaveLength(8);
    expect(measure?.items.some((item) => item.areaMode === "subtract")).toBe(true);
    expect(measure?.items.some((item) => item.kind === "count")).toBe(true);
    expect(measure?.items.some((item) => item.page === 3)).toBe(true);
    expect(draw?.items.some((item) => item.kind === "cloud")).toBe(true);
    expect(draw?.items.some((item) => item.kind === "stamp" && item.text === "INSPECTED")).toBe(
      true,
    );
  });
});
