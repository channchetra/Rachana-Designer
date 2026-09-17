/**
 * Document-pipeline tests.
 *
 * Covers the Markdown ↔ HTML round trip, frontmatter preservation and the
 * display-only transforms that keep the canvas working inside a null-origin
 * iframe.
 */

import { describe, expect, it } from "vitest";
import {
  fixAstroComponentTagsForDisplay,
  hasContentTypeMeta,
  htmlToMarkdown,
  markdownToHtml,
  splitFrontmatter,
  stripDisplayTransforms,
} from "@/platform/html/document";

describe("splitFrontmatter", () => {
  it("splits YAML frontmatter from the body", () => {
    const input = "---\ntitle: Hi\n---\n# Heading\n";
    const { frontmatter, body } = splitFrontmatter(input);
    expect(frontmatter).toBe("---\ntitle: Hi\n---\n");
    expect(body).toBe("# Heading\n");
  });

  it("returns an empty frontmatter when there is none", () => {
    const input = "# Heading\n";
    const { frontmatter, body } = splitFrontmatter(input);
    expect(frontmatter).toBe("");
    expect(body).toBe(input);
  });
});

describe("markdownToHtml", () => {
  it("produces a complete document with the markdown rendered", () => {
    const html = markdownToHtml("# Title\n\nSome **bold** text.\n");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<h1");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("</body>");
  });

  it("renders GFM tables", () => {
    const html = markdownToHtml("| a | b |\n| - | - |\n| 1 | 2 |\n");
    expect(html).toContain("<table>");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>1</td>");
  });
});

describe("htmlToMarkdown", () => {
  it("converts headings back to ATX style", () => {
    expect(htmlToMarkdown("<h2>Hello</h2>").trim()).toBe("## Hello");
  });

  it("round-trips a table as GFM", () => {
    const md = htmlToMarkdown(
      "<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>"
    );
    expect(md).toContain("| a | b |");
    expect(md).toContain("| --- | --- |");
    expect(md).toContain("| 1 | 2 |");
  });

  it("extracts only body content from a full document", () => {
    const md = htmlToMarkdown("<html><head><title>x</title></head><body><p>Only this</p></body></html>");
    expect(md.trim()).toBe("Only this");
  });

  it("uses a fenced code block for <pre>", () => {
    const md = htmlToMarkdown("<pre><code>const a = 1;</code></pre>");
    expect(md).toContain("```");
    expect(md).toContain("const a = 1;");
  });

  it("converts strikethrough", () => {
    expect(htmlToMarkdown("<p><del>gone</del></p>").trim()).toBe("~~gone~~");
  });

  it("round-trips markdown through html and back", () => {
    const source = "## Title\n\n- one\n- two\n\nA [link](https://example.com).\n";
    const back = htmlToMarkdown(markdownToHtml(source));
    expect(back).toContain("## Title");
    // Turndown pads the list marker; accept any run of spaces after the dash.
    expect(back).toMatch(/^-\s+one$/m);
    expect(back).toMatch(/^-\s+two$/m);
    expect(back).toContain("https://example.com");
  });
});

describe("fixAstroComponentTagsForDisplay", () => {
  it("replaces self-closing components inside head with comments", () => {
    const html = "<html><head><BaseHead /></head><body></body></html>";
    expect(fixAstroComponentTagsForDisplay(html)).toContain("<!-- BaseHead -->");
  });

  it("gives body components an explicit close tag", () => {
    const html = "<html><head></head><body><Header /><p>Hi</p></body></html>";
    const out = fixAstroComponentTagsForDisplay(html);
    expect(out).toContain("<Header></Header>");
    expect(out).toContain("<p>Hi</p>");
  });

  it("leaves lowercase void elements alone", () => {
    const html = "<html><head></head><body><img src=\"a.png\" /><br /></body></html>";
    const out = fixAstroComponentTagsForDisplay(html);
    expect(out).toContain("<img src=\"a.png\" />");
    expect(out).toContain("<br />");
  });
});

describe("hasContentTypeMeta", () => {
  it("detects a charset meta", () => {
    expect(hasContentTypeMeta('<meta charset="utf-8">')).toBe(true);
  });
  it("detects an http-equiv Content-Type meta", () => {
    expect(hasContentTypeMeta('<meta http-equiv="Content-Type" content="text/html">')).toBe(true);
  });
  it("returns false when neither is present", () => {
    expect(hasContentTypeMeta("<p>hi</p>")).toBe(false);
  });
});

describe("stripDisplayTransforms", () => {
  it("restores an original src from a data-URI display transform", () => {
    const input = '<img data-gl-original-src="hero.png" src="data:image/png;base64,AAA">';
    expect(stripDisplayTransforms(input, true)).toContain('src="hero.png"');
    expect(stripDisplayTransforms(input, true)).not.toContain("data:image/png");
  });

  it("restores an inlined stylesheet to its original link tag", () => {
    const input =
      '<!-- gl-original-link: <link rel="stylesheet" href="a.css"> -->\n<style data-gl-inlined="a.css">\nbody{}\n</style>';
    const out = stripDisplayTransforms(input, true);
    expect(out).toContain('<link rel="stylesheet" href="a.css">');
    expect(out).not.toContain("data-gl-inlined");
  });

  it("removes the injected base tag", () => {
    const input = '<head><base data-gl-base="true" href="blob:x/"></head>';
    expect(stripDisplayTransforms(input, true)).not.toContain("data-gl-base");
  });

  it("removes injected Astro frontmatter CSS blocks", () => {
    const input = "<head><!-- gl-fm-css-start --><style>a{}</style><!-- gl-fm-css-end --></head>";
    expect(stripDisplayTransforms(input, true)).not.toContain("gl-fm-css-start");
  });

  it("removes a browser-injected charset meta when the source had none", () => {
    const input = '<head><meta charset="utf-8"><title>x</title></head>';
    expect(stripDisplayTransforms(input, false)).not.toContain("charset");
  });

  it("keeps a charset meta the author wrote", () => {
    const input = '<head><meta charset="utf-8"><title>x</title></head>';
    expect(stripDisplayTransforms(input, true)).toContain("charset");
  });
});
