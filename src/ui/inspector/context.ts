import type { Layer, MarkupItem, Project, SelectionRef } from "../../model/types";
import type { itemMetrics } from "../../model/measure";
import type { PanelActions } from "../panels";

export interface InspectorContext {
  project: Project;
  selection: SelectionRef;
  item: MarkupItem;
  layer: Layer;
  actions: PanelActions;
  locked: boolean;
  hidden: boolean;
  metrics: ReturnType<typeof itemMetrics>;
  section: HTMLElement;
}
