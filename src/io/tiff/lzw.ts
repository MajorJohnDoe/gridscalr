/**
 * TIFF LZW (compression 5) decoding.
 *
 * Codes are packed most-significant-bit first and start at 9 bits. 256 clears
 * the dictionary, 257 is end-of-information and 258 is the first assigned code.
 * TIFF widens the code one entry early ("early change"), so the width grows when
 * the next free code reaches `2^width - 1`. The TIFF flavour also allows the
 * end code to be missing, which is why the reader stops at `limit`.
 */

const CLEAR = 256;
const END = 257;
const FIRST = 258;
const MAX_CODES = 4096;

export function decodeLzw(input: Uint8Array, limit: number): Uint8Array {
  if (limit === 0) return new Uint8Array(0);

  const out = new Uint8Array(limit);
  const prefix = new Int16Array(MAX_CODES);
  const suffix = new Uint8Array(MAX_CODES);
  const stack = new Uint8Array(MAX_CODES + 1);

  let written = 0;
  let previous = -1;
  let codeSize = 9;
  let next = FIRST;
  let bitBuffer = 0;
  let bitCount = 0;
  let read = 0;

  const readCode = (): number => {
    while (bitCount < codeSize && read < input.length) {
      bitBuffer = (bitBuffer << 8) | input[read++];
      bitCount += 8;
    }
    if (bitCount < codeSize) return -1;
    bitCount -= codeSize;
    const code = (bitBuffer >>> bitCount) & ((1 << codeSize) - 1);
    bitBuffer &= (1 << bitCount) - 1;
    return code;
  };

  /** Pushes the string for `code` onto the stack in reverse order. */
  const expand = (code: number): number => {
    let depth = 0;
    let current = code;
    while (current >= FIRST) {
      stack[depth++] = suffix[current];
      current = prefix[current];
    }
    if (current > 255) return -1;
    stack[depth++] = current;
    return depth;
  };

  while (written < limit) {
    const code = readCode();
    if (code < 0 || code === END) break;
    if (code === CLEAR) {
      codeSize = 9;
      next = FIRST;
      previous = -1;
      continue;
    }
    if (previous < 0) {
      if (code > 255) break;
      out[written++] = code;
      previous = code;
      continue;
    }

    let depth: number;
    let first: number;
    let repeatFirst = false;
    if (code < next) {
      depth = expand(code);
      if (depth < 0) break;
      first = stack[depth - 1];
      if (next < MAX_CODES) {
        prefix[next] = previous;
        suffix[next] = first;
        next++;
      }
    } else if (code === next) {
      // The code being read is the entry this step is about to add.
      depth = expand(previous);
      if (depth < 0) break;
      first = stack[depth - 1];
      if (next < MAX_CODES) {
        prefix[next] = previous;
        suffix[next] = first;
        next++;
      }
      repeatFirst = true;
    } else {
      break;
    }

    for (let index = depth - 1; index >= 0 && written < limit; index--) {
      out[written++] = stack[index];
    }
    if (repeatFirst && written < limit) out[written++] = first;
    previous = code;

    if (next + 1 === 1 << codeSize && codeSize < 12) codeSize++;
  }

  return written === limit ? out : out.subarray(0, written);
}
