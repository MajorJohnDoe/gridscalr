import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeSummary } from "../src/features/schedules";
import { parseProject } from "../src/io/projectFile";
import { SCHEMA_VERSION } from "../src/model/types";

describe("documentation demo project", () => {
  const project = parseProject(
    readFileSync(new URL("../fixtures/demo-project.gridscalr", import.meta.url), "utf8"),
  );

  it("parses and keeps all three sheets and their calibrations", () => {
    expect(project.name).toBe("Northgate Logistics Hub - Takeoff");
    expect(project.schemaVersion).toBe(SCHEMA_VERSION);
    expect(project.settings.smartLengthUnits).toBe(true);
    expect(project.documents).toHaveLength(2);
    expect(project.documents[0].name).toBe("industrial-plan.pdf");
    expect(project.documents[0].pageCount).toBe(3);
    expect(project.documents[1].kind).toBe("template");
    expect(project.documents[1].template?.id).toBe("gridscalr.operation-card.frame");
    expect(project.pages[0].state.name).toBe("Ground floor");
    expect(project.pages[1].state.name).toBe("Mezzanine");
    expect(project.pages[2].state.name).toBe("Site plan");
    expect(project.pages[3].state.name).toBe("LB01");
    expect(project.pages[0].state.building).toBe("Northgate");
    expect(project.pages[1].state.floor).toBe("Mezzanine");
    expect(project.markupsViews.map((view) => view.name)).toEqual([
      "Room review",
      "Drawing checks",
      "Symbols & status",
    ]);
    expect(project.pages[0].state.calibration?.pointsPerMeter).toBeCloseTo(28.3464567, 4);
    expect(project.pages[1].state.calibration?.source).toBe("manual");
    expect(project.pages[1].state.calibration?.pointsPerMeter).toBeCloseTo(56.6929134, 4);
    expect(project.pages[2].state.calibration?.source).toBe("manual");
    expect(project.pages[2].state.calibration?.pointsPerMeter).toBeCloseTo(7.08661417, 5);
  });

  it("contains the measurement and drawing samples used by the screenshots", () => {
    const measure = project.layers.find((layer) => layer.kind === "measure");
    const draw = project.layers.find((layer) => layer.kind === "draw");
    expect(measure?.items).toHaveLength(14);
    expect(draw?.items).toHaveLength(14);
    expect(measure?.items.some((item) => item.areaMode === "subtract")).toBe(true);
    expect(measure?.items.some((item) => item.kind === "count")).toBe(true);
    expect(measure?.items.some((item) => item.pageId === project.pages[2].id)).toBe(true);
    expect(draw?.items.some((item) => item.kind === "cloud")).toBe(true);
    expect(draw?.items.some((item) => item.kind === "stamp" && item.text === "INSPECTED")).toBe(
      true,
    );
    expect(draw?.items.filter((item) => item.kind === "symbol")).toHaveLength(6);
    expect(draw?.items.find((item) => item.symbolId === "egress.exit")?.status).toBe(
      "not-approved",
    );
  });

  it("ships a small property example with a derived room area and a schedule", () => {
    expect(project.fieldDefinitions.map((field) => field.key)).toEqual(["fireClass"]);
    expect(project.fieldSets.map((set) => set.name)).toEqual(["Fire data"]);
    const rooms = project.spaces.filter((space) => space.kind === "room");
    expect(rooms.map((room) => room.number)).toEqual(["101", "102"]);
    const warehouse = rooms.find((room) => room.number === "102")!;
    const linkedArea = project.layers
      .flatMap((layer) => layer.items)
      .find((item) => item.spaceId === warehouse.id);
    expect(linkedArea?.kind).toBe("area");
    expect(project.schedules).toHaveLength(1);
    expect(project.schedules[0]).toMatchObject({
      id: "sched_demo_quantities",
      source: "measurements",
    });

    const summary = computeSummary(project);
    expect(summary.roomCount).toBe(2);
    expect(summary.cards.find((card) => card.id === "rooms")?.value).toBe(2);
    expect(summary.cards.find((card) => card.id === "area")?.value).toBeGreaterThan(0);
  });

  it("includes the operation card sheet used by the template screenshots", () => {
    const cardDocument = project.documents.find((document) => document.name === "Driftkort LB01");
    expect(cardDocument?.template?.paper).toBe("A3");
    expect(cardDocument?.template?.fields["project.name"]).toBe("LB01\n");
    const cardPage = project.pages[3];
    expect(cardPage.documentId).toBe(cardDocument?.id);
    const cardLayers = project.layers.filter((layer) => layer.homePageId === cardPage.id);
    expect(cardLayers.map((layer) => layer.name)).toEqual([
      "Aggregat",
      "Uteluft -> tilluft",
      "Frånluft - > avluft",
      "Bypass - brand",
      "Mätningar",
    ]);
    const cardItems = cardLayers.flatMap((layer) => layer.items);
    expect(cardItems).toHaveLength(146);
    expect(cardItems.filter((item) => item.kind === "symbol")).toHaveLength(75);
    expect(cardItems.every((item) => item.pageId === cardPage.id)).toBe(true);
  });
});
