/**
 * Astro frontmatter CSS collection.
 *
 * A browser cannot run the Astro compiler, so the original host's
 * "collect every CSS file the component actually imports, transitively" pass is
 * re-implemented as a best-effort source walk:
 *
 *  - `.astro` frontmatter `import "./x.css"` becomes an inlined `<style>` block,
 *  - `.astro` frontmatter `import Layout from "./Layout.astro"` is followed
 *    recursively (depth-limited) so layout-level stylesheets are picked up,
 *  - a scoped `<style>` block inside the component body is collected verbatim
 *    (its Astro `:where()`/hash scoping cannot be reproduced, so the raw
 *    declarations are inlined unwrapped — accurate enough to preview).
 *
 * Results are display-only: they are injected into the canvas document and
 * never written back to the user's file.
 */

import type { Workspace } from "@/platform/fs/types";
import { dirname, joinPath } from "@/platform/fs/types";
import { splitFrontmatter } from "@/platform/html/document";

const MAX_DEPTH = 8;
const MAX_FILES = 200;

export interface FrontmatterCssResult {
  /** Ready-to-inject `<style>` markup. */
  blocks: string;
  /** Files that were read, for diagnostics. */
  visited: string[];
}

/** Rewrite relative `url()` refs in a stylesheet to data/blob URLs. */
async function rewriteCssUrls(
  css: string,
  ownerPath: string,
  workspace: Workspace,
  toUrl: (path: string) => Promise<string | null>
): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)];
  let out = css;
  for (const match of matches) {
    const raw = match[2];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(raw)) continue;
    const pathname = raw.split(/[?#]/)[0];
    if (!pathname) continue;
    const candidate = pathname.startsWith("/")
      ? joinPath("public", pathname.replace(/^\/+/, ""))
      : joinPath(dirname(ownerPath), pathname);
    if (!(await workspace.exists(candidate))) continue;
    const url = await toUrl(candidate);
    if (!url) continue;
    out = out.split(match[0]).join(`url("${url}")`);
  }
  return out;
}

/**
 * Extract the first `<style>` block of an `.astro` component body.
 * Astro scoping attributes are dropped because the wrapper element does not
 * exist in the preview document.
 */
function extractInlineStyle(body: string): string | null {
  const match = body.match(/<style\b[^>]*>([\s\S]*?)<\/style>/i);
  return match ? match[1].trim() : null;
}

/**
 * Collect frontmatter-referenced CSS for an Astro document.
 *
 * @param entryPath  Workspace path of the `.astro` file being edited.
 * @param workspace  Workspace used to read sibling files.
 * @param toUrl      Resolves a workspace path to a URL the canvas can load.
 */
export async function collectFrontmatterCss(
  entryPath: string,
  workspace: Workspace,
  toUrl: (path: string) => Promise<string | null>
): Promise<FrontmatterCssResult> {
  const visited = new Set<string>();
  const blocks: string[] = [];

  const walk = async (path: string, depth: number, isEntry: boolean): Promise<void> => {
    if (depth > MAX_DEPTH || visited.size >= MAX_FILES) return;
    if (visited.has(path)) return;
    visited.add(path);

    let content: string;
    try {
      content = await workspace.readText(path);
    } catch {
      return;
    }

    const { body } = splitFrontmatter(content);
    const fmMatch = content.match(/^---([\s\S]*?)---/);
    const frontmatter = fmMatch ? fmMatch[1] : "";
    const dir = dirname(path);

    // 1. Direct stylesheet imports in the frontmatter.
    const cssRe = /import\s+["']([^"']+\.(?:css|scss|sass|less))["']/g;
    for (const match of frontmatter.matchAll(cssRe)) {
      const ref = match[1];
      if (!ref.startsWith(".") && !ref.startsWith("/")) continue;
      if (!ref.endsWith(".css")) continue; // browsers cannot compile scss/less
      const cssPath = ref.startsWith("/")
        ? joinPath("public", ref.replace(/^\/+/, ""))
        : joinPath(dir, ref);
      try {
        const css = await workspace.readText(cssPath);
        const rewritten = await rewriteCssUrls(css, cssPath, workspace, toUrl);
        blocks.push(`<style data-gl-fm-css="${ref}">\n${rewritten}\n</style>`);
      } catch {
        /* ignore missing stylesheet */
      }
    }

    // 2. Component imports, followed recursively so layout CSS is included.
    const compRe = /import\s+\w+(?:\s*,\s*\{[^}]*\})?\s+from\s+["']([^"']+\.astro)["']/g;
    for (const match of frontmatter.matchAll(compRe)) {
      const ref = match[1];
      if (!ref.startsWith(".") && !ref.startsWith("/")) continue;
      const compPath = ref.startsWith("/")
        ? joinPath("public", ref.replace(/^\/+/, ""))
        : joinPath(dir, ref);
      await walk(compPath, depth + 1, false);
    }

    // 3. The component's own scoped <style> block (entry file included —
    //    its own style block is exactly what the user expects to see).
    const inline = extractInlineStyle(body);
    if (inline && inline.length > 0) {
      const rewritten = await rewriteCssUrls(inline, path, workspace, toUrl);
      blocks.push(`<style data-gl-fm-css="${isEntry ? "self" : path}">\n${rewritten}\n</style>`);
    }
  };

  await walk(entryPath, 0, true);
  return { blocks: blocks.join("\n"), visited: [...visited] };
}
