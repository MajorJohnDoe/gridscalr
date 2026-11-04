import quickStart from "../../docs/quick-start.md?raw";
import quickStartSv from "../../docs/quick-start.sv.md?raw";
import userGuide from "../../docs/user-guide.md?raw";
import shortcuts from "../../docs/shortcuts.md?raw";
import workflows from "../../docs/workflows.md?raw";

export type HelpTopic = "quickstart" | "workflows" | "guide" | "shortcuts" | "about";

export const HELP_CONTENT: Record<"quickstart" | "workflows" | "guide" | "shortcuts", string> = {
  quickstart: quickStart,
  workflows,
  guide: userGuide,
  shortcuts,
};

export const QUICK_START_SV = quickStartSv;
