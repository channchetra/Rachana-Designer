/**
 * Canvas display pipeline.
 *
 * The editor canvas is an `<iframe srcdoc>`, whose origin is null and which
 * therefore cannot resolve the user's relative asset paths (`images/hero.png`,
 * `../styles/site.css`, `/assets/logo.svg`). This module rewrites the document
 * *for display only* so those assets resolve:
 *
 *  - relative `<img src>` / `srcset` / `poster` → `data:` URIs (keeping the
 *    original in `data-gl-original-src` so saves can restore it),
 *  - relative `<link rel="stylesheet">` → inlined `<style data-gl-inlined>`
 *    (CSS `url()` references inside are rewritten too),
 *  - a `<base data-gl-base>` pointing at the directory's blob URL.
 *
 * Nothing produced here is ever written back to the user's file: saving always
 * patches the raw source. `stripDisplayTransforms` reverses the visible parts
 * if a full-document save is ever used.
 */

import type { Workspace } from "@/platform/fs/types";
import { dirname, joinPath, mimeForPath } from "@/platform/fs/types";
import { bytesToDataUri } from "@/platform/fs/types";

export interface DisplayPipelineOptions {
  /** Absolute-looking URL for the document's own directory (used for <base>). */
  baseHref?: string | null;
  /** Extra `<style>` markup to inject into <head> (Astro frontmatter CSS). */
  headCss?: string | null;
  /** Cap on the size of a single inlined asset, in bytes. */
  maxInlineBytes?: number;
}

const DEFAULT_MAX_INLINE = 4 * 1024 * 1024;

export interface DisplayPipelineResult {
  html: string;
  /** Assets that could not be resolved (kept as-is, reported for diagnostics). */
  unresolved: string[];
}

/** URLs that must never be treated as workspace-relative. */
function isExternalUrl(url: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(url) || url.trim() === "";
}

/**
 * Split a URL into its path and suffix, ignoring query/hash when resolving.
 */
