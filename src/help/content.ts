import userGuide from "../../docs/user-guide.md?raw";
import shortcuts from "../../docs/shortcuts.md?raw";

export type HelpTopic = "guide" | "shortcuts" | "about";

export const HELP_CONTENT: Record<"guide" | "shortcuts", string> = {
  guide: userGuide,
  shortcuts,
};
