/** App-facing boundary for the source-storage controller. */
export interface SourceStorageHost {
  desktop: boolean;
  /** Canvas area used by the non-blocking source banner. */
  bannerHost: HTMLElement;
  notify: (message: string, kind?: "info" | "success" | "warning" | "error") => void;
  /** Saves the project so a managed copy has a folder to live in. */
  ensureSaved: () => Promise<boolean>;
  /** Reads only the page count of a candidate PDF; null when it cannot open. */
  probePdf: (bytes: Uint8Array) => Promise<number | null>;
  /** Replaces the in-memory PDF for one document after reload or relink. */
  reloadDocument: (documentId: string) => Promise<boolean>;
  /** Opens the Phase 3 page-mapping flow for a changed source. */
  replaceSource: (documentId: string) => void;
  /** Records a recovery checkpoint before a structural source change. */
  checkpoint: (label: string) => Promise<void>;
  /** Refresh UI and source status after a document reference changed. */
  afterChange: () => void;
}
