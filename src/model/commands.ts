/**
 * Public surface for item commands.
 *
 * The implementation lives in `commands/items.ts` so the write-path hardening
 * wave can add command modules without growing a single file. Callers keep
 * importing `model/commands`; only this barrel names the module files.
 */
export * from "./commands/items";
