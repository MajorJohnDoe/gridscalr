import type { Project } from "../../../model/types";
import type { ScheduleDraft } from "../model";

/**
 * The state a builder section receives. `rebuild` re-renders every section and
 * the preview after a structural change; `refresh` updates only the preview and
 * the problem summary, so typing does not destroy the focused control.
 */
export interface BuilderContext {
  project: Project;
  draft: ScheduleDraft;
  rebuild: () => void;
  refresh: () => void;
}
