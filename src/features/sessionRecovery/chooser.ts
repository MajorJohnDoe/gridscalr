let handler: (() => Promise<void>) | null = null;

/** Registered by the session controller; Preferences and the welcome screen call it. */
export function setRecoveryChooserHandler(next: (() => Promise<void>) | null): void {
  handler = next;
}

export function openRecoveryChooser(): Promise<void> {
  return handler ? handler() : Promise.resolve();
}
