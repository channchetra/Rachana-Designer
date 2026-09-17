/**
 * WordPress block-conversion tests.
 *
 * The converter's output is the product's contract with the target site: block
 * delimiters, attribute JSON and escaping all have to be exactly right or
 * WordPress reports a block validation error. These tests pin the markup for
 * each generated block type.
 */

import { describe, expect, it } from "vitest";
import { convert, extractCssVariables, extractMediaUrls, replaceMediaUrls } from "@/features/wordpress/convert";
import {
  extractMarkdownMediaUrls,
  markdownHtmlToBlocks,
  replaceMarkdownMediaUrls,
} from "@/features/wordpress/markdownToBlocks";

describe("convert — block markup", () => {
  it("wraps a simple element in a greenshift element block", () => {
    const out = convert("<div><p>Hello</p></div>");
    expect(out).toContain("<!-- wp:greenshift-blocks/element ");
    expect(out).toContain("<!-- /wp:greenshift-blocks/element -->");
    expect(out).toContain("<p>Hello</p>");
  });

  it("emits a self-closing form for void elements", () => {
    const out = convert("<img src=\"a.png\" alt=\"A\">");
    expect(out).toContain("<img");
    expect(out).toContain("/>");
  });

  it("encodes dangerous characters in the attribute JSON", () => {
    const out = convert('<div data-x="<script>&</script>"></div>');
    // `<`, `>` and `&` must be unicode-escaped so the block comment survives.
    expect(out).not.toMatch(/<!--\s*wp:greenshift-blocks\/element[^>]*<script>/);
    expect(out).toMatch(/\\u003c|\\u0026/);
  });

  it("moves CSS into a style-manager block", () => {
    const out = convert("<style>.card { color: red; }</style><div class=\"card\">x</div>");
    expect(out).toContain('"isVariation":"stylemanager"');
    expect(out).toContain("stylemanager");
    // The original <style> tag must not be emitted as content.
    expect(out).not.toContain("<style>");
  });

  it("captures inline scripts as custom JS when a style manager exists", () => {
    const out = convert("<style>.a{color:red}</style><div class=\"a\">x</div><script>console.log(1)</script>");
    expect(out).toContain('"customJsEnabled":true');
    expect(out).toContain("console.log(1)");
  });

  it("marks full-width sections with align full", () => {
    const out = convert('<section class="alignfull">x</section>');
    expect(out).toContain('"align":"full"');
  });

  it("maps data-type markers onto GreenShift variations", () => {
    const out = convert('<section data-type="section-component">x</section>');
    expect(out).toContain('"isVariation":"contentwrapper"');
    const inner = convert('<div data-type="content-area-component">x</div>');
    expect(inner).toContain('"isVariation":"nocolumncontent"');
  });

  it("keeps an id as the anchor", () => {
    const out = convert('<div id="hero">x</div>');
    expect(out).toContain('"anchor":"hero"');
  });

  it("normalizes YouTube watch URLs to embed URLs", () => {
    const out = convert('<iframe src="https://www.youtube.com/watch?v=abc123"></iframe>');
    expect(out).toContain("https://www.youtube.com/embed/abc123");
  });

  it("passes short YouTube URLs through to an embed", () => {
    const out = convert('<iframe src="https://youtu.be/xyz789"></iframe>');
    expect(out).toContain("https://www.youtube.com/embed/xyz789");
  });

  it("prefers <body> children when a full document is supplied", () => {
    const out = convert("<html><head><title>t</title></head><body><p>Body only</p></body></html>");
    expect(out).toContain("Body only");
    expect(out).not.toContain("<title>");
  });

  it("emits SVG icons raw rather than as elements", () => {
    const out = convert('<svg viewBox="0 0 10 10"><circle r="4"/></svg>');
    expect(out).toContain('"type":"svg"');
    expect(out).toContain("svgRaw");
  });

  it("supports the non-editable-classes mode", () => {
    const withClasses = convert("<style>.card{color:red}</style><div class=\"card\">x</div>", {
      editableClasses: true,
    });
    const withoutClasses = convert("<style>.card{color:red}</style><div class=\"card\">x</div>", {
      editableClasses: false,
    });
    expect(withClasses).toContain("dynamicGClasses");
    expect(withoutClasses).not.toContain("dynamicGClasses");
  });
});

