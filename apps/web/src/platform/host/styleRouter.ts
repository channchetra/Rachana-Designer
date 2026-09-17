/**
 * CSS routing for Astro projects.
 *
 * Ported from the original host's `styleRouter.ts` with `node:fs` replaced by
 * the workspace abstraction. The behaviour is otherwise identical, including
 * the managed comment segments, the reserved style-block ids and the
 * `data-gl-editor` local style block.
 *
 * When a style patch targets a selector that already exists in one of the
 * project's CSS files, the rule is edited there. Otherwise it is appended to
 * `src/styles/global.css` (global scope) or to a `<style data-gl-editor>` block
 * in the current file (local scope).
 */

import type { Workspace } from "@/platform/fs/types";
import { dirname, joinPath } from "@/platform/fs/types";
import type { SavePatches } from "@/platform/html/htmlPatcher";

const SKIPPED_DIRS = new Set([
  ".git",
  ".vscode",
  "node_modules",
  "dist",
  "dist-electron",
  "dist-renderer",
  ".astro",
]);

export interface CssRule {
  selector: string;
  /** The whole rule text including the selector and braces. */
  full: string;
  start: number;
  end: number;
}

/** Split a stylesheet into top-level rules, ignoring comments and strings. */
export function splitCssRules(css: string): CssRule[] {
  const rules: CssRule[] = [];
  let i = 0;
  let depth = 0;
  /** Offset of the first non-whitespace character of the rule being read. */
  let ruleStart = -1;
  /** Offset of the `{` that opened the current top-level rule. */
  let blockStart = -1;
  let quote: string | null = null;
  let inComment = false;

  const emit = (endExclusive: number) => {
    if (ruleStart === -1 || blockStart === -1) return;
    const selector = css.slice(ruleStart, blockStart).trim();
    if (!selector) return;
    const full = css.slice(ruleStart, endExclusive).trim();
    rules.push({ selector, full, start: ruleStart, end: endExclusive });
  };

  while (i < css.length) {
    const ch = css[i];
    const next = css[i + 1];

    if (inComment) {
      if (ch === "*" && next === "/") {
        inComment = false;
        i += 2;
        continue;
      }
      i++;
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inComment = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      i++;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) blockStart = i;
      depth++;
      i++;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) depth--;
      if (depth === 0) {
        emit(i + 1);
        ruleStart = -1;
        blockStart = -1;
      }
      i++;
      continue;
    }
    if (ch === ";" && depth === 0) {
      // A bare at-rule such as `@import url(...);` — not a rule we route.
      ruleStart = -1;
      blockStart = -1;
      i++;
      continue;
    }
    if (depth === 0 && ruleStart === -1 && !/\s/.test(ch)) ruleStart = i;
    i++;
  }

  return rules;
}

export function normalizeSelector(selector: string): string {
  return selector.replace(/\s+/g, " ").trim();
}

/** Find a rule by selector anywhere in a stylesheet. */
export function findRuleInCss(css: string, selector: string): { start: number; end: number } | null {
  const target = normalizeSelector(selector);
  for (const rule of splitCssRules(css)) {
    if (normalizeSelector(rule.selector) === target) {
      return { start: rule.start, end: rule.end };
    }
  }
  return null;
}

/** Depth-limited recursive search for project stylesheets. */
export async function listProjectCssFiles(workspace: Workspace, rootPath: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (path: string, depth: number): Promise<void> => {
    if (depth > 8 || out.length > 400) return;
    let entries: Awaited<ReturnType<Workspace["list"]>> = [];
    try {
      entries = await workspace.list(path);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.kind === "directory") {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        if (entry.name.startsWith(".") && entry.name !== ".well-known") continue;
        await walk(entry.path, depth + 1);
        continue;
      }
      if (entry.ext === ".css") out.push(entry.path);
    }
  };
  await walk(rootPath, 0);
  return out;
}

/* ------------------------------------------------------------------ *
 * Managed segments in global.css
 * ------------------------------------------------------------------ */

const FONT_SEGMENT_IDS = new Set(["gl-design-system-fonts", "gl-design-system-font-overrides"]);
const FONT_IMPORTS_SEGMENT_ID = "gl-font-imports";

function segmentMarkers(id: string): { start: string; end: string } {
  return { start: `/* ${id}:start */`, end: `/* ${id}:end */` };
}

function findSegment(css: string, id: string): { start: number; end: number; body: string } | null {
  const { start, end } = segmentMarkers(id);
  const startIdx = css.indexOf(start);
  if (startIdx === -1) return null;
  const endIdx = css.indexOf(end, startIdx + start.length);
  if (endIdx === -1) return null;
  return {
    start: startIdx,
    end: endIdx + end.length,
    body: css.slice(startIdx + start.length, endIdx),
  };
}

