function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface MarkdownRenderOptions {
  /** Resolves a bundled help image. Unresolved images render as alt text. */
  resolveImage?: (src: string, alt: string) => string | null;
}

function renderImage(
  alt: string,
  src: string,
  options: MarkdownRenderOptions,
  figure: boolean,
): string {
  const resolved = options.resolveImage?.(src, alt) ?? null;
  if (!resolved) return escapeHtml(alt);
  const image = `<img src="${escapeHtml(resolved)}" alt="${escapeHtml(alt)}" loading="lazy">`;
  if (!figure) return image;
  const caption = alt.trim() ? `<figcaption>${escapeHtml(alt.trim())}</figcaption>` : "";
  return `<figure class="help-figure">${image}${caption}</figure>`;
}

function safeHref(href: string): "anchor" | "doc" | "external" | "none" {
  const value = href.trim();
  if (value.startsWith("#")) return "anchor";
  if (/^[a-z0-9._-]+\.md(#[a-z0-9._-]+)?$/i.test(value)) return "doc";
  if (/^(https?:|mailto:)/i.test(value)) return "external";
  return "none";
}

function renderInline(raw: string, options: MarkdownRenderOptions): string {
  const codeSpans: string[] = [];
  let text = escapeHtml(raw).replace(/`([^`]+)`/g, (_match, code: string) => {
    codeSpans.push(code);
    return `\u0001${codeSpans.length - 1}\u0001`;
  });

  text = text.replace(
    /!\[([^\]]*)\]\(([^)\s]+)\)/g,
    (_match, alt: string, src: string) => renderImage(alt, src, options, false),
  );

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, label: string, href: string) => {
    const kind = safeHref(href);
    if (kind === "anchor" || kind === "doc") {
      return `<a href="${escapeHtml(href.trim())}" class="help-link">${label}</a>`;
    }
    if (kind === "external") {
      return `<span class="help-external">${label}</span>`;
    }
    return label;
  });

  text = text.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

  return text
    .replace(/\u0001(\d+)\u0001/g, (_match, index: string) => `<code>${codeSpans[Number(index)] ?? ""}</code>`)
    .replace(/\n/g, " ");
}

function slugify(value: string, used: Set<string>): string {
  const base =
    value
      .replace(/`([^`]*)`/g, "$1")
      .replace(/[*_~]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "section";
  let slug = base;
  let index = 2;
  while (used.has(slug)) {
    slug = `${base}-${index}`;
    index += 1;
  }
  used.add(slug);
  return slug;
}

function isTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith("|")) value = value.slice(1);
  if (value.endsWith("|")) value = value.slice(0, -1);
  return value.split("|").map((cell) => cell.trim());
}

function isBlockStart(lines: string[], index: number): boolean {
  const line = lines[index];
  return (
    /^\s*$/.test(line) ||
    /^#{1,6}\s+/.test(line) ||
    /^```/.test(line) ||
    /^>\s?/.test(line) ||
    /^\s*([-*+]|\d+[.)])\s+/.test(line) ||
    /^(---+|\*\*\*+|___+)\s*$/.test(line) ||
    /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.test(line) ||
    (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1]))
  );
}

export function renderMarkdown(
  markdown: string,
  options: MarkdownRenderOptions = {},
): string {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const html: string[] = [];
  const usedIds = new Set<string>();
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (/^\s*$/.test(line)) {
      index += 1;
      continue;
    }

    const image = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(line);
    if (image) {
      html.push(renderImage(image[1], image[2], options, true));
      index += 1;
      continue;
    }

    const fence = /^```([\w-]*)\s*$/.exec(line);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      const language = fence[1];
      html.push(
        `<pre><code${language ? ` class="language-${escapeHtml(language)}"` : ""}>${escapeHtml(code.join("\n"))}</code></pre>`,
      );
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const rawText = heading[2].trim();
      const id = slugify(rawText, usedIds);
      html.push(`<h${level} id="${id}">${renderInline(rawText, options)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(---+|\*\*\*+|___+)\s*$/.test(line)) {
      html.push("<hr>");
      index += 1;
      continue;
    }

    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const headers = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && !/^\s*$/.test(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      const head = headers.map((cell) => `<th>${renderInline(cell, options)}</th>`).join("");
      const bodyRows = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((_header, cellIndex) => `<td>${renderInline(row[cellIndex] ?? "", options)}</td>`)
              .join("")}</tr>`,
        )
        .join("");
      html.push(`<table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table>`);
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^>\s?/, ""));
        index += 1;
      }
      html.push(`<blockquote>${renderInline(quote.join("\n"), options)}</blockquote>`);
      continue;
    }

    const unordered = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^\s*[-*+]\s+(.*)$/.exec(lines[index]);
        if (!match) break;
        items.push(`<li>${renderInline(match[1], options)}</li>`);
        index += 1;
      }
      html.push(`<ul>${items.join("")}</ul>`);
      continue;
    }

    const ordered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const match = /^\s*\d+[.)]\s+(.*)$/.exec(lines[index]);
        if (!match) break;
        items.push(`<li>${renderInline(match[1], options)}</li>`);
        index += 1;
      }
      html.push(`<ol>${items.join("")}</ol>`);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length && !isBlockStart(lines, index)) {
      paragraph.push(lines[index]);
      index += 1;
    }
    html.push(`<p>${renderInline(paragraph.join("\n"), options)}</p>`);
  }

  return `<div class="markdown">${html.join("\n")}</div>`;
}
