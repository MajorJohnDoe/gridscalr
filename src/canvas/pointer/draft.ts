import { arcGeometry, distance, simplifyPolyline } from "../../model/geometry";
import { dedupeLast } from "../geometry";
import { findItem } from "../../model/layers";
import { textBoxLayout } from "../../model/annotations";
import { stampStatusColor } from "../../model/stamps";
import type { Layer, MarkupItem, PageSize, Point } from "../../model/types";
import { store } from "../../state/store";
import { t } from "../../i18n";
import { depthDialog, textDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import type { Draft } from "../draftRenderer";
import type { CreatedItemRef, ItemOptions } from "./itemFactory";

export interface DraftHost {
  viewPage(): number;
  viewZoom(): number;
  pageSize(): PageSize | undefined;
  drawInteraction(): void;
  clearSnap(): void;
  createItem(
    kind: MarkupItem["kind"],
    points: Point[],
    options?: ItemOptions,
  ): CreatedItemRef | null;
  startTextBoxEdit(item: MarkupItem, layer: Layer): void;
  startCalloutTextEdit(item: MarkupItem, layer: Layer): void;
  startCloudTextEdit(item: MarkupItem, layer: Layer): void;
  cropActive(): boolean;
  cropCancel(): void;
  cropConfirm(): void;
  labelConnectActive(): boolean;
  cancelLabelConnection(): void;
  updateCursor(): void;
}

/** Draft state and the finish paths for every drawing and measurement tool. */
export class DraftLifecycle {
  private current: Draft | null = null;

  constructor(private readonly host: DraftHost) {}

  get draft(): Draft | null {
    return this.current;
  }

  setDraft(draft: Draft | null): void {
    this.current = draft;
  }

  /** Asks for the depth that turns a newly drawn or double-clicked volume into m³. */
  promptVolumeDepth(itemRef: { layerId: string; itemId: string } | null): void {
    const project = store.project;
    if (!itemRef || !project) return;
    const found = findItem(project, itemRef.itemId);
    if (!found || found.item.kind !== "volume") return;
    void depthDialog(project.settings.lengthUnit, found.item.depth ?? 1).then((depth) => {
      if (depth === null) return;
      const value = Math.max(0.001, Math.min(1_000_000, depth));
      store.mutate((current) => {
        const target = findItem(current, itemRef.itemId)?.item;
        if (!target || target.kind !== "volume") return;
        target.depth = value;
        target.updatedAt = new Date().toISOString();
      }, "change");
    });
  }

  finishPen(): void {
    if (!this.current || (this.current.kind !== "pen" && this.current.kind !== "highlight")) return;
    const points = this.current.points;
    const kind = this.current.kind;
    this.current = null;
    if (points.length < 2) {
      this.host.drawInteraction();
      return;
    }
    const simplified = simplifyPolyline(points, 0.8 / this.host.viewZoom());
    this.host.createItem(kind, simplified);
    this.host.drawInteraction();
  }

  finishShape(): void {
    if (
      !this.current ||
      (this.current.kind !== "line" &&
        this.current.kind !== "arrow" &&
        this.current.kind !== "rect" &&
        this.current.kind !== "textbox" &&
        this.current.kind !== "rail" &&
        this.current.kind !== "ellipse" &&
        this.current.kind !== "highlight-rect")
    ) {
      return;
    }
    const { kind, start, current } = this.current;
    this.current = null;
    this.host.clearSnap();
    if (distance(start, current) < 3 / this.host.viewZoom()) {
      this.host.drawInteraction();
      return;
    }
    if (kind === "highlight-rect") {
      this.host.createItem("highlight", [start, current], { highlightShape: "rectangle" });
    } else if (kind === "textbox") {
      const created = this.host.createItem("textbox", [start, current], { text: "" });
      const project = store.project;
      const found = created && project ? findItem(project, created.itemId) : undefined;
      if (found) this.host.startTextBoxEdit(found.item, found.layer);
    } else if (kind === "rail") {
      this.host.createItem("rail", [start, current]);
    } else {
      this.host.createItem(kind, [start, current]);
    }
    this.host.drawInteraction();
  }

  finishCallout(current: Point): void {
    if (!this.current || this.current.kind !== "callout") return;
    const start = this.current.start;
    this.current = null;
    this.host.clearSnap();
    if (distance(start, current) < 3 / this.host.viewZoom()) {
      this.host.drawInteraction();
      return;
    }
    this.createCallout(start, current);
  }

  private createCallout(start: Point, current: Point): void {
    const content = t("kind.callout");
    const page = this.host.pageSize();
    let center = current;
    if (page) {
      const box = textBoxLayout(content, store.ui.style.fontSize);
      const margin = 8;
      const minX = Math.min(page.width / 2, box.width / 2 + margin);
      const maxX = Math.max(page.width / 2, page.width - box.width / 2 - margin);
      const minY = Math.min(page.height / 2, box.height / 2 + margin);
      const maxY = Math.max(page.height / 2, page.height - box.height / 2 - margin);
      center = {
        x: Math.max(minX, Math.min(maxX, current.x)),
        y: Math.max(minY, Math.min(maxY, current.y)),
      };
    }
    const created = this.host.createItem("callout", [start, center], { text: content });
    if (created && store.project) {
      const found = findItem(store.project, created.itemId);
      if (found) this.host.startCalloutTextEdit(found.item, found.layer);
    }
    this.host.drawInteraction();
  }

  async editItemText(item: MarkupItem): Promise<void> {
    const title =
      item.kind === "stamp"
        ? t("canvas.editStampText")
        : item.kind === "delta"
          ? t("canvas.editDelta")
          : item.kind === "cloud"
            ? t("canvas.cloudText")
            : t("canvas.editCallout");
    const text = await textDialog(title, t("canvas.onlyThisItem"), item.text ?? "", "", true);
    if (text === null) return;
    store.mutate((project) => {
      const target = findItem(project, item.id)?.item;
      if (target) {
        target.text =
          text.trim() ||
          (target.kind === "stamp"
            ? t("tool.stamp")
            : target.kind === "callout"
              ? t("kind.callout")
              : "");
        if (target.kind === "stamp") {
          target.color = stampStatusColor(target.text, target.color);
        }
        target.updatedAt = new Date().toISOString();
      }
    }, "change");
  }

  finishQuickArea(): void {
    if (
      !this.current ||
      (this.current.kind !== "area-rect" && this.current.kind !== "area-ellipse")
    ) {
      return;
    }
    const shape = this.current.kind === "area-rect" ? "rectangle" : "ellipse";
    const { start, current } = this.current;
    this.current = null;
    this.host.clearSnap();
    if (distance(start, current) < 3 / this.host.viewZoom()) {
      this.host.drawInteraction();
      return;
    }
    this.host.createItem("area", [start, current], { areaShape: shape });
    this.host.drawInteraction();
  }

  finishDraft(): void {
    if (this.host.cropActive()) {
      this.host.cropConfirm();
      return;
    }
    if (!this.current) return;
    if (
      this.current.kind === "radius" ||
      this.current.kind === "diameter" ||
      this.current.kind === "arc" ||
      this.current.kind === "angle" ||
      this.current.kind === "slope"
    ) {
      const kind = this.current.kind;
      const points = dedupeLast(this.current.points);
      const minimum = kind === "arc" || kind === "angle" ? 3 : 2;
      this.current = null;
      this.host.clearSnap();
      if (points.length >= minimum) {
        const selected = points.slice(0, minimum);
        const preview = { kind, points: selected } as MarkupItem;
        if (kind !== "arc" || arcGeometry(preview)) this.host.createItem(kind, selected);
        else toast(t("canvas.thirdPoint"), "warning");
      } else {
        toast(t("canvas.remainingPoints"), "warning");
      }
      this.host.drawInteraction();
      return;
    }

    if (this.current.kind === "polyline") {
      const points = dedupeLast(this.current.points);
      this.current = null;
      this.host.clearSnap();
      if (points.length >= 2) this.host.createItem("polyline", points);
      this.host.drawInteraction();
      return;
    }

    if (this.current.kind === "area-rect" || this.current.kind === "area-ellipse") {
      this.finishQuickArea();
    } else if (
      this.current.kind === "length" ||
      this.current.kind === "area" ||
      this.current.kind === "volume" ||
      this.current.kind === "cloud" ||
      this.current.kind === "highlight-polygon"
    ) {
      this.current.points = dedupeLast(this.current.points);
      const points = this.current.points;
      const kind = this.current.kind;
      if (kind === "length" && points.length < 2) {
        this.current = null;
        this.host.drawInteraction();
        return;
      }
      if (kind !== "length" && points.length < 3) {
        toast(t("canvas.minThreePoints"), "warning");
        return;
      }
      this.current = null;
      this.host.clearSnap();
      if (kind === "cloud") {
        const created = this.host.createItem("cloud", points, {
          text: store.ui.cloudText ? t("reference.revision") : undefined,
        });
        if (created && store.ui.cloudText && store.project) {
          const found = findItem(store.project, created.itemId);
          if (found) this.host.startCloudTextEdit(found.item, found.layer);
        }
      } else if (kind === "highlight-polygon") {
        this.host.createItem("highlight", points, { highlightShape: "polygon" });
      } else {
        const created = this.host.createItem(kind, points);
        if (kind === "volume") this.promptVolumeDepth(created);
      }
      this.host.drawInteraction();
    } else if (this.current.kind === "callout") {
      this.finishCallout(this.current.current);
    } else if (this.current.kind === "pen" || this.current.kind === "highlight") {
      this.finishPen();
    } else if (
      this.current.kind === "line" ||
      this.current.kind === "arrow" ||
      this.current.kind === "rect" ||
      this.current.kind === "textbox" ||
      this.current.kind === "ellipse" ||
      this.current.kind === "highlight-rect"
    ) {
      this.finishShape();
    } else {
      this.cancelDraft();
    }
  }

  removeLastPoint(): boolean {
    if (
      !this.current ||
      this.current.kind === "line" ||
      this.current.kind === "arrow" ||
      this.current.kind === "rect" ||
      this.current.kind === "textbox" ||
      this.current.kind === "rail" ||
      this.current.kind === "ellipse" ||
      this.current.kind === "highlight-rect" ||
      this.current.kind === "area-rect" ||
      this.current.kind === "area-ellipse" ||
      this.current.kind === "callout"
    ) {
      return false;
    }
    if (this.current.points.length <= 1) {
      this.cancelDraft();
      return true;
    }
    this.current.points.pop();
    this.current.cursor = this.current.points[this.current.points.length - 1];
    this.host.drawInteraction();
    return true;
  }

  cancelDraft(): void {
    if (this.host.cropActive()) {
      this.host.cropConfirm();
      return;
    }
    if (this.host.labelConnectActive()) {
      this.host.cancelLabelConnection();
      this.host.updateCursor();
      this.host.drawInteraction();
      return;
    }
    if (!this.current) return;
    this.current = null;
    this.host.clearSnap();
    this.host.drawInteraction();
  }
}