function splitUrl(url: string): { pathname: string; suffix: string } {
  const match = url.match(/^([^?#]*)([\s\S]*)$/);
  return { pathname: match?.[1] ?? url, suffix: match?.[2] ?? "" };
}

export class DisplayPipeline {
  private unresolved = new Set<string>();
  /** Cache of resolved path → display URL, so repeated assets are read once. */
  private urlCache = new Map<string, string>();

  constructor(
    private workspace: Workspace,
    private options: DisplayPipelineOptions = {}
  ) {}

  private get maxInlineBytes(): number {
    return this.options.maxInlineBytes ?? DEFAULT_MAX_INLINE;
  }

  /** Resolve a workspace-relative URL to a workspace path (or null). */
  private async resolve(assetUrl: string, ownerPath: string): Promise<string | null> {
    if (isExternalUrl(assetUrl)) return null;
    const { pathname } = splitUrl(assetUrl);
    if (!pathname) return null;

    const candidates = pathname.startsWith("/")
      ? [joinPath("public", pathname.replace(/^\/+/, "")), pathname.replace(/^\/+/, "")]
      : [joinPath(dirname(ownerPath), pathname)];

    for (const candidate of candidates) {
      if (await this.workspace.exists(candidate)) return candidate;
    }
    return null;
  }

  /** Produce a URL the sandboxed iframe can load for `path`. */
  private async displayUrl(path: string): Promise<string | null> {
    const cached = this.urlCache.get(path);
    if (cached) return cached;
    try {
      const stat = await this.workspace.stat(path);
      if (!stat.exists || stat.isDirectory) return null;
      if (stat.size > this.maxInlineBytes) {
        // Too large to inline — let the workspace decide (may be a blob URL).
        const url = await this.workspace.toDisplayUrl(path);
        this.urlCache.set(path, url);
        return url;
      }
      const data = await this.workspace.readBinary(path);
      const url = bytesToDataUri(data, mimeForPath(path));
      this.urlCache.set(path, url);
      return url;
    } catch {
      return null;
    }
  }

  /** Rewrite `url(...)` refs inside a CSS string. */
  async rewriteCssUrls(css: string, ownerPath: string): Promise<string> {
    const matches = [...css.matchAll(/url\(\s*(["']?)([^)"']+)\1\s*\)/gi)];
    let out = css;
    for (const match of matches) {
      const raw = match[2];
      if (isExternalUrl(raw)) continue;
      const resolved = await this.resolve(raw, ownerPath);
      if (!resolved) {
        this.unresolved.add(raw);
        continue;
      }
      const url = await this.displayUrl(resolved);
      if (!url) continue;
      out = out.split(match[0]).join(`url("${url}")`);
    }
    return out;
  }

  /** Rewrite src/poster attributes on media elements and inline local CSS links. */
  private async rewriteMedia(html: string, ownerPath: string): Promise<string> {
    // Collect the replacements first so the async reads happen before splicing.
    const jobs: { full: string; replacement: string }[] = [];

    const mediaRe = /(<(?:img|source|video|audio)\b[^>]*?\s)(src|poster)\s*=\s*"([^"]+)"/gi;
    for (const match of html.matchAll(mediaRe)) {
      const [full, before, attr, src] = match;
      if (isExternalUrl(src)) continue;
      const resolved = await this.resolve(src, ownerPath);
      if (!resolved) {
        this.unresolved.add(src);
        continue;
      }
      const url = await this.displayUrl(resolved);
      if (!url) continue;
      jobs.push({
        full,
        replacement: `${before}data-gl-original-${attr}="${src}" ${attr}="${url}"`,
      });
    }

    // srcset: rewrite each candidate URL independently.
    const srcsetRe = /(<(?:img|source)\b[^>]*?\s)(srcset)\s*=\s*"([^"]+)"/gi;
    for (const match of html.matchAll(srcsetRe)) {
      const [full, before, attr, value] = match;
      const parts = value.split(",").map((s) => s.trim()).filter(Boolean);
      const rewritten: string[] = [];
      let changed = false;
      for (const part of parts) {
        const [url, ...descriptor] = part.split(/\s+/);
        if (isExternalUrl(url)) {
          rewritten.push(part);
          continue;
        }
        const resolved = await this.resolve(url, ownerPath);
        if (!resolved) {
          rewritten.push(part);
          continue;
        }
        const display = await this.displayUrl(resolved);
        if (!display) {
          rewritten.push(part);
          continue;
        }
        rewritten.push([display, ...descriptor].join(" "));
        changed = true;
      }
      if (changed) {
        jobs.push({
          full,
          replacement: `${before}data-gl-original-${attr}="${value}" ${attr}="${rewritten.join(", ")}"`,
        });
      }
    }

    // Local stylesheets are inlined, because a <link> inside srcdoc cannot load
    // a sibling file even with a <base> (the sheet is fetched by the inner doc).
    const linkRe = /<link\s+[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi;
    for (const match of html.matchAll(linkRe)) {
      const linkTag = match[0];
      const hrefMatch = linkTag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (!hrefMatch) continue;
      const href = hrefMatch[1];
      if (isExternalUrl(href)) continue;
      const resolved = await this.resolve(href, ownerPath);
      if (!resolved) {
        this.unresolved.add(href);
        continue;
      }
      try {
        const css = await this.workspace.readText(resolved);
        const rewritten = await this.rewriteCssUrls(css, resolved);
        jobs.push({
          full: linkTag,
          replacement: `<!-- gl-original-link: ${linkTag} -->\n<style data-gl-inlined="${href}">\n${rewritten}\n</style>`,
        });
      } catch {
        this.unresolved.add(href);
      }
    }

    let out = html;
    for (const job of jobs) {
      // split/join avoids `$&`-style expansion in the replacement.
      out = out.split(job.full).join(job.replacement);
    }
    return out;
  }

  /**
   * Run the full display transform for a document.
   *
   * @param html   The raw body HTML (frontmatter already removed).
   * @param path   The workspace path of the document.
   */
  async transform(html: string, path: string): Promise<DisplayPipelineResult> {
    this.unresolved.clear();
    let out = html;

    out = await this.rewriteMedia(out, path);

    // Full documents get a <base> so any remaining relative URL resolves.
    const baseHref = this.options.baseHref;
    if (baseHref && !/<base\b[^>]*data-gl-base="true"[^>]*>/i.test(out)) {
      const normalized = baseHref.endsWith("/") ? baseHref : `${baseHref}/`;
      const baseTag = `<base data-gl-base="true" href="${normalized}">`;
      if (/<head\b[^>]*>/i.test(out)) {
        out = out.replace(/(<head\b[^>]*>)/i, `$1\n${baseTag}`);
      } else if (/<html\b[^>]*>/i.test(out)) {
        out = out.replace(/(<html\b[^>]*>)/i, `$1\n<head>\n${baseTag}\n</head>`);
      } else {
        out = `<head>\n${baseTag}\n</head>\n${out}`;
      }
    }

    if (this.options.headCss) {
      const wrapped = `\n<!-- gl-fm-css-start -->\n${this.options.headCss}\n<!-- gl-fm-css-end -->\n`;
      if (/<\/head>/i.test(out)) out = out.replace(/<\/head>/i, () => `${wrapped}</head>`);
      else if (/<head\b[^>]*>/i.test(out)) out = out.replace(/(<head\b[^>]*>)/i, (_m, open) => `${open}${wrapped}`);
      else if (/<html\b[^>]*>/i.test(out)) out = out.replace(/(<html\b[^>]*>)/i, (_m, open) => `${open}\n<head>${wrapped}</head>`);
      else out = `<head>${wrapped}</head>\n${out}`;
    }

    return { html: out, unresolved: [...this.unresolved] };
  }
}
