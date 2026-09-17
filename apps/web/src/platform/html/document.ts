/**
 * Document model.
 *
 * Three file shapes are supported, exactly as in the original editor:
 *
 *  - **HTML** (`.html`, `.htm`) — edited directly; the file text is the source
 *    of truth and saves are byte-preserving patches against it.
 *  - **Markdown** (`.md`, `.mdx`) — the file is converted to a full HTML
 *    document for editing, then converted back with Turndown on save. YAML
 *    frontmatter is split off and re-attached untouched.
 *  - **Astro** (`.astro`) — YAML frontmatter is split off; the template body is
 *    edited as HTML. Component tags are normalised for browser display only.
 */

import { Marked } from "marked";
import TurndownService from "turndown";
import { basename, dirname, extname, isAstroPath, isHtmlPath, isMarkdownPath } from "@/platform/fs/types";

export type DocumentKind = "html" | "markdown" | "astro";

export interface SplitDocument {
  kind: DocumentKind;
  /** YAML frontmatter including the `---` fences, or "" when absent. */
  frontmatter: string;
  /** The part that is edited as HTML. */
  body: string;
}

export interface DocumentIdentity {
  path: string;
  filename: string;
  dir: string;
  kind: DocumentKind;
}

/** Inline stylesheet applied to the generated markdown document. */
const MARKDOWN_DOC_STYLE = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 24px; }
h1, h2, h3, h4, h5, h6 { margin-top: 1.2em; margin-bottom: 0.4em; }
h1 { font-size: 2em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid #e5e7eb; padding-bottom: 0.3em; }
p { margin: 0.8em 0; }
ul, ol { padding-left: 2em; }
li { margin: 0.3em 0; }
blockquote { border-left: 4px solid #d1d5db; margin: 1em 0; padding: 0.5em 1em; color: #4b5563; background: #f9fafb; }
pre { background: #1e1e2e; color: #cdd6f4; padding: 1em; border-radius: 6px; overflow-x: auto; }
code { font-family: "Fira Code", "Cascadia Code", monospace; font-size: 0.9em; }
:not(pre) > code { background: #f1f5f9; padding: 0.15em 0.4em; border-radius: 3px; color: #e11d48; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #d1d5db; padding: 8px 12px; text-align: left; }
th { background: #f3f4f6; font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 4px; }
a { color: #2563eb; text-decoration: none; }
a:hover { text-decoration: underline; }
hr { border: none; border-top: 1px solid #e5e7eb; margin: 2em 0; }
`.trim();

export function identifyDocument(path: string): DocumentIdentity {
  const kind: DocumentKind = isMarkdownPath(path) ? "markdown" : isAstroPath(path) ? "astro" : "html";
  return { path, filename: basename(path), dir: dirname(path), kind };
}

/** Split YAML frontmatter (`---…---`) off a markdown or Astro file. */
export function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---[\s\S]*?---\n?)/);
  if (match) return { frontmatter: match[1], body: content.slice(match[1].length) };
  return { frontmatter: "", body: content };
}

/** Render markdown into a complete standalone HTML document for the canvas. */
export function markdownToHtml(markdown: string): string {
  const marked = new Marked();
  const bodyHtml = marked.parse(markdown) as string;
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
${MARKDOWN_DOC_STYLE}
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

/**
 * Convert edited HTML back to markdown. Mirrors the original host exactly,
 * including the GFM table rule and strikethrough support.
 */
export function htmlToMarkdown(html: string): string {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;

  const td = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });

  // GFM table rule — must run before the default block handling.
  td.addRule("table", {
    filter: "table",
    replacement: (_content: string, node: unknown) => {
      const table = node as HTMLTableElement;
      const rows: string[][] = [];
      const pushRow = (tr: Element) => {
        const cells: string[] = [];
        Array.from(tr.querySelectorAll("th, td")).forEach((cell) => {
          const text = (cell.textContent || "").trim().replace(/\|/g, "\\|").replace(/\n/g, " ");
          cells.push(text);
        });
        if (cells.length) rows.push(cells);
      };
      Array.from(table.querySelectorAll("thead tr, tbody tr")).forEach(pushRow);
      if (rows.length === 0) return "\n\n";
      const colCount = Math.max(...rows.map((r) => r.length));
      const pad = (arr: string[], n: number) => {
        const a = [...arr];
        while (a.length < n) a.push("");
        return a;
      };
      const line = (arr: string[]) => "| " + pad(arr, colCount).join(" | ") + " |";
      const separator = "| " + Array(colCount).fill("---").join(" | ") + " |";
      const lines = rows.map((r) => line(r));
      return "\n\n" + (lines.length > 1 ? [lines[0], separator, ...lines.slice(1)].join("\n") : lines[0]) + "\n\n";
    },
  });

  td.addRule("strikethrough", {
    filter: ["del", "s"],
    replacement: (content: string) => `~~${content}~~`,
  });

  // Inside <pre> the default fenced-code rule already handles the block.
  td.addRule("highlightedCode", {
    filter: (node: HTMLElement) =>
      node.nodeName === "CODE" && node.parentNode?.nodeName === "PRE",
    replacement: (content: string) => content,
  });

  return td.turndown(bodyContent).trim() + "\n";
}

/**
 * Normalise Astro component tags so the browser's DOM structure matches the
 * raw source that `buildElementMap` walks. Two problems are addressed:
 *
 *  1. Unknown elements in `<head>` (e.g. `<BaseHead />`) get foster-parented
 *     into `<body>`, adding phantom elements that shift every path.
 *  2. Self-closing component tags in `<body>` are treated as open elements by
 *     the HTML5 parser (it ignores `/>` on non-void elements), which makes
 *     following siblings become their children.
 *
 * Display-only: these rewrites are never written back to disk because saves
 * patch the raw source, not the rendered document.
 */
export function fixAstroComponentTagsForDisplay(html: string): string {
  // Step 2 gives every self-closing component an explicit empty close tag. The
  // optional `\s*` before `/>` avoids leaving a stray space behind in the
  // generated close tag (`<Header >` → `<Header>`), which would be harmless but
  // noisy in the DOM tree the user sees.
  return html
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (headBlock) =>
      headBlock.replace(/<([A-Z][a-zA-Z0-9-]*)\b[^>]*\/>/g, "<!-- $1 -->")
    )
    .replace(/<([A-Z][a-zA-Z0-9-]*)\b([^>]*?)\s*\/>/g, "<$1$2></$1>");
}

/** Insert `snippet` immediately after the opening `<head>`, creating one if needed. */
export function injectIntoHead(html: string, snippet: string): string {
  const wrapped = `\n${snippet}\n`;
  if (/<\/head>/i.test(html)) return html.replace(/<\/head>/i, () => `${wrapped}</head>`);
  if (/<head\b[^>]*>/i.test(html)) return html.replace(/(<head\b[^>]*>)/i, (_m, open) => `${open}${wrapped}`);
  if (/<html\b[^>]*>/i.test(html)) return html.replace(/(<html\b[^>]*>)/i, (_m, open) => `${open}\n<head>${wrapped}</head>`);
  return `<head>${wrapped}</head>\n${html}`;
}

/** True when the document text is a complete HTML document. */
export function hasDocumentWrapper(html: string): boolean {
  return /<html\b/i.test(html) || /<head\b/i.test(html) || /<\/head>/i.test(html) || /<body\b/i.test(html);
}

/** Detect a document-declared charset/content-type meta tag. */
export function hasContentTypeMeta(html: string): boolean {
  return (
    /<meta\b[^>]*http-equiv\s*=\s*["']Content-Type["'][^>]*>/i.test(html) ||
    /<meta\b[^>]*charset(?:\s*=\s*["'][^"']+["'])?[^>]*>/i.test(html)
  );
}

/** Remove the charset/content-type meta the browser may have injected. */
export function stripAutoInsertedContentTypeMeta(content: string, hadMeta: boolean): string {
  if (hadMeta) return content;
  return content
    .replace(/\s*<meta\b[^>]*http-equiv\s*=\s*["']Content-Type["'][^>]*>\s*/gi, "\n")
    .replace(/\s*<meta\b[^>]*charset\s*=\s*["'][^"']+["'][^>]*>\s*/gi, "\n");
}

/* ------------------------------------------------------------------ *
 * Save-side cleanup
 * ------------------------------------------------------------------ */

export const GL_BASE_SELECTOR = "base[data-gl-base]";
export const GL_INLINED_STYLE = "style[data-gl-inlined]";
export const GL_FM_CSS_START = "<!-- gl-fm-css-start -->";
export const GL_FM_CSS_END = "<!-- gl-fm-css-end -->";

/**
 * Strip every display-only transform the host added for the canvas, so a full
 * document save writes exactly what the user authored.
 */
export function stripDisplayTransforms(content: string, hadContentTypeMeta: boolean): string {
  let out = content
    // data-gl-original-src="x" src="data:…" → src="x"
    .replace(/\s*data-gl-original-src="([^"]+)"\s+src="data:[^"]+"/gi, ' src="$1"')
    // an inlined <link> is restored to its original tag
    .replace(
      /<!-- gl-original-link: (.+?) -->\s*<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>/g,
      "$1"
    )
    .replace(/<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>\s*/g, "")
    // Astro frontmatter CSS blocks
    .replace(/\s*<!--\s*gl-fm-css-start\s*-->[\s\S]*?<!--\s*gl-fm-css-end\s*-->\s*/g, "")
    // the injected <base>
    .replace(/\s*<base\b[^>]*data-gl-base="true"[^>]*>\s*/gi, "\n");
  out = stripAutoInsertedContentTypeMeta(out, hadContentTypeMeta);
  return out;
}

export { extname, basename, dirname, isAstroPath, isHtmlPath, isMarkdownPath };
