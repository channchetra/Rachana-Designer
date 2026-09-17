/**
 * Editor session — the per-document half of the host.
 *
 * Owns everything the original extension's `MessageHandler` instance owned for
 * one open file:
 *
 *  - the raw source text as read from the workspace (the patch baseline),
 *  - split Astro/Markdown frontmatter, restored untouched on save,
 *  - the *display* HTML handed to the canvas iframe,
 *  - the generated inject script (`window.__GL_ORIGINAL_HTML` + editor-inject.js),
 *  - saving via byte-preserving patches, or full-content fallback,
 *  - the same `hash`-free lifecycle: open → edit → save → repeat.
 *
 * Crucially, saving **never** round-trips through the DOM: `applyPatches`
 * splices the exact original bytes, so comments, formatting and unrelated
 * attributes survive untouched.
 */

import type { Workspace } from "@/platform/fs/types";
import { basename, dirname, joinPath } from "@/platform/fs/types";
import { decodeUtf8, encodeUtf8 } from "@/platform/fs/types";
import {
  applyPatches,
  stripBrowserExtensionArtifacts,
  type SavePatches,
} from "@/platform/html/htmlPatcher";
import {
  fixAstroComponentTagsForDisplay,
  hasContentTypeMeta,
  htmlToMarkdown,
  markdownToHtml,
  splitFrontmatter,
  stripAutoInsertedContentTypeMeta,
  stripDisplayTransforms,
  type DocumentKind,
} from "@/platform/html/document";
import { DisplayPipeline } from "@/platform/html/displayPipeline";
import { collectFrontmatterCss } from "./astroCss";
import { routeFontPatches, routeStylePatches } from "./styleRouter";

import editorInjectSource from "@/platform/canvas/editor-inject.js?raw";

export interface SessionSnapshot {
  path: string;
  filename: string;
  dir: string;
  kind: DocumentKind;
  /** HTML handed to the canvas (display transforms applied). */
  displayHtml: string;
  /** Raw body with frontmatter removed — the patch baseline. */
  rawHtml: string;
  /** Full original file text including frontmatter. */
  originalFileText: string;
  frontmatter: string;
  injectScript: string;
  isMarkdown: boolean;
  isAstro: boolean;
  unresolvedAssets: string[];
}

export interface SaveOutcome {
  ok: boolean;
  error?: string;
  /** The file text written, on success. */
  written?: string;
}

/**
 * Encode the raw HTML into the inject script the same way the original host
 * did: a URI-encoded payload plus the unmodified inject source.
 */
export function buildInjectScript(rawHtml: string): string {
  const encoded = encodeURIComponent(rawHtml);
  return `window.__GL_ORIGINAL_HTML = decodeURIComponent(${JSON.stringify(encoded)});\n${editorInjectSource}`;
}

export class EditorSession {
  /** Raw body (frontmatter removed) that patches are applied to. */
  private rawHtml = "";
  /** Full original file text, used for full-content saves. */
  private fileText = "";
  private frontmatter = "";
  private kind: DocumentKind = "html";
  private path = "";
  private hadContentTypeMeta = false;
  /** Saved base-href so relative assets keep resolving after a patch save. */
  private displayBaseHref: string | null = null;
  private headCss: string | null = null;

  constructor(private workspace: Workspace) {}

  /* ----------------------------- accessors ---------------------------- */

  get currentPath(): string {
    return this.path;
  }
  get currentKind(): DocumentKind {
    return this.kind;
  }
  get isAstro(): boolean {
    return this.kind === "astro";
  }
  get isMarkdown(): boolean {
    return this.kind === "markdown";
  }
  get isHtml(): boolean {
    return this.kind === "html";
  }
  get raw(): string {
    return this.rawHtml;
  }
  get filename(): string {
    return this.path ? basename(this.path) : "";
  }

  private get globalCssPath(): string {
    // Resolved against the workspace root; matches the original convention.
    return "src/styles/global.css";
  }

  /* ------------------------------- open ------------------------------- */

  /**
   * Read `path` from the workspace and prepare it for the canvas.
   * Returns everything the `FILE_CONTENT` host message needs.
   */
  async open(path: string, opts: { styleScope: "global" | "local" } = { styleScope: "local" }): Promise<SessionSnapshot> {
    this.path = path;
    const fileText = await this.workspace.readText(path);
    this.fileText = fileText;

    const { frontmatter, body } = splitFrontmatter(fileText);
    const lower = path.toLowerCase();
    const isMarkdown = lower.endsWith(".md") || lower.endsWith(".mdx");
    const isAstro = lower.endsWith(".astro");
    this.kind = isMarkdown ? "markdown" : isAstro ? "astro" : "html";
    this.frontmatter = frontmatter;

    let rawHtml: string;
    if (isMarkdown) {
      rawHtml = markdownToHtml(body);
    } else {
      rawHtml = body;
    }

    // Remove browser-extension / editor artefacts a previous edit may have left.
    rawHtml = stripBrowserExtensionArtifacts(rawHtml);
    this.rawHtml = rawHtml;
    this.hadContentTypeMeta = hasContentTypeMeta(rawHtml);

    // Full display pass. Markdown already produced a complete document, so it
    // only needs the inject script (handled by the caller).
    await this.prepareDisplay(opts);

    const injectScript = buildInjectScript(this.rawHtml);

    return {
      path,
      filename: basename(path),
      dir: dirname(path),
      kind: this.kind,
      displayHtml: this.displayHtml,
      rawHtml: this.rawHtml,
      originalFileText: fileText,
      frontmatter,
      injectScript,
      isMarkdown,
      isAstro,
      unresolvedAssets: this.unresolvedAssets,
    };
  }

