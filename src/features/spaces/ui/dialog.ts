import { t } from "../../../i18n";
import type { PageId, Space } from "../../../model/types";
import { store } from "../../../state/store";
import { clear, el } from "../../../ui/dom";
import { showModal } from "../../../ui/dialogs";
import { toast } from "../../../ui/toast";
import type { SpaceDraft, SpaceMeasurement, SpaceProblem, SpaceProblemCode } from "../model";
import {
  createRoomsFromText,
  createSpace,
  duplicateNumberSpaceIds,
  emptySpaceDraft,
  linkMeasurements,
  linkProblem,
  linkableSelection,
  roomTextCandidates,
  spaceAreas,
  spaceDraftFor,
  spaceMeasurements,
  unlinkMeasurement,
  updateSpace,
  validateSpaceDraft,
} from "../model";
import { spaceForm } from "./form";
import { spaceList } from "./list";
import { spaceProblemText } from "./messages";

/**
 * The space register dialog. It owns the edit state and every mutation, so one
 * click is one undo step. It reads the current drawing selection to offer the
 * link action, and asks the host to reveal a linked measurement after closing.
 */

export interface SpacesDialogOptions {
  /** Reveals one measurement on the drawing after the dialog has closed. */
  revealItem?: (pageId: PageId, layerId: string, itemId: string) => void;
}

export function openSpacesDialog(options: SpacesDialogOptions = {}): Promise<void> {
  if (!store.project) return Promise.resolve();
  const body = el("div", "form-stack spaces-dialog");
  let editing: SpaceDraft | null = null;
  let close: (() => void) | null = null;

  const render = () => {
    const project = store.project;
    if (!project) return;
    clear(body);
    body.append(el("p", "modal-message", t("spaces.intro")));

    const actions = el("div", "input-row spaces-actions");
    const addButton = el("button", "btn btn-small", t("spaces.newSpace"));
    addButton.type = "button";
    addButton.disabled = store.readOnly;
    addButton.addEventListener("click", () => {
      editing = emptySpaceDraft(project.spaces);
      render();
    });

    const pending = roomTextCandidates(project).filter((candidate) => !candidate.existing);
    const fromText = el("button", "btn btn-small", t("spaces.roomTextAction"));
    fromText.type = "button";
    fromText.disabled = store.readOnly || pending.length === 0;
    fromText.addEventListener("click", () => {
      if (!pending.length) {
        toast(t("spaces.roomTextNone"), "info");
        return;
      }
      let created = 0;
      let skipped = 0;
      store.mutate((current) => {
        const result = createRoomsFromText(
          current,
          pending.map((candidate) => candidate.room),
        );
        created = result.created.length;
        skipped = result.skipped.length;
      }, "change");
      if (!created) {
        toast(t("spaces.roomTextNone"), "info");
        return;
      }
      toast(t("spaces.roomTextCreated", { count: created }), "success");
      if (skipped) toast(t("spaces.roomTextSkipped", { count: skipped }), "info");
      render();
    });
    actions.append(addButton, fromText);
    body.append(actions);
    body.append(el("p", "settings-note", t("spaces.roomTextNote", { count: pending.length })));

    const selection = linkableSelection(project, store.ui.selection);
    body.append(
      el(
        "p",
        "settings-note",
        selection.length
          ? t("spaces.linkHint", { count: selection.length })
          : t("spaces.linkHintNone"),
      ),
    );

    const link = (space: Space) => {
      const current = store.project;
      if (!current) return;
      const refs = linkableSelection(current, store.ui.selection);
      if (!refs.length) {
        toast(t("spaces.linkNone"), "info");
        return;
      }
      const problems: SpaceProblemCode[] = [];
      const ready = refs.filter((ref) => {
        const problem = linkProblem(current, space.id, ref);
        if (problem && !problems.includes(problem)) problems.push(problem);
        return !problem;
      });
      // A refused selection must not add an empty undo step.
      if (!ready.length) {
        for (const code of problems) toast(spaceProblemText(code), "warning");
        return;
      }
      let linked = 0;
      store.mutate((project) => {
        linked = linkMeasurements(project, space.id, ready).linked;
      }, "change");
      toast(t("spaces.linkDone", { count: linked }), "success");
      for (const code of problems) toast(spaceProblemText(code), "warning");
      render();
    };

    const unlink = (space: Space) => {
      const current = store.project;
      if (!current) return;
      const linkedIds = new Set(
        (spaceMeasurements(current).get(space.id) ?? []).map((link) => link.itemId),
      );
      const refs = linkableSelection(current, store.ui.selection).filter((ref) =>
        linkedIds.has(ref.itemId),
      );
      if (!refs.length) {
        toast(t("spaces.unlinkNone"), "info");
        return;
      }
      let unlinked = 0;
      store.mutate((project) => {
        for (const ref of refs) if (unlinkMeasurement(project, ref)) unlinked += 1;
      }, "change");
      if (!unlinked) {
        toast(t("spaces.unlinkNone"), "info");
        return;
      }
      toast(t("spaces.unlinkDone", { count: unlinked }), "success");
      render();
    };

    const onSave = (draft: SpaceDraft): SpaceProblem[] => {
      const current = store.project;
      if (!current) return [{ code: "spaceNotFound" }];
      // A rejected save must not create an undo step or mark the project dirty.
      const problems = validateSpaceDraft(current, draft);
      if (problems.length) return problems;
      let applied: SpaceProblem[] = [];
      store.mutate((project) => {
        applied = draft.id
          ? updateSpace(project, draft).problems
          : createSpace(project, draft).problems;
      }, "change");
      return applied;
    };

    if (editing) {
      body.append(
        spaceForm({
          project,
          draft: editing,
          onSave,
          onCancel: () => {
            editing = null;
            render();
          },
          onSaved: () => {
            const name = editing?.name.trim() ?? "";
            const created = editing?.id === undefined;
            editing = null;
            toast(
              created ? t("spaces.created", { name }) : t("spaces.updated", { name }),
              "success",
            );
            render();
          },
        }),
      );
    } else {
      body.append(el("h3", "field-form-title", t("spaces.registerTitle")));
      body.append(
        spaceList({
          project,
          areas: spaceAreas(project),
          duplicates: duplicateNumberSpaceIds(project.spaces),
          selectedAreaCount: selection.length,
          onEdit: (space: Space) => {
            editing = spaceDraftFor(space);
            render();
          },
          onReveal: (_space: Space, measurement: SpaceMeasurement) => {
            options.revealItem?.(measurement.pageId, measurement.layerId, measurement.itemId);
            close?.();
          },
          onChanged: render,
          onLink: link,
          onUnlink: unlink,
        }),
      );
    }
  };

  render();
  return showModal({
    title: t("spaces.dialogTitle"),
    subtitle: t("spaces.dialogSubtitle"),
    body,
    wide: true,
    actions: [{ label: t("common.close"), value: "close", primary: true }],
    onMount: (_modal, closeModal) => {
      close = closeModal;
    },
  }).then(() => undefined);
}
