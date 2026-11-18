import { t, type MessageKey } from "../../../i18n";
import { formatNumber } from "../../../i18n/format";
import type { Project, Space, SpaceKind } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el, iconButton } from "../../../ui/dom";
import { icon } from "../../../ui/icons";
import { toast } from "../../../ui/toast";
import { revalidateTargetNow } from "../../../ui/dialogs";
import type { SpaceArea, SpaceMeasurement } from "../model";
import { deleteSpace, moveSpace, spaceTree } from "../model";
import { areaWarningText } from "./messages";

/**
 * The space register: a tree of buildings, floors, rooms and zones with the
 * derived area per row. Every mutation is one undo step, and a delete only
 * clears measurement links after an inline confirmation.
 */

export interface SpaceListOptions {
  project: Project;
  areas: Map<string, SpaceArea>;
  duplicates: Set<string>;
  /** Area measurements currently selected on the drawing. */
  selectedAreaCount: number;
  onEdit: (space: Space) => void;
  onReveal: (space: Space, link: SpaceMeasurement) => void;
  onChanged: () => void;
  /** Asks the host to start the link action for one space. */
  onLink: (space: Space) => void;
  /** Asks the host to start the unlink action for one space. */
  onUnlink: (space: Space) => void;
}

const KIND_LABELS: Record<SpaceKind, MessageKey> = {
  building: "fields.spaceKind.building",
  floor: "fields.spaceKind.floor",
  room: "fields.spaceKind.room",
  zone: "fields.spaceKind.zone",
};

function areaText(area: SpaceArea | undefined): string {
  if (!area || area.areaM2 === null) return t("spaces.areaMissing");
  return t("spaces.areaValue", { area: formatNumber(area.areaM2, 2) });
}

