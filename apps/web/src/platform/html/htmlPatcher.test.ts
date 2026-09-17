/**
 * Byte-preserving patch tests.
 *
 * The single most important invariant of Rachana Designer is that saving edits
 * an HTML file as *text*, never by re-serialising a DOM. These tests pin that
 * behaviour: comments, attribute quoting, and unrelated whitespace must survive
 * a save untouched.
 */

import { describe, expect, it } from "vitest";
import { applyPatches, buildElementMap, type SavePatches } from "@/platform/html/htmlPatcher";

/** Build a minimal well-formed patch set. */
function patches(overrides: Partial<SavePatches> = {}): SavePatches {
  return {
    styleBlocks: [],
    elements: [],
    deletions: [],
    insertions: [],
    classRenames: [],
    ...overrides,
  };
}

const DOC = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <!-- keep me: a comment the editor must not touch -->
  <style>
    .a { color: red; }
  </style>
</head>
<body>
  <div class="a" data-keep="yes">
    <p>Hello</p>
    <img src="a.png" alt='single-quoted'>
  </div>
</body>
</html>
`;

describe("buildElementMap", () => {
  it("skips script/style/link/meta/noscript when assigning paths", () => {
    const map = buildElementMap(DOC);
    // body -> "" is the root; the first editable child is the div.
    expect(map.has("")).toBe(true);
    expect(map.has("0")).toBe(true);
    const div = map.get("0");
    expect(div?.tagName.toLowerCase()).toBe("div");
  });

  it("indexes nested editable children", () => {
    const map = buildElementMap(DOC);
    expect(map.get("0.0")?.tagName.toLowerCase()).toBe("p");
    expect(map.get("0.1")?.tagName.toLowerCase()).toBe("img");
  });
});

describe("applyPatches", () => {
  it("sets an attribute without disturbing anything else", () => {
    const out = applyPatches(DOC, patches({ elements: [{ path: "0", setAttrs: { "data-new": "1" } }] }));
    expect(out).toContain('data-new="1"');
    // The original comment survives verbatim.
    expect(out).toContain("<!-- keep me: a comment the editor must not touch -->");
    // The single-quoted attribute keeps its quoting.
    expect(out).toContain("alt='single-quoted'");
    // Untouched style block is byte-identical.
    expect(out).toContain(".a { color: red; }");
  });

  it("removes an attribute", () => {
    const out = applyPatches(DOC, patches({ elements: [{ path: "0", removeAttrs: ["data-keep"] }] }));
    expect(out).not.toContain("data-keep");
    expect(out).toContain('class="a"');
  });

  it("replaces innerHTML of a targeted element only", () => {
    // Setting innerHTML replaces the element's children, so the <img> that used
    // to be a child is gone — but siblings of the target and the rest of the
    // document are untouched.
    const out = applyPatches(DOC, patches({ elements: [{ path: "0", innerHTML: "<span>Replaced</span>" }] }));
    expect(out).toContain("<span>Replaced</span>");
    expect(out).not.toContain("<p>Hello</p>");
    expect(out).not.toContain("<img");
    expect(out).toContain("<!-- keep me: a comment the editor must not touch -->");
    expect(out).toContain(".a { color: red; }");
  });

  it("touches only the targeted element when replacing a child's content", () => {
    const out = applyPatches(DOC, patches({ elements: [{ path: "0.0", innerHTML: "Changed" }] }));
    expect(out).toContain("<p>Changed</p>");
    // The sibling image must be byte-identical.
    expect(out).toContain("<img src=\"a.png\" alt='single-quoted'>");
  });

  it("changes a tag name in both the opening and closing tag", () => {
    const out = applyPatches(DOC, patches({ elements: [{ path: "0.0", newTag: "h1" }] }));
    expect(out).toContain("<h1>Hello</h1>");
    expect(out).not.toContain("<p>Hello</p>");
  });

  it("deletes an element and leaves siblings intact", () => {
    const out = applyPatches(DOC, patches({ deletions: ["0.1"] }));
    expect(out).not.toContain("<img");
    expect(out).toContain("<p>Hello</p>");
  });

  it("inserts HTML at a direct-child position", () => {
    const out = applyPatches(
      DOC,
      patches({ insertions: [{ parentPath: "0", position: 0, html: "<em>First</em>" }] })
    );
    const emIdx = out.indexOf("<em>First</em>");
    const pIdx = out.indexOf("<p>Hello</p>");
    expect(emIdx).toBeGreaterThan(-1);
    expect(emIdx).toBeLessThan(pIdx);
  });

  it("appends when the insertion position is negative", () => {
    const out = applyPatches(
      DOC,
      patches({ insertions: [{ parentPath: "0", position: -1, html: "<em>Last</em>" }] })
    );
    expect(out.indexOf("<em>Last</em>")).toBeGreaterThan(out.indexOf("<img"));
  });

  it("renames a class in class attributes and in selectors", () => {
    const out = applyPatches(DOC, patches({ classRenames: [{ oldName: "a", newName: "b" }] }));
    expect(out).toContain('class="b"');
    expect(out).toContain(".b { color: red; }");
    expect(out).not.toContain('class="a"');
  });

  it("injects an editor style block into <head>", () => {
    const out = applyPatches(
      DOC,
      patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".x { color: blue; }" }] })
    );
    expect(out).toContain('<style id="gl-editor-styles">');
    expect(out).toContain(".x { color: blue; }");
    // Injected inside head, not after body.
    expect(out.indexOf('id="gl-editor-styles"')).toBeLessThan(out.indexOf("</head>"));
  });

  it("replaces an existing editor style block instead of duplicating it", () => {
    const once = applyPatches(DOC, patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".x { color: blue; }" }] }));
    const twice = applyPatches(once, patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".x { color: green; }" }] }));
    expect((twice.match(/gl-editor-styles/g) ?? []).length).toBe(1);
    expect(twice).toContain("color: green");
  });

  it("removes a managed style block by id", () => {
    const once = applyPatches(DOC, patches({ styleBlocks: [{ id: "gl-anim-1", css: ".y { opacity: 1; }" }] }));
    expect(once).toContain("gl-anim-1");
    const twice = applyPatches(once, patches({ removedStyleBlockIds: ["gl-anim-1"] }));
    expect(twice).not.toContain("gl-anim-1");
  });

  it("injects a script block before </body>", () => {
    const out = applyPatches(
      DOC,
      patches({ scriptBlocks: [{ id: "glmw-script-1", content: "console.log(1);" }] })
    );
    expect(out).toContain('<script id="glmw-script-1">');
    expect(out.indexOf("glmw-script-1")).toBeLessThan(out.indexOf("</body>"));
  });

  it("is idempotent for an empty patch set", () => {
    expect(applyPatches(DOC, patches())).toBe(DOC);
  });

  it("scaffolds a document for template imports when allowed", () => {
    const fragment = "<section><h1>Hi</h1></section>";
    const out = applyPatches(
      fragment,
      patches({ styleBlocks: [{ id: "gl-tpl-123", css: ".s { color: red; }" }] }),
      { allowDocumentScaffold: true }
    );
    expect(out).toContain("<html>");
    expect(out).toContain("<body>");
    expect(out).toContain("<h1>Hi</h1>");
  });

  it("does not scaffold for non-HTML files", () => {
    const fragment = "<h1>Hi</h1>";
    const out = applyPatches(fragment, patches({ styleBlocks: [{ id: "gl-tpl-1", css: "" }] }), {
      allowDocumentScaffold: false,
    });
    expect(out).not.toContain("<html>");
  });
});