  private displayHtml = "";
  private unresolvedAssets: string[] = [];

  /**
   * Build the canvas HTML: rewrite assets, add `<base>`, inline Astro
   * frontmatter CSS, normalise Astro component tags.
   */
  private async prepareDisplay(opts: { styleScope: "global" | "local" }): Promise<void> {
    void opts;

    // Assets are addressed relative to the document's directory. A blob URL for
    // that directory cannot be produced, so the pipeline inlines each asset
    // (data: URIs) and inlines local stylesheets instead — which makes a
    // <base> unnecessary for correctness, but harmless and helpful for any
    // remaining relative URL.
    this.displayBaseHref = null;

    let headCss: string | null = null;
    if (this.kind === "astro") {
      const collected = await collectFrontmatterCss(this.path, this.workspace, (p) =>
        this.workspace.toDisplayUrl(p)
      );
      headCss = collected.blocks || null;
    }
    this.headCss = headCss;

    const pipeline = new DisplayPipeline(this.workspace, {
      baseHref: this.displayBaseHref,
      headCss,
    });
    const result = await pipeline.transform(this.rawHtml, this.path);
    this.unresolvedAssets = result.unresolved;
    this.displayHtml =
      this.kind === "astro" ? fixAstroComponentTagsForDisplay(result.html) : result.html;
  }

  /* ------------------------------- save ------------------------------- */

  /**
   * Apply editor patches and write the file.
   *
   * For Astro files the routable style blocks are first pushed into the
   * project's CSS (global scope) or a local `data-gl-editor` style block, which
   * mutates the current file HTML before patching — exactly as the original
   * host did.
   */
  async savePatches(
    patches: SavePatches,
    opts: { styleScope: "global" | "local" }
  ): Promise<SaveOutcome> {
    try {
      let workingHtml = this.rawHtml;
      let workingPatches = patches;

      if (this.kind === "astro") {
        const fontRouted = await routeFontPatches(this.workspace, workingPatches, this.globalCssPath);
        workingPatches = fontRouted.patches;
        const routed = await routeStylePatches(
          this.workspace,
          this.path,
          workingHtml,
          workingPatches,
          opts.styleScope,
          this.globalCssPath
        );
        workingHtml = routed.currentFileHtml;
        workingPatches = routed.patches;
        for (const line of routed.log) console.debug("[Rachana]", line);
      }

      const patched = applyPatches(workingHtml, workingPatches, {
        allowDocumentScaffold: this.kind === "html",
      });
      this.rawHtml = patched;

      const fileText = this.isMarkdown
        ? this.frontmatter + htmlToMarkdown(patched)
        : this.frontmatter + patched;

      await this.workspace.writeText(this.path, fileText);
      this.fileText = fileText;

      // Refresh the display document so the canvas and the saved file stay in
      // sync (asset URLs and inlined CSS can both have changed).
      await this.prepareDisplay({ styleScope: opts.styleScope });

      return { ok: true, written: fileText };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  /**
   * Full-document save. Used by markdown mode, snapshot restore and any code
   * path that legitimately replaces the whole document.
   */
  async saveFullContent(content: string, opts: { styleScope: "global" | "local" }): Promise<SaveOutcome> {
    try {
      // Drop every display-only transform the canvas may have echoed back.
      let clean = stripDisplayTransforms(content, this.hadContentTypeMeta);
      clean = stripAutoInsertedContentTypeMeta(clean, this.hadContentTypeMeta);

      this.rawHtml = clean;
      const fileText = this.isMarkdown
        ? this.frontmatter + htmlToMarkdown(clean)
        : this.frontmatter + clean;

      await this.workspace.writeText(this.path, fileText);
      this.fileText = fileText;
      await this.prepareDisplay(opts);
      return { ok: true, written: fileText };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  /**
   * Re-read the file from disk after an external change.
   * Returns null when the workspace has no newer content.
   */
  async refreshFromWorkspace(): Promise<{ content: string; rawHtml: string } | null> {
    if (!this.path) return null;
    try {
      const text = await this.workspace.readText(this.path);
      if (text === this.fileText) return null;
      const snapshot = await this.open(this.path, { styleScope: "local" });
      return { content: snapshot.displayHtml, rawHtml: snapshot.rawHtml };
    } catch {
      return null;
    }
  }

  /* ----------------------------- utilities ---------------------------- */

  /** Write arbitrary text to a workspace path (used by Live-mode editing). */
  async writeTextFile(path: string, content: string): Promise<void> {
    await this.workspace.writeText(path, content);
  }

  /** Read a sibling asset as bytes (used by the exporter and screenshots). */
  async readBinary(path: string): Promise<Uint8Array> {
    return this.workspace.readBinary(path);
  }

  /** Resolve a document-relative URL to a workspace path. */
  async resolveAsset(url: string): Promise<string | null> {
    const trimmed = url.trim();
    if (!trimmed || /^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(trimmed)) return null;
    const pathname = trimmed.split(/[?#]/)[0];
    if (!pathname) return null;
    const candidate = pathname.startsWith("/")
      ? [joinPath("public", pathname.replace(/^\/+/, "")), pathname.replace(/^\/+/, "")]
      : [joinPath(dirname(this.path), pathname)];
    for (const c of candidate) {
      if (await this.workspace.exists(c)) return c;
    }
    return null;
  }

  /** Absolute-ish workspace path helper for messages that need one. */
  resolveInWorkspace(relative: string): string {
    return joinPath(dirname(this.path), relative);
  }

  /** Text encoder/decoder passthrough so callers avoid importing twice. */
  encode(text: string): Uint8Array {
    return encodeUtf8(text);
  }
  decode(bytes: Uint8Array): string {
    return decodeUtf8(bytes);
  }
}
