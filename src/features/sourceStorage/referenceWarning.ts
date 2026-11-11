import { t } from "../../i18n";
import { showSessionBanner } from "../sessionRecovery";
import { describeOutsideReferences, type OutsideReference } from "./outsideReferences";

export interface OutsideReferenceBannerOptions {
  references: readonly OutsideReference[];
  /** Existing "Copy drawing into project" action for every reference. */
  onCopy: () => void;
  /** Existing "Relink" action, offered when there is one reference. */
  onRelink?: () => void;
  onDismiss: () => void;
}

/**
 * Dismissible trust warning for a project that references drawings outside its
 * own folder. It explains the reference and offers the existing copy and relink
 * actions; it never rejects a legitimate reference.
 */
export function showOutsideReferenceBanner(
  host: HTMLElement,
  options: OutsideReferenceBannerOptions,
): () => void {
  const actions = [
    { label: t("sourceStorage.copyIntoProject"), onClick: options.onCopy },
    ...(options.onRelink
      ? [{ label: t("sourceStorage.action.relink"), onClick: options.onRelink }]
      : []),
  ];
  return showSessionBanner(host, {
    id: "outside-references",
    tone: "warning",
    message: t("sourceStorage.outsideBanner", {
      count: options.references.length,
      names: describeOutsideReferences(options.references),
    }),
    actions,
    onDismiss: options.onDismiss,
  });
}