function removeSegment(css: string, id: string): string {
  const found = findSegment(css, id);
  if (!found) return css;
  return css.slice(0, found.start) + css.slice(found.end);
}

/**
 * Split a stylesheet into statements for de-duplication purposes.
 *
 * A statement is either a block (`selector { … }`, `@media … { … }`) or a bare
 * at-rule (`@import …;`). The original implementation only understood blocks,
 * which silently dropped `@import` lines and mis-handled `@font-face`.
 */
function splitCssStatements(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  let quote: string | null = null;
  let inComment = false;

  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const next = css[i + 1];
    current += ch;

    if (inComment) {
      if (ch === "*" && next === "/") {
        inComment = false;
        current += next;
        i++;
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        if (next !== undefined) {
          current += next;
          i++;
        }
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "/" && next === "*") {
      inComment = true;
      current += next;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
      continue;
    }
    if (ch === "}") {
      if (depth > 0) depth--;
      if (depth === 0) {
        if (current.trim()) out.push(current.trim());
        current = "";
      }
      continue;
    }
    if (ch === ";" && depth === 0) {
      if (current.trim()) out.push(current.trim());
      current = "";
    }
  }

  if (current.trim()) out.push(current.trim());
  return out;
}

/** Merge new CSS into a segment body, de-duplicating whole statements. */
function mergeSegmentBody(existingBody: string, newCss: string): string {
  const key = (s: string) => s.replace(/\s+/g, " ").trim();
  const existingKeys = new Set(splitCssStatements(existingBody).map(key).filter(Boolean));
  const additions = splitCssStatements(newCss).filter((s) => {
    const k = key(s);
    return k && !existingKeys.has(k);
  });

  const base = existingBody.trim();
  if (additions.length === 0) return base;
  return (base ? base + "\n" : "") + additions.join("\n");
}

function upsertSegment(css: string, id: string, body: string, position: "top" | "bottom"): string {
  const { start, end } = segmentMarkers(id);
  const block = `${start}\n${body}\n${end}\n`;
  const found = findSegment(css, id);
  if (found) {
    return css.slice(0, found.start) + block + css.slice(found.end).replace(/^\n/, "");
  }
  const trimmed = css.trim();
  if (!trimmed) return block;
  return position === "top" ? block + "\n" + trimmed + "\n" : trimmed + "\n\n" + block;
}

function splitCssBlocks(css: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of css) {
    current += ch;
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth <= 0) {
        if (current.trim()) out.push(current.trim());
        current = "";
        depth = 0;
      }
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function extractHrefFromLinkTag(outerHTML: string): string | null {
  const match = outerHTML.match(/href\s*=\s*["']([^"']+)["']/i);
  return match ? match[1] : null;
}

/** Ids whose style blocks are safe to route into project CSS. */
export function isRoutableEditorBlockId(id: string): boolean {
  if (id === "gl-editor-styles" || id === "gl-button-styles" || id === "gl-section-styles") return true;
  if (FONT_SEGMENT_IDS.has(id)) return false;
  return /^(gl-design-system-|gl-layout-|gl-anim-|gl-tpl-)/.test(id);
}

/* ------------------------------------------------------------------ *
 * Global stylesheet helpers
 * ------------------------------------------------------------------ */

async function ensureGlobalCssImported(workspace: Workspace, globalCssPath: string): Promise<void> {
  // Inject `import "<relative>/global.css"` into the first src/layouts/*.astro.
  const layouts = await workspace.list("src/layouts").catch(() => []);
  const layout = layouts.find((f) => f.kind === "file" && f.ext === ".astro");
  if (!layout) return;

  const layoutPath = layout.path;
  let content: string;
  try {
    content = await workspace.readText(layoutPath);
  } catch {
    return;
  }

  const relative = relativeImport(dirname(layoutPath), globalCssPath);
  if (content.includes(relative)) return;

  const fmMatch = content.match(/^---([\s\S]*?)---\n?/);
  if (fmMatch) {
    const updated = content.replace(/^---([\s\S]*?)---\n?/, (whole, inner: string) => {
      if (inner.includes(relative)) return whole;
      return `---${inner}${inner.endsWith("\n") ? "" : "\n"}import "${relative}";\n---\n`;
    });
    await workspace.writeText(layoutPath, updated);
  } else {
    await workspace.writeText(layoutPath, `---\nimport "${relative}";\n---\n${content}`);
  }
}

