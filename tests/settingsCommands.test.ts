import { describe, expect, it } from "vitest";
import {
  updateProjectMetadata,
  updateProjectName,
  updateProjectSettings,
  updateReportLogo,
  updateStampPresets,
} from "../src/model/commands/settings";
import { defaultStampPresets } from "../src/model/stamps";
import { createProject, defaultDocument } from "../src/model/layers";
import type { ImageAsset, LengthUnit, MarkupItem, Project } from "../src/model/types";
import { store } from "../src/state/store";
import { pageIdFor, withTestPageIds } from "./helpers/pages";

function makeProject(): Project {
  return withTestPageIds(createProject(defaultDocument("Plan.pdf", 1)));
}

function makeAsset(id: string): ImageAsset {
  return {
    id,
    name: `${id}.png`,
    mime: "image/png",
    width: 10,
    height: 10,
    byteSize: 100,
    data: "data:image/png;base64,AAAA",
  };
}

function addImageItem(project: Project, assetId: string): MarkupItem {
  const item: MarkupItem = {
    id: `image_${assetId}`,
    pageId: pageIdFor(1),
    kind: "image",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
    ],
    color: "#000000",
    strokeWidth: 1,
    image: { assetId, mode: "annotation" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
  project.layers[0].items.push(item);
  return item;
}

describe("settings commands", () => {
  it("merges a partial settings patch and leaves unrelated settings intact", () => {
    const project = makeProject();
    const categoryId = project.settings.quantity.defaultCategoryId;
    const summary = project.settings.summary;

    updateProjectSettings(project, { showGrid: true, lengthUnit: "m", labelSize: 10 });

    expect(project.settings.showGrid).toBe(true);
    expect(project.settings.lengthUnit).toBe("m");
    expect(project.settings.labelSize).toBe(10);
    expect(project.settings.areaUnit).toBe("m2");
    expect(project.settings.snapTolerancePx).toBe(8);
    expect(project.settings.quantity.defaultCategoryId).toBe(categoryId);
    expect(project.settings.summary).toEqual(summary);
  });

  it("normalizes invalid values back to the defaults", () => {
    const project = makeProject();

    updateProjectSettings(project, {
      lengthUnit: "furlong" as LengthUnit,
      areaUnit: "acre" as unknown as Project["settings"]["areaUnit"],
      snapTolerancePx: 999,
      labelSize: Number.NaN,
      stampPresets: null as unknown as string[],
    });

    expect(project.settings.lengthUnit).toBe("mm");
    expect(project.settings.areaUnit).toBe("m2");
    expect(project.settings.snapTolerancePx).toBe(24);
    expect(project.settings.labelSize).toBe(6);
    expect(project.settings.stampPresets).toEqual(defaultStampPresets());
  });

  it("does not change anything for an empty patch", () => {
    const project = makeProject();
    const before = JSON.parse(JSON.stringify(project.settings));

    updateProjectSettings(project, {});

    expect(project.settings).toEqual(before);
  });

  it("normalizes stamp presets through the command", () => {
    const project = makeProject();

    updateStampPresets(project, ["  Approved  ", "approved", "", "Inspected"]);
    expect(project.settings.stampPresets).toEqual(["Approved", "Inspected"]);

    updateStampPresets(project, []);
    expect(project.settings.stampPresets).toEqual([]);
  });

  it("merges metadata partially and cleans every supplied field", () => {
    const project = makeProject();
    updateProjectMetadata(project, { facility: "  North   Wing ", client: "ACME" });

    expect(project.metadata.facility).toBe("North Wing");
    expect(project.metadata.client).toBe("ACME");

    updateProjectMetadata(project, {
      revision: "  A\n1 ",
      notes: "  first line\nsecond line  ",
      facility: 42 as unknown as string,
    });

    expect(project.metadata.revision).toBe("A 1");
    expect(project.metadata.notes).toBe("first line\nsecond line");
    expect(project.metadata.facility).toBe("");
    expect(project.metadata.client).toBe("ACME");
  });

  it("clears a removed logo and prunes an unused previous asset", () => {
    const project = makeProject();
    project.assets.logo_old = makeAsset("logo_old");
    project.assets.other = makeAsset("other");
    project.reportLogoAssetId = "logo_old";

    updateReportLogo(project, makeAsset("logo_new"));

    expect(project.reportLogoAssetId).toBe("logo_new");
    expect(project.assets.logo_new).toBeDefined();
    expect(project.assets.logo_old).toBeUndefined();
    expect(project.assets.other).toBeDefined();

    updateReportLogo(project, null);

    expect(project.reportLogoAssetId).toBeNull();
    expect(project.assets.logo_new).toBeUndefined();
    expect(project.assets.other).toBeDefined();
  });

  it("keeps a previous logo asset that an image item still references", () => {
    const project = makeProject();
    project.assets.logo_old = makeAsset("logo_old");
    project.reportLogoAssetId = "logo_old";
    addImageItem(project, "logo_old");

    updateReportLogo(project, makeAsset("logo_new"));

    expect(project.reportLogoAssetId).toBe("logo_new");
    expect(project.assets.logo_old).toBeDefined();
  });

  it("renames with the shared cleanup and keeps the previous name when blank", () => {
    const project = makeProject();

    expect(updateProjectName(project, "  My   Plan ")).toBe(true);
    expect(project.name).toBe("My Plan");
    expect(updateProjectName(project, "   ")).toBe(false);
    expect(project.name).toBe("My Plan");
  });

  it("applies several settings commands in one undo step", () => {
    const project = makeProject();
    store.setProject(project, null);

    store.mutate((next) => {
      updateProjectSettings(next, { showGrid: true, lengthUnit: "m" });
      updateProjectMetadata(next, { client: "ACME" });
      updateStampPresets(next, ["Approved"]);
    }, "change");

    expect(store.project!.settings.showGrid).toBe(true);
    expect(store.project!.settings.lengthUnit).toBe("m");
    expect(store.project!.metadata.client).toBe("ACME");
    expect(store.project!.settings.stampPresets).toEqual(["Approved"]);
    expect(store.canUndo).toBe(true);

    store.undo();

    expect(store.project!.settings.showGrid).toBe(false);
    expect(store.project!.settings.lengthUnit).toBe("mm");
    expect(store.project!.metadata.client).toBe("");
    expect(store.project!.settings.stampPresets).toEqual(defaultStampPresets());
    expect(store.canUndo).toBe(false);
  });
});
