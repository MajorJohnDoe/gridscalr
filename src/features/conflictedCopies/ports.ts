import { isTauri, pathExists, readFileText } from "../../io/platform";
import { messageDialog } from "../../ui/dialogs";
import { toast } from "../../ui/toast";
import { compareDialog } from "../saveIntegrity";
import type { ConflictedCopyPorts } from "./controller";
import { deleteConflictedCopy, listConflictedCopies } from "./ipc";
import { confirmDeleteCopy } from "./ui";

/** Shell actions the conflicted-copy flow needs from the project session. */
export interface ConflictedCopyHost {
  /** Opens the selected copy as its own project in this window. */
  openProject: (path: string) => Promise<void>;
}

export function createConflictedCopyPorts(host: ConflictedCopyHost): ConflictedCopyPorts {
  return {
    desktop: isTauri,
    list: listConflictedCopies,
    remove: deleteConflictedCopy,
    pathExists,
    open: host.openProject,
    readText: readFileText,
    compare: compareDialog,
    confirmDelete: confirmDeleteCopy,
    notify: (message, kind = "info") => toast(message, kind),
    notifyError: (title, message) => messageDialog(title, message, "warning"),
  };
}