describe("extractCssVariables", () => {
  it("extracts :root custom properties", () => {
    const vars = extractCssVariables(":root { --brand: #1C4076; --gap: 12px; }");
    expect(vars).toEqual([
      { name: "--brand", value: "#1C4076" },
      { name: "--gap", value: "12px" },
    ]);
  });

  it("returns an empty list when there is no root block", () => {
    expect(extractCssVariables(".a { color: red; }")).toEqual([]);
  });
});

describe("extractMediaUrls / replaceMediaUrls", () => {
  it("collects local image and url() references but not remote ones", () => {
    const urls = extractMediaUrls(
      '<img src="local.png"><img src="https://cdn.example.com/remote.png"><div style="background:url(bg.jpg)"></div>'
    );
    expect(urls).toContain("local.png");
    expect(urls).toContain("bg.jpg");
    expect(urls).not.toContain("https://cdn.example.com/remote.png");
  });

  it("replaces collected URLs using the map", () => {
    const out = replaceMediaUrls('<img src="local.png">', new Map([["local.png", "https://site/uploads/local.png"]]));
    expect(out).toContain("https://site/uploads/local.png");
  });

  it("leaves unmatched URLs untouched", () => {
    const out = replaceMediaUrls('<img src="keep.png">', new Map([["other.png", "x"]]));
    expect(out).toContain("keep.png");
  });
});

describe("markdownHtmlToBlocks", () => {
  it("emits a core heading block with the level attribute", () => {
    const out = markdownHtmlToBlocks("<h2>Title</h2>");
    expect(out).toBe('<!-- wp:heading {"level":2} -->\n<h2>Title</h2>\n<!-- /wp:heading -->');
  });

  it("emits a paragraph block", () => {
    const out = markdownHtmlToBlocks("<p>Text</p>");
    expect(out).toBe("<!-- wp:paragraph -->\n<p>Text</p>\n<!-- /wp:paragraph -->");
  });

  it("emits an unordered list block", () => {
    const out = markdownHtmlToBlocks("<ul><li>a</li></ul>");
    expect(out).toContain("<!-- wp:list -->");
    expect(out).toContain("<!-- /wp:list -->");
    expect(out).toContain("<ul><li>a</li></ul>");
  });

  it("marks ordered lists", () => {
    const out = markdownHtmlToBlocks("<ol><li>a</li></ol>");
    expect(out).toContain('<!-- wp:list {"ordered":true} -->');
  });

  it("emits a quote block", () => {
    const out = markdownHtmlToBlocks("<blockquote>Hi</blockquote>");
    expect(out).toContain("<!-- wp:quote -->");
    expect(out).toContain("<blockquote>Hi</blockquote>");
  });

  it("emits a code block with the wp-block-code class", () => {
    const out = markdownHtmlToBlocks("<pre><code>const a=1;</code></pre>");
    expect(out).toContain("<!-- wp:code -->");
    expect(out).toContain('<pre class="wp-block-code"><code>const a=1;</code></pre>');
  });

  it("wraps tables in a figure", () => {
    const out = markdownHtmlToBlocks("<table><tr><td>1</td></tr></table>");
    expect(out).toContain("<!-- wp:table -->");
    expect(out).toContain('<figure class="wp-block-table">');
  });

  it("emits a separator block", () => {
    const out = markdownHtmlToBlocks("<hr>");
    expect(out).toContain("<!-- wp:separator -->");
    expect(out).toContain("wp-block-separator");
  });

  it("emits an image block with alt attributes", () => {
    const out = markdownHtmlToBlocks('<p><img src="a.png" alt="Alt text"></p>');
    expect(out).toContain("<!-- wp:image ");
    expect(out).toContain('"alt":"Alt text"');
    expect(out).toContain('<figure class="wp-block-image">');
  });

  it("joins multiple blocks with a blank line", () => {
    const out = markdownHtmlToBlocks("<h1>A</h1><p>B</p>");
    expect(out).toContain("<!-- /wp:heading -->\n\n<!-- wp:paragraph -->");
  });

  it("uses only the body when given a full document", () => {
    const out = markdownHtmlToBlocks("<html><body><p>Inside</p></body></html>");
    expect(out).toContain("Inside");
    expect(out).not.toContain("<html>");
  });
});

describe("markdown media helpers", () => {
  it("collects only local image sources", () => {
    const urls = extractMarkdownMediaUrls('<img src="a.png"><img src="https://x/y.png">');
    expect(urls).toEqual(["a.png"]);
  });

  it("replaces markdown media URLs", () => {
    const out = replaceMarkdownMediaUrls('<img src="a.png">', new Map([["a.png", "https://s/a.png"]]));
    expect(out).toContain("https://s/a.png");
  });
});
