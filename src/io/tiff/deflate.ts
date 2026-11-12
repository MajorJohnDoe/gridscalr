import { Inflate, Unzlib } from "fflate";

/**
 * TIFF Deflate (compression 8 or the legacy 32946). libtiff writes a zlib
 * wrapper, so a zlib header selects the streaming `Unzlib` decoder; anything
 * else is treated as raw deflate. The sink stops at `limit`, which keeps a
 * crafted stream from expanding past one strip of image data.
 */
export function decodeDeflate(input: Uint8Array, limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let written = 0;
  const sink = (chunk: Uint8Array): void => {
    if (written >= limit) return;
    const take = Math.min(chunk.length, limit - written);
    out.set(chunk.subarray(0, take), written);
    written += take;
  };

  const zlibWrapped =
    input.length >= 2 && (input[0] & 0x0f) === 8 && ((input[0] << 8) | input[1]) % 31 === 0;
  try {
    const stream = zlibWrapped ? new Unzlib({}, sink) : new Inflate({}, sink);
    stream.push(input, true);
  } catch {
    // A truncated or corrupt stream keeps whatever decoded before the error;
    // the caller compares the result with the strip's expected byte count.
  }
  return written === limit ? out : out.subarray(0, written);
}
