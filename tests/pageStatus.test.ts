// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import {
  filterPageStatusRows,
  matchesPageStatusFilter,
  PAGE_STATUS_FILTERS,
  pageStatus,
  PageStatusController,
  pageStatusAriaText,
  pageStatusBadges,
  pageStatusBadgeLabel,
  pageStatusFilterBar,
  pageStatusFilterCounts,
  pageStatusRows,
  type PageSourceState,
  type PageStatusBadge,
  type PageStatusFacts,
} from "../src/features/pageStatus";
import { applySourceReplacement } from "../src/features/pageModel";
import { createTemplateDocument } from "../src/features/schematics/model/sheetDocument";
import {
  BLANK_TEMPLATE_ID,
  DEFAULT_SHEET_TEMPLATE_ID,
} from "../src/features/schematics/model/sheetTemplate";
import { createProject, defaultDocument } from "../src/model/layers";
import type { DocumentRef, MarkupItem, OcrPage, PageRecord, Project } from "../src/model/types";
import { store } from "../src/state/store";

const NOW = "2026-01-01T00:00:00.000Z";
const SHA = "a".repeat(64);

function facts(overrides: Partial<PageStatusFacts> = {}): PageStatusFacts {
  return {
    documentKind: "pdf",
    sourceState: "ok",
    superseded: false,
    calibrated: false,
    scaleLocked: false,
    blank: false,
    template: false,
    ocrCurrent: false,
    ocrStored: false,
    itemCount: 0,
    ...overrides,
  };
}

function badgeIds(badges: readonly PageStatusBadge[]): string[] {
  return badges.map((badge) => badge.id);
}

function ocrPage(overrides: Partial<OcrPage> = {}): OcrPage {
  return {
    text: "Scanned note",
    words: [{ text: "Scanned", x: 1, y: 1, width: 20, height: 6 }],
    engine: "tesseract",
    languages: "eng+swe",
    generatedAt: NOW,
    documentSha256: SHA,
    sourcePage: 1,
    width: 595,
    height: 842,
    ...overrides,
  };
}

function record(id: string, documentId: string, localPage: number, state = {}): PageRecord {
  return { id, documentId, localPage, state };
}

function pdfDocument(pages: number, sha = SHA): DocumentRef {
  return { ...defaultDocument("Plan.pdf", pages), id: "doc_plan", sha256: sha };
}

function projectWith(documents: DocumentRef[], pages: PageRecord[]): Project {
  const project = createProject(null);
  project.documents = documents;
  project.pages = pages;
  return project;
}

