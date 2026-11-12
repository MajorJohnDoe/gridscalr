/**
 * Undoes TIFF horizontal differencing (Predictor 2) in place. Every row stores
 * the difference to the sample `samplesPerPixel` positions to its left, so the
 * value is restored component-wise and never across a row boundary.
 */
export interface PredictorInput {
  width: number;
  rows: number;
  bitsPerSample: number;
  samplesPerPixel: number;
  littleEndian: boolean;
}

export function undoHorizontalPredictor(data: Uint8Array, input: PredictorInput): void {
  const { width, samplesPerPixel, bitsPerSample } = input;
  if (bitsPerSample === 8) {
    const rowBytes = width * samplesPerPixel;
    for (let row = 0; row < input.rows; row++) {
      const base = row * rowBytes;
      for (let index = samplesPerPixel; index < rowBytes; index++) {
        data[base + index] = (data[base + index] + data[base + index - samplesPerPixel]) & 0xff;
      }
    }
    return;
  }
  if (bitsPerSample === 16) {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const get = (offset: number) => view.getUint16(offset, input.littleEndian);
    const set = (offset: number, value: number) =>
      view.setUint16(offset, value & 0xffff, input.littleEndian);
    const rowBytes = width * samplesPerPixel * 2;
    for (let row = 0; row < input.rows; row++) {
      const base = row * rowBytes;
      for (let index = samplesPerPixel; index < width * samplesPerPixel; index++) {
        set(base + index * 2, get(base + index * 2) + get(base + (index - samplesPerPixel) * 2));
      }
    }
  }
}
