/**
 * Public surface of the count-type feature. The count-type rules themselves are
 * model code in `src/model/countTypes.ts`; this feature owns the counted-object
 * rows of the Takeoff settings hub, so the model never has to import it.
 */
export { countTypeObjectRows, deleteCountType } from "./ui";
export type { CountTypeRowOptions } from "./ui";
