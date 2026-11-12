/**
 * Public surface of the count-type feature. The count-type rules themselves are
 * model code in `src/model/countTypes.ts`; this feature owns the management
 * dialog only, so the model never has to import it.
 */
export { openCountTypesDialog } from "./ui";
