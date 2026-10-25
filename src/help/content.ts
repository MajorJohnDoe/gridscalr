import userGuide from "../../docs/user-guide.md?raw";
import shortcuts from "../../docs/shortcuts.md?raw";
import workflows from "../../docs/workflows.md?raw";

export type HelpTopic = "workflows" | "guide" | "shortcuts" | "about";

export const HELP_CONTENT: Record<"workflows" | "guide" | "shortcuts", string> = {
  workflows,
  guide: userGuide,
  shortcuts,
};
