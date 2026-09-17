/**
 * CSS routing tests.
 *
 * `styleRouter` is what keeps Astro projects tidy: new rules should land in an
 * existing stylesheet, in a local editor style block, or in the project global
 * stylesheet — never duplicated. These tests pin the rule splitter and both
 * routing destinations, including the managed font segments.
 */

import { describe, expect, it } from "vitest";
import {
  findRuleInCss,
  isRoutableEditorBlockId,
  normalizeSelector,
  relativeImport,
  routeFontPatches,
  routeStylePatches,
  splitCssRules,
} from "@/platform/host/styleRouter";
import { MemoryWorkspace } from "@/platform/fs/memoryWorkspace";
import type { SavePatches } from "@/platform/html/htmlPatcher";

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

const GLOBAL = "src/styles/global.css";

describe("splitCssRules", () => {
  it("splits top-level rules", () => {
    const rules = splitCssRules(".a { color: red; }\n.b { color: blue; }");
    expect(rules.map((r) => r.selector)).toEqual([".a", ".b"]);
    expect(rules[0].full).toBe(".a { color: red; }");
  });

  it("keeps at-rules with nested blocks intact", () => {
    const css = "@media (max-width: 768px) { .a { color: red; } }";
    const rules = splitCssRules(css);
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toContain("@media");
  });

  it("skips bare at-rules such as @import", () => {
    const css = '@import url("a.css");\n.a { color: red; }';
    const rules = splitCssRules(css);
    expect(rules.map((r) => r.selector)).toEqual([".a"]);
  });

  it("ignores braces inside strings and comments", () => {
    const css = '/* } not a brace */\n.a { content: "}"; }';
    const rules = splitCssRules(css);
    expect(rules).toHaveLength(1);
    expect(rules[0].selector).toBe(".a");
  });
});

describe("findRuleInCss", () => {
  it("locates a rule by normalised selector", () => {
    const css = ".a{color:red}\n.b  {  color: blue; }";
    const found = findRuleInCss(css, ".b");
    expect(found).not.toBeNull();
    expect(css.slice(found!.start, found!.end)).toBe(".b  {  color: blue; }");
  });

  it("returns null when absent", () => {
    expect(findRuleInCss(".a{color:red}", ".z")).toBeNull();
  });

  it("normalizes whitespace in selectors", () => {
    expect(normalizeSelector("  .a   >  .b ")).toBe(".a > .b");
  });
});

describe("relativeImport", () => {
  it("builds a sibling import", () => {
    expect(relativeImport("src/layouts", "src/styles/global.css")).toBe("../styles/global.css");
  });
  it("builds a same-directory import", () => {
    expect(relativeImport("src", "src/global.css")).toBe("./global.css");
  });
});

describe("isRoutableEditorBlockId", () => {
  it("routes the built-in editor blocks", () => {
    expect(isRoutableEditorBlockId("gl-editor-styles")).toBe(true);
    expect(isRoutableEditorBlockId("gl-button-styles")).toBe(true);
    expect(isRoutableEditorBlockId("gl-section-styles")).toBe(true);
  });
  it("never routes the managed font segments", () => {
    expect(isRoutableEditorBlockId("gl-design-system-fonts")).toBe(false);
    expect(isRoutableEditorBlockId("gl-design-system-font-overrides")).toBe(false);
  });
  it("routes other design-system, layout and animation blocks", () => {
    expect(isRoutableEditorBlockId("gl-design-system-variables")).toBe(true);
    expect(isRoutableEditorBlockId("gl-layout-1")).toBe(true);
    expect(isRoutableEditorBlockId("gl-anim-hero")).toBe(true);
    expect(isRoutableEditorBlockId("gl-tpl-1")).toBe(true);
  });
  it("does not route arbitrary ids", () => {
    expect(isRoutableEditorBlockId("my-style")).toBe(false);
  });
});

