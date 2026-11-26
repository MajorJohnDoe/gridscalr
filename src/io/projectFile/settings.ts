/**
 * Settings normalization lives in `src/model/settings.ts` so the settings
 * command and project loading apply the same rules. This module keeps the IO
 * import name stable for `parse.ts`.
 */
export { normalizeProjectSettings as normalizeSettings } from "../../model/settings";
