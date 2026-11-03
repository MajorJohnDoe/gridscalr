// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  markPlatform,
  mountWindowControls,
  restoreGlyph,
} from "../src/ui/windowChrome";

const WINDOWS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const LINUX_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

describe("window chrome platform detection", () => {
  it("maps desktop user agents to the platform that draws the title row", () => {
    expect(detectPlatform(WINDOWS_UA, true)).toBe("windows");
    expect(detectPlatform(MAC_UA, true)).toBe("macos");
    expect(detectPlatform(LINUX_UA, true)).toBe("linux");
  });

  it("reports the browser fallback regardless of the user agent", () => {
    expect(detectPlatform(WINDOWS_UA, false)).toBe("browser");
    expect(detectPlatform(MAC_UA, false)).toBe("browser");
  });

  it("publishes the platform for CSS", () => {
    expect(markPlatform()).toBe("browser");
    expect(document.documentElement.dataset.platform).toBe("browser");
  });
});

describe("window control glyphs", () => {
  it("shows restore only while the window is maximized", () => {
    expect(restoreGlyph(true)).toBe("windowRestore");
    expect(restoreGlyph(false)).toBe("windowMaximize");
  });
});

describe("window controls in the browser fallback", () => {
  it("renders nothing and leaves the title row untouched", () => {
    const host = document.createElement("header");
    const controls = mountWindowControls(host, { quit: () => undefined });
    expect(controls).toBeNull();
    expect(host.children).toHaveLength(0);
    expect(host.querySelector(".window-controls")).toBeNull();
  });
});