/** Build a POSIX relative import specifier between two workspace paths. */
export function relativeImport(fromDir: string, toPath: string): string {
  const from = fromDir.split("/").filter(Boolean);
  const to = toPath.split("/").filter(Boolean);
  let common = 0;
  while (common < from.length && common < to.length - 1 && from[common] === to[common]) common++;
  const up = Array.from({ length: from.length - common }, () => "..");
  const down = to.slice(common);
  const spec = [...up, ...down].join("/");
  return spec.startsWith(".") ? spec : `./${spec}`;
}

async function appendRuleToGlobalCss(
  workspace: Workspace,
  globalCssPath: string,
  ruleText: string,
  selector: string
): Promise<void> {
  let existing = "";
  let created = false;
  try {
    existing = await workspace.readText(globalCssPath);
  } catch {
    created = true;
  }

  const location = findRuleInCss(existing, selector);
  const next =
    location !== null
      ? existing.slice(0, location.start) + ruleText + existing.slice(location.end)
      : existing.trim()
        ? `${existing.trim()}\n\n${ruleText}\n`
        : `${ruleText}\n`;

  await workspace.writeText(globalCssPath, next);
  if (created) await ensureGlobalCssImported(workspace, globalCssPath);
}

/* ------------------------------------------------------------------ *
 * Local editor style block
 * ------------------------------------------------------------------ */

const LOCAL_STYLE_RE = /<style\b([^>]*\bdata-gl-editor\b[^>]*)>([\s\S]*?)<\/style>/i;

function upsertLocalEditorStyle(html: string, ruleText: string, selector: string): string {
  const match = html.match(LOCAL_STYLE_RE);
  if (!match) {
    return `<style is:global data-gl-editor>\n${ruleText}\n</style>\n${html}`;
  }
  const [whole, attrs, inner] = match;
  const location = findRuleInCss(inner, selector);
  const nextInner =
    location !== null
      ? inner.slice(0, location.start) + ruleText + inner.slice(location.end)
      : `${inner.trim()}${inner.trim() ? "\n\n" : "\n"}${ruleText}\n`;
  const replacement = `<style${attrs}>${nextInner}</style>`;
  return html.split(whole).join(replacement);
}

