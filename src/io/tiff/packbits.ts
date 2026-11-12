/**
 * TIFF PackBits (compression 32773) row decoding.
 *
 * A control byte below 128 copies the next `control + 1` bytes, a byte above
 * 128 repeats the next byte `257 - control` times, and 128 is a no-op. The
 * output is capped at `limit` so a corrupt run cannot grow without bound.
 */
export function decodePackBits(input: Uint8Array, limit: number): Uint8Array {
  const out = new Uint8Array(limit);
  let read = 0;
  let write = 0;
  while (read < input.length && write < limit) {
    const control = input[read++];
    if (control < 128) {
      const count = control + 1;
      const end = Math.min(read + count, input.length);
      while (read < end && write < limit) out[write++] = input[read++];
    } else if (control > 128) {
      if (read >= input.length) break;
      const value = input[read++];
      const count = 257 - control;
      const end = Math.min(write + count, limit);
      out.fill(value, write, end);
      write = end;
    }
  }
  return write === limit ? out : out.subarray(0, write);
}
