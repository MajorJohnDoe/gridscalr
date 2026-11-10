import { t } from "../../i18n";
import type { DocumentRef } from "../../model/types";
import { sourceStatus } from "../../source/sourceStatus";
import { store } from "../../state/store";
import { copyDocumentIntoProject, consolidateDrawings } from "./copyActions";
import { findDocument } from "./documents";
import { detectSourceLocation, shouldRecommendManagedCopy } from "./mode";
import type { SourceStorageHost } from "./ports";
import { sourceChangeActions } from "./relink";
import {
  acceptCurrentSource,
  detachDocumentFromSource,
  reloadSource,
  relinkSource,
} from "./sourceActions";
import { recommendManagedCopy, showSourceChangedBanner } from "./ui";

function sourceActionLabel(action: string): string {
  if (action === "reload") return t("sourceStorage.action.reload");
  if (action === "useCurrent") return t("sourceStorage.action.useCurrent");
  if (action === "relink") return t("sourceStorage.action.relink");
  return t("sourceStorage.action.copyIntoProject");
}

/**
 * Owns explicit source-storage actions: managed copies, consolidation,
 * detaching, relinking and the source-changed banner. It never rewrites a
 * source drawing and never accepts a changed checksum without confirmation.
 */
export class SourceStorageController {
  private unsubscribe: (() => void) | null = null;
  private banners = new Map<string, () => void>();
  private dismissed = new Set<string>();

  constructor(private readonly host: SourceStorageHost) {}

  start(): void {
    if (!this.host.desktop || this.unsubscribe) return;
    this.unsubscribe = sourceStatus.subscribe(() => this.renderBanners());
    this.renderBanners();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const remove of this.banners.values()) remove();
    this.banners.clear();
    this.dismissed.clear();
  }

  /** Returns true when the user wants the picked drawing copied into the project. */
  async recommendImport(
    path: string | null,
    name: string,
    kind: DocumentRef["kind"],
  ): Promise<boolean> {
    if (!this.host.desktop || kind !== "pdf") return false;
    const hint = detectSourceLocation(path);
    if (!shouldRecommendManagedCopy(hint)) return false;
    return recommendManagedCopy(name, hint);
  }

  /** Runs the recommendation after the imported document exists in the store. */
  async applyImportChoice(documentId: string): Promise<void> {
    await this.copyIntoProject(documentId);
  }

  copyIntoProject(documentId: string): Promise<boolean> {
    return copyDocumentIntoProject(this.host, documentId);
  }

  consolidate(): Promise<void> {
    return consolidateDrawings(this.host);
  }

  detachFromSource(documentId: string): Promise<void> {
    return detachDocumentFromSource(this.host, documentId);
  }

  useCurrent(documentId: string): Promise<void> {
    return acceptCurrentSource(this.host, documentId);
  }

  reload(documentId: string): Promise<void> {
    return reloadSource(this.host, documentId);
  }

  relink(documentId: string): Promise<void> {
    return relinkSource(this.host, documentId);
  }

  private runAction(action: string, documentId: string): void {
    if (action === "reload") void this.reload(documentId);
    else if (action === "useCurrent") void this.useCurrent(documentId);
    else if (action === "relink") void this.relink(documentId);
    else if (action === "copyIntoProject") void this.copyIntoProject(documentId);
  }

  private renderBanners(): void {
    const project = store.project;
    if (!project) {
      for (const remove of this.banners.values()) remove();
      this.banners.clear();
      return;
    }
    const active = new Set<string>();
    for (const status of sourceStatus.summary.statuses) {
      if (status.state === "ok") continue;
      const document = findDocument(project, status.documentId);
      if (!document || document.kind !== "pdf") continue;
      active.add(status.documentId);
      if (this.dismissed.has(status.documentId)) continue;
      if (this.banners.has(status.documentId)) continue;
      const actions = sourceChangeActions(document)
        .filter(
          (action) =>
            status.state === "changed" || (action !== "useCurrent" && action !== "copyIntoProject"),
        )
        .map((action) => ({
          label: sourceActionLabel(action),
          onClick: () => {
            this.dismissed.add(status.documentId);
            this.banners.get(status.documentId)?.();
            this.banners.delete(status.documentId);
            this.runAction(action, status.documentId);
          },
        }));
      const remove = showSourceChangedBanner(this.host.bannerHost, {
        documentId: status.documentId,
        name: document.name,
        state: status.state,
        actions,
        onDismiss: () => {
          this.dismissed.add(status.documentId);
          this.banners.delete(status.documentId);
        },
      });
      this.banners.set(status.documentId, remove);
    }
    for (const [documentId, remove] of this.banners) {
      if (active.has(documentId)) continue;
      remove();
      this.banners.delete(documentId);
      this.dismissed.delete(documentId);
    }
    for (const documentId of this.dismissed) {
      if (!active.has(documentId)) this.dismissed.delete(documentId);
    }
  }
}