async function findExistingRuleLocation(
  workspace: Workspace,
  selector: string,
  cssFiles: string[],
  currentFileHtml: string
): Promise<{ kind: "css" | "style"; filePath: string; start: number; end: number } | null> {
  for (const filePath of cssFiles) {
    try {
      const css = await workspace.readText(filePath);
      const location = findRuleInCss(css, selector);
      if (location) return { kind: "css", filePath, ...location };
    } catch {
      /* unreadable file — skip */
    }
  }
  const styleMatch = currentFileHtml.match(LOCAL_STYLE_RE);
  if (styleMatch) {
    const inner = styleMatch[2];
    const location = findRuleInCss(inner, selector);
    if (location) {
      const offset = (styleMatch.index ?? 0) + styleMatch[0].indexOf(inner);
      return { kind: "style", filePath: "", start: offset + location.start, end: offset + location.end };
    }
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Public routing entrypoint
 * ------------------------------------------------------------------ */

export interface RouteOutcome {
  patches: SavePatches;
  currentFileHtml: string;
  routedSelectors: string[];
  log: string[];
}

/**
 * Route routable style blocks into project CSS or the local editor style block.
 * Non-routable blocks pass through to the HTML patcher untouched.
 */
export async function routeStylePatches(
  workspace: Workspace,
  filePath: string,
  currentFileHtml: string,
  patches: SavePatches,
  scope: "global" | "local",
  globalCssPath: string
): Promise<RouteOutcome> {
  const log: string[] = [];
  const routedSelectors: string[] = [];
  const remainingBlocks: SavePatches["styleBlocks"] = [];
  let html = currentFileHtml;

  const cssFiles = await listProjectCssFiles(workspace, "");

  for (const block of patches.styleBlocks ?? []) {
    if (!isRoutableEditorBlockId(block.id)) {
      remainingBlocks.push(block);
      continue;
    }

    const rules = splitCssRules(block.css);
    const unrouted: CssRule[] = [];

    for (const rule of rules) {
      const existing = await findExistingRuleLocation(workspace, rule.selector, cssFiles, html);
      if (existing && existing.kind === "css") {
        try {
          const css = await workspace.readText(existing.filePath);
          await workspace.writeText(
            existing.filePath,
            css.slice(0, existing.start) + rule.full + css.slice(existing.end)
          );
          routedSelectors.push(rule.selector);
          log.push(`[route] updated "${rule.selector}" in ${existing.filePath}`);
          continue;
        } catch {
          /* fall through to the normal routing path */
        }
      }
      if (existing && existing.kind === "style") {
        html = html.slice(0, existing.start) + rule.full + html.slice(existing.end);
        routedSelectors.push(rule.selector);
        log.push(`[route] updated "${rule.selector}" in the local editor style block`);
        continue;
      }

      const isRootRule = rule.selector.trim().startsWith(":root");
      const effectiveScope = isRootRule ? "global" : scope;

      if (effectiveScope === "global") {
        await appendRuleToGlobalCss(workspace, globalCssPath, rule.full, rule.selector);
        routedSelectors.push(rule.selector);
        log.push(`[route] appended "${rule.selector}" to ${globalCssPath}`);
      } else {
        html = upsertLocalEditorStyle(html, rule.full, rule.selector);
        routedSelectors.push(rule.selector);
        log.push(`[route] added "${rule.selector}" to the local editor style block`);
      }
    }

    if (unrouted.length) {
      remainingBlocks.push({ ...block, css: unrouted.map((r) => r.full).join("\n") });
    }
  }

  return {
    patches: { ...patches, styleBlocks: remainingBlocks },
    currentFileHtml: html,
    routedSelectors,
    log,
  };
}

export interface FontRouteOutcome {
  patches: SavePatches;
  log: string[];
}

/**
 * Route typography blocks (font faces, Google Font `@import`s) into managed
 * segments of the project's global stylesheet.
 */
export async function routeFontPatches(
  workspace: Workspace,
  patches: SavePatches,
  globalCssPath: string
): Promise<FontRouteOutcome> {
  const log: string[] = [];
  const remainingBlocks: SavePatches["styleBlocks"] = [];
  const removals = new Set(patches.removedStyleBlockIds ?? []);

  const fontBlocks = (patches.styleBlocks ?? []).filter((b) => FONT_SEGMENT_IDS.has(b.id));
  for (const block of patches.styleBlocks ?? []) {
    if (!FONT_SEGMENT_IDS.has(block.id)) remainingBlocks.push(block);
  }
  const fontRemovals = [...removals].filter((id) => FONT_SEGMENT_IDS.has(id));

  const linkBlocks = (patches.linkBlocks ?? []).filter((b) => b.id.startsWith("gl-design-system-font"));
  const remainingLinkBlocks = (patches.linkBlocks ?? []).filter(
    (b) => !b.id.startsWith("gl-design-system-font")
  );
  const fontLinkRemovals = (patches.linkEdits ?? []).filter((e) => e.newOuterHTML.trim() === "");

  if (!fontBlocks.length && !fontRemovals.length && !linkBlocks.length && !fontLinkRemovals.length) {
    return { patches, log };
  }

  let css = "";
  let created = false;
  try {
    css = await workspace.readText(globalCssPath);
  } catch {
    created = true;
  }

  for (const id of fontRemovals) {
    css = removeSegment(css, id);
    log.push(`[fonts] removed segment ${id}`);
  }

  for (const block of fontBlocks) {
    const found = findSegment(css, block.id);
    const merged = mergeSegmentBody(found?.body ?? "", block.css);
    css = upsertSegment(
      css,
      block.id,
      merged,
      block.id === "gl-design-system-font-overrides" ? "bottom" : "top"
    );
    log.push(`[fonts] upserted segment ${block.id}`);
  }

  if (linkBlocks.length) {
    // Google Font links become @import lines in a dedicated top segment.
    const lines: string[] = [];
    for (const block of linkBlocks) {
      const href = extractHrefFromLinkTag(block.outerHTML);
      if (!href) continue;
      lines.push(`/* ${block.id} */ @import url("${href}");`);
    }
    const found = findSegment(css, FONT_IMPORTS_SEGMENT_ID);
    const merged = mergeSegmentBody(found?.body ?? "", lines.join("\n"));
    css = upsertSegment(css, FONT_IMPORTS_SEGMENT_ID, merged, "top");
    log.push(`[fonts] upserted ${linkBlocks.length} @import line(s)`);
  }

  // Always persist the result. A removal can legitimately leave the stylesheet
  // empty (or whitespace-only), and skipping the write in that case would leave
  // the deleted segment on disk — the bug this guard used to have.
  const next = css.trim();
  await workspace.writeText(globalCssPath, next ? `${next}\n` : "");
  if (created && next) await ensureGlobalCssImported(workspace, globalCssPath);

  // Font link removals are consumed here; everything else passes through.
  const remainingLinkEdits = (patches.linkEdits ?? []).filter((e) => e.newOuterHTML.trim() !== "");

  return {
    patches: {
      ...patches,
      styleBlocks: remainingBlocks,
      linkBlocks: remainingLinkBlocks,
      linkEdits: remainingLinkEdits,
      removedStyleBlockIds: (patches.removedStyleBlockIds ?? []).filter((id) => !FONT_SEGMENT_IDS.has(id)),
    },
    log,
  };
}

export { splitCssBlocks };
