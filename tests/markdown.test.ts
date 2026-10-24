import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/help/markdown";
import { HELP_CONTENT } from "../src/help/content";

describe("markdown renderer", () => {
  it("renders headings with stable ids", () => {
    const html = renderMarkdown("# Set the page scale\n\n## Measure\n");
    expect(html).toContain('<h1 id="set-the-page-scale">Set the page scale</h1>');
    expect(html).toContain('<h2 id="measure">Measure</h2>');
  });

  it("escapes raw HTML and scripts", () => {
    const html = renderMarkdown('<script>alert("x")</script>\n\nA <b>bold</b> claim.');
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
  });

  it("renders inline code, bold, and italic", () => {
    const html = renderMarkdown("Use **Length** with `Enter` and *Shift*.");
    expect(html).toContain("<strong>Length</strong>");
    expect(html).toContain("<code>Enter</code>");
    expect(html).toContain("<em>Shift</em>");
  });

  it("renders unordered and ordered lists", () => {
    const html = renderMarkdown("- One\n- Two\n\n1. First\n2. Second\n");
    expect(html).toContain("<ul><li>One</li><li>Two</li></ul>");
    expect(html).toContain("<ol><li>First</li><li>Second</li></ol>");
  });

  it("renders tables", () => {
    const html = renderMarkdown("| Action | Shortcut |\n| --- | --- |\n| Save | `Ctrl+S` |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>Action</th>");
    expect(html).toContain("<td><code>Ctrl+S</code></td>");
  });

  it("renders fenced code blocks literally", () => {
    const html = renderMarkdown("```json\n{ \"a\": 1 }\n```\n");
    expect(html).toContain("<pre><code class=\"language-json\">{ &quot;a&quot;: 1 }</code></pre>");
  });

  it("sanitizes links and keeps internal anchors", () => {
    const html = renderMarkdown("[Guide](#measure) [Shortcuts](shortcuts.md) [Site](https://example.com)");
    expect(html).toContain('<a href="#measure" class="help-link">Guide</a>');
    expect(html).toContain('<a href="shortcuts.md" class="help-link">Shortcuts</a>');
    expect(html).toContain('<span class="help-external">Site</span>');
    expect(html).not.toContain('href="https://example.com"');
  });

  it("legacy javascript links are not emitted as anchors", () => {
    const html = renderMarkdown("[Bad](javascript:alert(1))");
    expect(html).not.toContain("<a");
    expect(html).toContain("Bad");
  });

  it("ships bundled help content", () => {
    expect(HELP_CONTENT.guide).toContain("# GridScalr User Guide");
    expect(HELP_CONTENT.guide).toContain("## Quantities");
    expect(HELP_CONTENT.guide).toContain("Settings → Project settings");
    expect(HELP_CONTENT.shortcuts).toContain("## Project and file");
    expect(HELP_CONTENT.shortcuts).toContain("Ctrl+Shift+M");
  });

  it("renders the bundled documents without raw HTML", () => {
    for (const content of [HELP_CONTENT.guide, HELP_CONTENT.shortcuts]) {
      const html = renderMarkdown(content);
      expect(html).toContain('<div class="markdown">');
      expect(html).not.toContain("<script");
    }
    expect(renderMarkdown(HELP_CONTENT.shortcuts)).toContain("<table>");
  });
});