function measurement(project: Project, pageId: string, id: string): MarkupItem {
  return {
    id,
    pageId,
    kind: "length",
    points: [
      { x: 10, y: 10 },
      { x: 110, y: 10 },
    ],
    color: "#4cc9f0",
    strokeWidth: 2,
    categoryId: project.settings.quantity.defaultCategoryId,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

beforeEach(() => {
  store.project = null;
  store.projectPath = null;
  store.dirty = false;
  store.readOnly = false;
  pageStatus.reset();
});

describe("page status badges", () => {
  it("shows nothing for a plain, healthy page", () => {
    expect(pageStatusBadges(facts())).toEqual([]);
  });

  it("badges a changed source file, but not an unchecked or missing one", () => {
    expect(badgeIds(pageStatusBadges(facts({ sourceState: "changed" })))).toEqual([
      "sourceChanged",
    ]);
    expect(pageStatusBadges(facts({ sourceState: "unchecked" }))).toEqual([]);
    expect(pageStatusBadges(facts({ sourceState: "missing" }))).toEqual([]);
    expect(pageStatusBadges(facts({ sourceState: "ok" }))).toEqual([]);
  });

  it("badges a superseded page", () => {
    expect(badgeIds(pageStatusBadges(facts({ superseded: true })))).toEqual(["superseded"]);
  });

  it("badges stored OCR that no longer matches the source revision", () => {
    expect(badgeIds(pageStatusBadges(facts({ ocrStored: true, ocrCurrent: false })))).toEqual([
      "ocrStale",
    ]);
    expect(
      pageStatusBadges(facts({ ocrStored: true, ocrCurrent: true, documentKind: "tiff" })),
    ).toEqual([]);
  });

  it("badges missing OCR only where a scan is provable", () => {
    expect(badgeIds(pageStatusBadges(facts({ documentKind: "tiff" })))).toEqual(["ocrMissing"]);
    // A PDF page may or may not be a scan; the badge never guesses.
    expect(pageStatusBadges(facts({ documentKind: "pdf" }))).toEqual([]);
    expect(pageStatusBadges(facts({ documentKind: "template" }))).toEqual([]);
  });

  it("badges scale lock, calibration, blank and template pages", () => {
    expect(badgeIds(pageStatusBadges(facts({ scaleLocked: true })))).toEqual(["scaleLocked"]);
    expect(badgeIds(pageStatusBadges(facts({ calibrated: true })))).toEqual(["calibrated"]);
    expect(badgeIds(pageStatusBadges(facts({ blank: true, template: true })))).toEqual(["blank"]);
    expect(badgeIds(pageStatusBadges(facts({ template: true })))).toEqual(["template"]);
  });

  it("keeps a stable order and carries the item count", () => {
    const badges = pageStatusBadges(
      facts({
        sourceState: "changed",
        superseded: true,
        ocrStored: true,
        ocrCurrent: false,
        documentKind: "tiff",
        scaleLocked: true,
        calibrated: true,
        template: true,
        itemCount: 3,
      }),
    );
    expect(badgeIds(badges)).toEqual([
      "sourceChanged",
      "superseded",
      "ocrStale",
      "scaleLocked",
      "calibrated",
      "template",
      "itemCount",
    ]);
    expect(badges.at(-1)?.count).toBe(3);
  });
});

describe("page status rows", () => {
  it("derives badges and item counts from project data only", () => {
    const project = projectWith(
      [pdfDocument(2)],
      [
        record("page_1", "doc_plan", 1, { scaleLocked: true }),
        record("page_2", "doc_plan", 2, {
          calibration: {
            id: "cal_1",
            source: "manual",
            ratio: 100,
            pointsPerMeter: 2834.65,
            createdAt: NOW,
          },
        }),
      ],
    );
    const layer = project.layers[0];
    layer.items.push(
      measurement(project, "page_1", "item_1"),
      measurement(project, "page_1", "item_2"),
    );

    const rows = pageStatusRows(project);
    expect(rows.map((row) => row.page)).toEqual([1, 2]);
    expect(badgeIds(rows[0].badges)).toEqual(["scaleLocked", "itemCount"]);
    expect(rows[0].badges.at(-1)?.count).toBe(2);
    expect(badgeIds(rows[1].badges)).toEqual(["calibrated"]);
  });

  it("marks a TIF page imported without OCR, then clears it once OCR is stored", () => {
    const tiff: DocumentRef = {
      ...defaultDocument("Scan.tif", 1),
      id: "doc_scan",
      kind: "tiff",
      sha256: SHA,
    };
    const project = projectWith([tiff], [record("page_1", "doc_scan", 1)]);
    store.project = project;
    expect(badgeIds(pageStatus.rows()[0].badges)).toEqual(["ocrMissing"]);

    store.setPageOcr("page_1", ocrPage());
    expect(pageStatus.rows()[0].badges).toEqual([]);

    // A changed source revision makes the stored OCR stale, not missing.
    project.documents[0].sha256 = "b".repeat(64);
    expect(badgeIds(pageStatus.rows()[0].badges)).toEqual(["ocrStale"]);
  });

  it("follows source replacement: superseded stays on unmapped pages only", () => {
    const project = projectWith(
      [pdfDocument(2)],
      [record("page_1", "doc_plan", 1), record("page_2", "doc_plan", 2)],
    );
    const replacement: DocumentRef = {
      ...defaultDocument("Plan rev B.pdf", 2),
      id: "doc_rev_b",
      sha256: "c".repeat(64),
    };
    applySourceReplacement(project, {
      documentId: "doc_plan",
      newDocument: replacement,
      mappings: [{ pageId: "page_1", newLocalPage: 2 }],
    });
    const rows = pageStatusRows(project);
    expect(rows[0].documentId).toBe("doc_rev_b");
    expect(badgeIds(rows[0].badges)).toEqual([]);
    expect(badgeIds(rows[1].badges)).toEqual(["superseded"]);
  });

  it("drops the superseded badge when every page is mapped", () => {
    const project = projectWith(
      [pdfDocument(2)],
      [record("page_1", "doc_plan", 1), record("page_2", "doc_plan", 2)],
    );
    applySourceReplacement(project, {
      documentId: "doc_plan",
      newDocument: {
        ...defaultDocument("Plan rev B.pdf", 2),
        id: "doc_rev_b",
        sha256: "c".repeat(64),
      },
      mappings: [
        { pageId: "page_1", newLocalPage: 1 },
        { pageId: "page_2", newLocalPage: 2 },
      ],
    });
    for (const row of pageStatusRows(project)) expect(badgeIds(row.badges)).toEqual([]);
  });

  it("marks a blank and a template sheet from their template documents", () => {
    const blank = { ...createTemplateDocument(BLANK_TEMPLATE_ID, "A3", "Blank"), id: "doc_blank" };
    const sheet = {
      ...createTemplateDocument(DEFAULT_SHEET_TEMPLATE_ID, "A3", "Operation card"),
      id: "doc_sheet",
    };
    const project = projectWith(
      [blank, sheet],
      [record("page_1", "doc_blank", 1), record("page_2", "doc_sheet", 1)],
    );
    const rows = pageStatusRows(project);
    expect(badgeIds(rows[0].badges)).toEqual(["blank"]);
    expect(badgeIds(rows[1].badges)).toEqual(["template"]);
  });

  it("reports a changed source from the monitor states without storing anything", () => {
    const project = projectWith([pdfDocument(1)], [record("page_1", "doc_plan", 1)]);
    const states = new Map<string, PageSourceState>([["doc_plan", "changed"]]);
    expect(badgeIds(pageStatusRows(project, states)[0].badges)).toEqual(["sourceChanged"]);
    expect(badgeIds(pageStatusRows(project)[0].badges)).toEqual([]);
  });
});

describe("page status filters", () => {
  const rows = pageStatusRows(
    projectWith(
      [
        pdfDocument(4),
        { ...defaultDocument("Scan.tif", 1), id: "doc_scan", kind: "tiff", sha256: SHA },
      ],
      [
        record("page_1", "doc_plan", 1),
        record("page_2", "doc_plan", 2, { scaleLocked: true }),
        record("page_3", "doc_plan", 3, { ocr: ocrPage({ documentSha256: "d".repeat(64) }) }),
        record("page_4", "doc_scan", 1),
      ],
    ),
  );
  const supersededRows = pageStatusRows(
    projectWith([{ ...pdfDocument(1), superseded: true }], [record("page_1", "doc_plan", 1)]),
  );

  it("matches each filter predicate", () => {
    const stale = rows[2].badges;
    expect(matchesPageStatusFilter(stale, "missingOcr")).toBe(true);
    expect(matchesPageStatusFilter(stale, "lockedScale")).toBe(false);
    expect(matchesPageStatusFilter(rows[1].badges, "lockedScale")).toBe(true);
    expect(matchesPageStatusFilter(rows[0].badges, "all")).toBe(true);
    expect(matchesPageStatusFilter(supersededRows[0].badges, "superseded")).toBe(true);
  });

  it("filters rows and counts every filter", () => {
    const changed = new Map<string, PageSourceState>([["doc_plan", "changed"]]);
    const changedRows = pageStatusRows(
      projectWith(
        [pdfDocument(2)],
        [record("page_1", "doc_plan", 1), record("page_2", "doc_plan", 2)],
      ),
      changed,
    );
    expect(filterPageStatusRows(changedRows, "changedSource")).toHaveLength(2);
    expect(filterPageStatusRows(changedRows, "lockedScale")).toHaveLength(0);

    const counts = pageStatusFilterCounts([...rows, ...supersededRows]);
    expect(counts.all).toBe(5);
    expect(counts.missingOcr).toBe(2);
    expect(counts.lockedScale).toBe(1);
    expect(counts.superseded).toBe(1);
    expect(PAGE_STATUS_FILTERS).toEqual([
      "all",
      "changedSource",
      "superseded",
      "missingOcr",
      "lockedScale",
    ]);
  });

  it("keeps the active filter across a re-render of a changed project", () => {
    const controller = new PageStatusController();
    const project = projectWith(
      [pdfDocument(2)],
      [record("page_1", "doc_plan", 1, { scaleLocked: true }), record("page_2", "doc_plan", 2)],
    );
    expect(controller.setFilter("lockedScale")).toBe(true);
    expect(controller.setFilter("lockedScale")).toBe(false);
    // The panel rebuilds on refresh, so one focus restoration is requested.
    expect(controller.takeFocusRequest()).toBe(true);
    expect(controller.takeFocusRequest()).toBe(false);
    expect(controller.visible(project).map((row) => row.page)).toEqual([1]);

    // The panel renders again with more project data; the filter is unchanged.
    project.pages.push(record("page_3", "doc_plan", 3, { scaleLocked: true }));
    expect(controller.activeFilter).toBe("lockedScale");
    expect(controller.visible(project).map((row) => row.page)).toEqual([1, 3]);

    controller.reset();
    expect(controller.visible(project)).toHaveLength(3);
  });
});

describe("page status accessibility and labels", () => {
  it("gives every badge visible, localized text", () => {
    for (const badge of pageStatusBadges(
      facts({
        sourceState: "changed",
        superseded: true,
        ocrStored: true,
        documentKind: "tiff",
        scaleLocked: true,
        calibrated: true,
        blank: true,
        itemCount: 2,
      }),
    )) {
      expect(pageStatusBadgeLabel(badge).trim()).not.toBe("");
    }
  });

  it("repeats the badges in the card's accessible name", () => {
    const badges = pageStatusBadges(facts({ scaleLocked: true, itemCount: 2 }));
    const text = pageStatusAriaText(badges);
    expect(text).toContain("Scale locked");
    expect(text).toContain("2");
    expect(pageStatusAriaText([])).toBe("");
  });

  it("renders a keyboard-operable filter group with pressed state and counts", () => {
    const counts = { all: 4, changedSource: 1, superseded: 0, missingOcr: 2, lockedScale: 3 };
    const bar = pageStatusFilterBar({ active: "missingOcr", counts, onSelect: () => undefined });
    expect(bar.getAttribute("role")).toBe("group");
    expect(bar.getAttribute("aria-label")).toBeTruthy();
    const buttons = [...bar.querySelectorAll<HTMLButtonElement>("button")];
    expect(buttons).toHaveLength(5);
    for (const button of buttons) {
      expect(button.type).toBe("button");
      expect(button.getAttribute("aria-label")).toBeTruthy();
    }
    expect(buttons[3].getAttribute("aria-label")).toContain("2");
    expect(buttons.map((button) => button.getAttribute("aria-pressed"))).toEqual([
      "false",
      "false",
      "false",
      "true",
      "false",
    ]);
    expect(buttons[3].classList.contains("is-active")).toBe(true);
    expect(buttons[3].textContent).toContain("2");
    expect(bar.textContent).toContain("Clear the status filter");
  });

  it("passes the chosen filter back to the panel", () => {
    const chosen: string[] = [];
    const bar = pageStatusFilterBar({
      active: "all",
      counts: { all: 0, changedSource: 0, superseded: 0, missingOcr: 0, lockedScale: 0 },
      onSelect: (filter) => chosen.push(filter),
    });
    bar.querySelector<HTMLButtonElement>('[data-filter="superseded"]')?.click();
    expect(chosen).toEqual(["superseded"]);
  });
});