describe("routeStylePatches", () => {
  it("appends a new rule to the global stylesheet in global scope", async () => {
    const ws = new MemoryWorkspace("p");
    const out = await routeStylePatches(
      ws,
      "src/pages/index.astro",
      "<h1>Hi</h1>",
      patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".new { color: red; }" }] }),
      "global",
      GLOBAL
    );
    expect(await ws.readText(GLOBAL)).toContain(".new { color: red; }");
    expect(out.routedSelectors).toEqual([".new"]);
    // The block is consumed, not passed on to the HTML patcher.
    expect(out.patches.styleBlocks).toHaveLength(0);
  });

  it("writes a local editor style block in local scope", async () => {
    const ws = new MemoryWorkspace("p");
    const out = await routeStylePatches(
      ws,
      "src/pages/index.astro",
      "<h1>Hi</h1>",
      patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".local { color: red; }" }] }),
      "local",
      GLOBAL
    );
    expect(out.currentFileHtml).toContain("data-gl-editor");
    expect(out.currentFileHtml).toContain(".local { color: red; }");
  });

  it("updates an existing rule in a project stylesheet instead of duplicating it", async () => {
    const ws = new MemoryWorkspace("p", { "src/styles/site.css": ".existing { color: red; }" });
    await routeStylePatches(
      ws,
      "src/pages/index.astro",
      "<h1>Hi</h1>",
      patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".existing { color: blue; }" }] }),
      "global",
      GLOBAL
    );
    const css = await ws.readText("src/styles/site.css");
    expect(css).toContain("color: blue");
    expect(css).not.toContain("color: red");
    // Nothing was appended to global.css.
    expect(await ws.exists(GLOBAL)).toBe(false);
  });

  it("forces :root rules into the global stylesheet regardless of scope", async () => {
    const ws = new MemoryWorkspace("p");
    await routeStylePatches(
      ws,
      "src/pages/index.astro",
      "<h1>Hi</h1>",
      patches({ styleBlocks: [{ id: "gl-editor-styles", css: ":root { --x: 1; }" }] }),
      "local",
      GLOBAL
    );
    expect(await ws.readText(GLOBAL)).toContain("--x: 1");
  });

  it("passes non-routable blocks through untouched", async () => {
    const ws = new MemoryWorkspace("p");
    const out = await routeStylePatches(
      ws,
      "src/pages/index.astro",
      "<h1>Hi</h1>",
      patches({ styleBlocks: [{ id: "my-custom-style", css: ".x { color: red; }" }] }),
      "global",
      GLOBAL
    );
    expect(out.patches.styleBlocks).toHaveLength(1);
    expect(out.patches.styleBlocks[0].id).toBe("my-custom-style");
  });
});

describe("routeFontPatches", () => {
  it("moves font @font-face blocks into a managed global segment", async () => {
    const ws = new MemoryWorkspace("p");
    const out = await routeFontPatches(
      ws,
      patches({
        styleBlocks: [
          { id: "gl-design-system-fonts", css: "@font-face { font-family: 'X'; src: url(x.woff2); }" },
        ],
      }),
      GLOBAL
    );
    const css = await ws.readText(GLOBAL);
    expect(css).toContain("/* gl-design-system-fonts:start */");
    expect(css).toContain("/* gl-design-system-fonts:end */");
    expect(css).toContain("font-family: 'X'");
    // Consumed, not forwarded.
    expect(out.patches.styleBlocks).toHaveLength(0);
  });

  it("converts a Google Font <link> into an @import line", async () => {
    const ws = new MemoryWorkspace("p");
    await routeFontPatches(
      ws,
      patches({
        linkBlocks: [
          {
            id: "gl-design-system-font-inter",
            outerHTML: '<link id="gl-design-system-font-inter" rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter">',
          },
        ],
      }),
      GLOBAL
    );
    const css = await ws.readText(GLOBAL);
    expect(css).toContain("/* gl-font-imports:start */");
    expect(css).toContain('@import url("https://fonts.googleapis.com/css2?family=Inter");');
  });

  it("removes a managed font segment on request", async () => {
    const ws = new MemoryWorkspace("p");
    await routeFontPatches(
      ws,
      patches({ styleBlocks: [{ id: "gl-design-system-fonts", css: "@font-face{font-family:A;src:url(a)}" }] }),
      GLOBAL
    );
    expect(await ws.readText(GLOBAL)).toContain("gl-design-system-fonts:start");
    await routeFontPatches(ws, patches({ removedStyleBlockIds: ["gl-design-system-fonts"] }), GLOBAL);
    expect(await ws.readText(GLOBAL)).not.toContain("gl-design-system-fonts:start");
  });

  it("is a no-op when there are no font patches", async () => {
    const ws = new MemoryWorkspace("p");
    const input = patches({ styleBlocks: [{ id: "gl-editor-styles", css: ".a{}" }] });
    const out = await routeFontPatches(ws, input, GLOBAL);
    expect(out.patches).toBe(input);
    expect(await ws.exists(GLOBAL)).toBe(false);
  });
});