export function spaceList(options: SpaceListOptions): HTMLElement {
  const { project, areas, duplicates } = options;
  const wrap = el("div", "space-list");
  const confirm = el("div", "inline-confirm");
  confirm.hidden = true;
  const hideConfirm = () => {
    confirm.hidden = true;
    clear(confirm);
  };

  const remove = (space: Space) => {
    let cleared = 0;
    let removed = false;
    store.mutate((current) => {
      const result = deleteSpace(current, space.id);
      removed = result.removed;
      cleared = result.clearedMeasurements;
    }, "change");
    hideConfirm();
    if (!removed) {
      toast(t("spaces.deleteHasChildren"), "info");
      return;
    }
    toast(t("spaces.deleteDone", { name: space.name, count: cleared }), "info");
    options.onChanged();
  };

  const requestDelete = (space: Space) => {
    const linkCount = areas.get(space.id)?.links.length ?? 0;
    const childCount = project.spaces.filter(
      (entry) => entry.id !== space.id && (entry.parentId ?? "") === space.id,
    ).length;
    clear(confirm);
    confirm.hidden = false;
    if (childCount > 0) {
      confirm.append(
        el("p", "inline-confirm-text", t("spaces.deleteHasChildren")),
        el("p", "settings-note", t("spaces.childCount", { count: childCount })),
      );
      const close = el("button", "btn btn-small btn-ghost", t("common.close"));
      close.type = "button";
      close.addEventListener("click", hideConfirm);
      const actions = el("div", "inline-confirm-actions");
      actions.append(close);
      confirm.append(actions);
      close.focus();
      return;
    }
    confirm.append(
      el(
        "p",
        "inline-confirm-text",
        t("spaces.deleteConfirm", { name: space.name, count: linkCount }),
      ),
    );
    const actions = el("div", "inline-confirm-actions");
    const cancel = el("button", "btn btn-small btn-ghost", t("common.cancel"));
    cancel.type = "button";
    cancel.addEventListener("click", hideConfirm);
    const removeButton = el("button", "btn btn-small btn-danger", t("common.delete"));
    removeButton.type = "button";
    removeButton.addEventListener("click", () => {
      const problem = revalidateTargetNow({
        kind: "space",
        id: space.id,
        name: space.name,
        resolve: () =>
          store.project?.spaces.some((entry) => entry.id === space.id) ? space.id : null,
      });
      hideConfirm();
      if (problem) {
        toast(problem, "warning");
        return;
      }
      remove(space);
    });
    actions.append(cancel, removeButton);
    confirm.append(actions);
    removeButton.focus();
  };

  const move = (space: Space, direction: -1 | 1) => {
    let moved = false;
    store.mutate((current) => {
      moved = moveSpace(current.spaces, space.id, direction);
    }, "change");
    if (moved) options.onChanged();
  };

  const nodes = spaceTree(project.spaces);
  if (!nodes.length) {
    wrap.append(el("p", "empty-note small", t("spaces.empty")));
    return wrap;
  }

  nodes.forEach((node) => {
    const { space, depth } = node;
    const area = areas.get(space.id);
    const row = el("div", "space-row");
    row.style.setProperty("--space-depth", String(depth));
    row.dataset.spaceId = space.id;

    const head = el("div", "space-row-head");
    head.append(el("span", "space-kind", t(KIND_LABELS[space.kind])));
    if (space.number) head.append(el("span", "space-number", space.number));
    head.append(el("span", "space-name", space.name));

    const source = area?.source ?? "missing";
    const badge = el(
      "span",
      `space-area-badge is-${source}`,
      t(`spaces.area.${source}` as MessageKey),
    );
    const measure = el("span", "space-area-value", areaText(area));
    head.append(badge, measure);
    row.append(head);

    if (area && area.measurementCount > 0) {
      row.append(
        el("p", "space-meta", t("spaces.measurementCount", { count: area.measurementCount })),
      );
    }
    if (space.floor || space.usage) {
      row.append(el("p", "space-meta", [space.floor, space.usage].filter(Boolean).join(" · ")));
    }
    if (area?.warning) {
      row.append(el("p", "space-warning", areaWarningText(area.warning)));
    }
    if (area?.manualUnused) {
      row.append(el("p", "space-warning", t("spaces.manualUnused")));
    }
    if (duplicates.has(space.id) && space.number) {
      row.append(el("p", "space-warning", t("spaces.duplicateNumber", { number: space.number })));
    }

    const actions = el("div", "space-row-actions");
    const visibleLink = area?.links.find((link) => link.visible);
    const reveal = iconButton(
      icon("search", 12),
      t("spaces.revealAria", { name: space.name }),
      () => {
        if (!visibleLink) {
          toast(t("spaces.revealNone"), "info");
          return;
        }
        options.onReveal(space, visibleLink);
      },
      "icon-btn category-action",
    );
    reveal.disabled = !visibleLink;

    const link = iconButton(
      icon("plus", 12),
      t("spaces.linkAria", { name: space.name }),
      () => {
        if (!options.selectedAreaCount) {
          toast(t("spaces.linkNone"), "info");
          return;
        }
        options.onLink(space);
      },
      "icon-btn category-action",
    );
    link.disabled = store.readOnly;

    const unlink = iconButton(
      icon("minus", 12),
      t("spaces.unlinkAria", { name: space.name }),
      () => {
        if (!options.selectedAreaCount) {
          toast(t("spaces.linkNone"), "info");
          return;
        }
        options.onUnlink(space);
      },
      "icon-btn category-action",
    );
    unlink.disabled = store.readOnly || !area?.links.length;

    const edit = el("button", "btn btn-small btn-ghost", t("spaces.edit"));
    edit.type = "button";
    edit.setAttribute("aria-label", t("spaces.editAria", { name: space.name }));
    edit.addEventListener("click", () => options.onEdit(space));

    const moveUp = iconButton(
      icon("up", 12),
      t("spaces.moveUpAria", { name: space.name }),
      () => move(space, -1),
      "icon-btn category-action",
    );
    const moveDown = iconButton(
      icon("down", 12),
      t("spaces.moveDownAria", { name: space.name }),
      () => move(space, 1),
      "icon-btn category-action",
    );
    const remove = iconButton(
      icon("trash", 12),
      t("spaces.deleteAria", { name: space.name }),
      () => requestDelete(space),
      "icon-btn category-action",
    );
    remove.disabled = store.readOnly;
    actions.append(reveal, link, unlink, edit, moveUp, moveDown, remove);
    row.append(actions);
    wrap.append(row);
  });

  wrap.append(confirm);
  return wrap;
}
