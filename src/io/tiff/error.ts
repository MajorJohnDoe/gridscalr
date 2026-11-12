/** A TIFF the reader or decoder refuses, with a localized, actionable message. */
export class TiffImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TiffImportError";
  }
}
