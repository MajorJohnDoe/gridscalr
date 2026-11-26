/**
 * Public surface for launched-file classification. The rule stays pure so the
 * app and the file-association tests share one decision.
 */
export { classifyLaunchPath, firstLaunchPath } from "./model";
export type { LaunchTarget } from "./model";
