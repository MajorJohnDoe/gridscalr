let handler: (() => Promise<void>) | null = null;

/** Registered by the session controller; Preferences and the welcome screen call it. */
export function setRecoveryCenterHandler(next: (() => Promise<void>) | null): void {
  handler = next;
}

/** Opens the recovery center from any entry point, including an empty store. */
export function openRecoveryCenter(): Promise<void> {
  return handler ? handler() : Promise.resolve();
}
