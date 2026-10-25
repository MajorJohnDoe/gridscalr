import { describe, expect, it } from "vitest";
import { sha256Fallback } from "../src/io/sha256";

describe("sha256 fallback", () => {
  it("matches the standard vectors for empty input and abc", () => {
    expect(sha256Fallback(new TextEncoder().encode(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(sha256Fallback(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("hashes data across multiple blocks", () => {
    expect(
      sha256Fallback(
        new TextEncoder().encode("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq"),
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("handles the 55/56 byte padding boundary", () => {
    expect(sha256Fallback(new Uint8Array(55))).toHaveLength(64);
    expect(sha256Fallback(new Uint8Array(56))).toHaveLength(64);
    expect(sha256Fallback(new Uint8Array(64))).toHaveLength(64);
  });
});
