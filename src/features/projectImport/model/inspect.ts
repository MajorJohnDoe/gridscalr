import type { PageId, Project } from "../../../model/types";
import type { ImportDocumentGroup } from "./types";

/** Pages in the source project, grouped in document order for the picker. */
export function inspectProjectImport(source: Project): ImportDocumentGroup[] {
  const counts = new Map<PageId, number>();
  for (const layer of source.layers) {
    for (const item of layer.items) {
      counts.set(item.pageId, (counts.get(item.pageId) ?? 0) + 1);
    }
  }

  const groups = new Map<string, ImportDocumentGroup>();
  for (const document of source.documents) {
    groups.set(document.id, {
      documentId: document.id,
      documentName: document.name,
      documentKind: document.kind,
      pageCount: document.pageCount,
      pages: [],
    });
  }
  source.pages.forEach((record, index) => {
    const document = source.documents.find((entry) => entry.id === record.documentId);
    const group = document ? groups.get(document.id) : undefined;
    if (!document || !group) return;
    group.pages.push({
      page: index + 1,
      documentIndex: source.documents.indexOf(document),
      documentId: document.id,
      documentName: document.name,
      documentKind: document.kind,
      localPage: record.localPage,
      name: record.state.name,
      building: record.state.building,
      floor: record.state.floor,
      itemCount: counts.get(record.id) ?? 0,
    });
  });
  return [...groups.values()].filter((group) => group.pages.length > 0);
}
