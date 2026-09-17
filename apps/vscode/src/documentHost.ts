/**
 * Document host — the VS Code half of one open document.
 *
 * Reads the file, prepares it for the canvas, injects the canvas script, and
 * writes saves back as byte-preserving patches.
 *
 * The save invariant matches the web app exactly and is the reason this works at
 * all: `applyPatches` splices the **original source bytes**, so comments,
 * attribute quoting and unrelated formatting survive. Nothing is ever
 * re-serialised from the DOM.
 *
 * The canvas script is supplied by the host rather than fetched by the webview,
 * because it has to run inside the `srcdoc` iframe. It is read through the
 * `AssetsPort`, so this file has no idea where the bytes come from.
 */

import * as vscode from "vscode";
import { applyPatches, stripBrowserExtensionArtifacts, type SavePatches } from "@rachana/core/html";
import type { AssetsPort, SecretPort, StoragePort } from "@rachana/core/contracts";
import { basename, decodeUtf8, dirname, encodeUtf8 } from "@rachana/core/contracts";
import type { HostToWebviewMessage, WebviewToHostMessage } from "./protocol";
import type { VsCodeWorkspace } from "./adapters/workspace";

/** Split YAML frontmatter (`---…---`) from a markdown or Astro file. */
function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^(---[\s\S]*?---\n?)/);
  return match ? { frontmatter: match[1], body: content.slice(match[1].length) } : { frontmatter: "", body: content };
}

export interface DocumentHostOptions {
  uri: vscode.Uri;
  workspace: VsCodeWorkspace;
  assets: AssetsPort;
  storage: StoragePort;
  secrets: SecretPort;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export class DocumentHost {
  /** Raw body with frontmatter removed — the patch baseline. */
  private rawHtml = "";
  private frontmatter = "";
  /** Full original file text, so a no-op save writes nothing. */
  private fileText = "";
  private dirty = false;

  private readonly watcher: vscode.FileSystemWatcher;
  private readonly disposables: vscode.Disposable[] = [];
  private suppressWatcher = false;

  constructor(private readonly options: DocumentHostOptions) {
    // Refresh the canvas when the file changes on disk — for example when the
    // user edits it in a text editor split beside this panel.
    const dir = vscode.Uri.joinPath(options.uri, "..");
    this.watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(dir, basename(options.uri.path))
    );
    this.disposables.push(
      this.watcher,
      this.watcher.onDidChange(() => void this.refreshFromDisk())
    );
  }

  /* ------------------------------------------------------------------ *
   * Paths
   * ------------------------------------------------------------------ */

  /** Workspace-relative path, which is what the core expects. */
  get relativePath(): string {
    const root = this.options.workspace.rootUri.path.replace(/\/+$/, "");
    const file = this.options.uri.path;
    return file.startsWith(`${root}/`) ? file.slice(root.length + 1) : basename(file);
  }

  private get extension(): string {
    const lower = this.options.uri.path.toLowerCase();
    if (lower.endsWith(".md")) return ".md";
    if (lower.endsWith(".mdx")) return ".mdx";
    if (lower.endsWith(".astro")) return ".astro";
    return ".html";
  }

  get isMarkdown(): boolean {
    return this.extension === ".md" || this.extension === ".mdx";
  }

  get isAstro(): boolean {
    return this.extension === ".astro";
  }

  /* ------------------------------------------------------------------ *
   * Open
   * ------------------------------------------------------------------ */

  /** Read the document and produce the `FILE_CONTENT` message. */
  async open(): Promise<Extract<HostToWebviewMessage, { type: "FILE_CONTENT" }>> {
    const bytes = await vscode.workspace.fs.readFile(this.options.uri);
    this.fileText = decodeUtf8(bytes);

    const { frontmatter, body } = splitFrontmatter(this.fileText);
    this.frontmatter = frontmatter;

    this.rawHtml = stripBrowserExtensionArtifacts(body);

    const injectScript = await this.buildInjectScript();
    const config = vscode.workspace.getConfiguration("rachana");

    return {
      type: "FILE_CONTENT",
      content: this.rawHtml,
      rawHtml: this.rawHtml,
      filename: basename(this.options.uri.path),
      filePath: this.relativePath,
      injectScript,
      styleMode: config.get<string>("styleMode", "class"),
      styleScope: config.get<"global" | "local">("styleScope", "local"),
      isMarkdown: this.isMarkdown,
      isAstro: this.isAstro,
    };
  }

  /**
   * Build the script the canvas injects.
   *
   * `window.__GL_ORIGINAL_HTML` is the patch baseline the editor works against;
   * it is URI-encoded so arbitrary document content cannot break out of the
   * string literal.
   */
  private async buildInjectScript(): Promise<string> {
    const editor = await this.options.assets.readText("media/editor-inject.js");
    const encoded = encodeURIComponent(this.rawHtml);
    return `window.__GL_ORIGINAL_HTML = decodeURIComponent(${JSON.stringify(encoded)});\n${editor}`;
  }

  /* ------------------------------------------------------------------ *
   * Save
   * ------------------------------------------------------------------ */

  async savePatches(patches: SavePatches, _styleScope?: "global" | "local"): Promise<SaveResult> {
    void _styleScope;
    if (!patches) return { ok: false, error: "No patches supplied" };

    try {
      const patched = applyPatches(this.rawHtml, patches, {
        allowDocumentScaffold: this.extension === ".html" || this.extension === ".htm",
      });
      this.rawHtml = patched;
      return await this.write(this.frontmatter + patched);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  async saveFull(content: string): Promise<SaveResult> {
    try {
      const clean = stripDisplayTransforms(content);
      this.rawHtml = clean;
      return await this.write(this.frontmatter + clean);
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
    }
  }

  private async write(fileContent: string): Promise<SaveResult> {
    if (fileContent === this.fileText) return { ok: true };

    this.suppressWatcher = true;
    try {
      // Writing through the workspace adapter keeps an open text editor buffer
      // in sync rather than editing the file underneath it.
      await this.options.workspace.writeText(this.relativePath, fileContent);
      this.fileText = fileContent;
      this.dirty = false;
      return { ok: true };
    } finally {
      setTimeout(() => {
        this.suppressWatcher = false;
      }, 600);
    }
  }

  /* ------------------------------------------------------------------ *
   * External changes
   * ------------------------------------------------------------------ */

  private async refreshFromDisk(): Promise<void> {
    if (this.suppressWatcher || this.dirty) return;
    const bytes = await vscode.workspace.fs.readFile(this.options.uri);
    this.fileText = decodeUtf8(bytes);
  }

  /* ------------------------------------------------------------------ *
   * Remaining messages
   * ------------------------------------------------------------------ */

  /**
   * Handle the document-level messages this milestone does not yet implement.
   *
   * They are reported rather than silently ignored: a silently dropped message
   * looks like a broken feature, whereas an explicit notice tells the user what
   * is available. Each one maps to a core module that moves across in the next
   * milestone (see `docs/MIGRATION.md`).
   */
  async handle(msg: WebviewToHostMessage, post: (reply: HostToWebviewMessage) => void): Promise<void> {
    switch (msg.type) {
      case "GET_FOLDER_FILES": {
        const dir = dirname(this.relativePath);
        const files = (await this.options.workspace.list(dir))
          .filter((entry) => entry.kind === "file")
          .map((entry) => ({ name: entry.name, ext: entry.ext }));
        post({ type: "FOLDER_FILES_LIST", files });
        return;
      }

      case "OPEN_FILE":
        await vscode.commands.executeCommand(
          "rachana.openVisualEditor",
          vscode.Uri.joinPath(this.options.uri, "..", msg.filename)
        );
        return;

      case "CREATE_FILE": {
        const target = vscode.Uri.joinPath(this.options.uri, "..", msg.filename);
        const exists = await this.options.workspace.exists(msg.filename);
        if (exists) {
          post({ type: "FILE_CREATE_ERROR", error: `File "${msg.filename}" already exists` });
          return;
        }
        await this.options.workspace.writeText(msg.filename, "");
        post({ type: "FILE_CREATED", filename: msg.filename });
        await vscode.commands.executeCommand("rachana.openVisualEditor", target);
        return;
      }

      case "OPEN_CURRENT_FILE_IN_BROWSER":
        await vscode.env.openExternal(this.options.uri);
        return;

      case "UPLOAD_IMAGE": {
        const picked = await this.options.workspace.pickAndImportFile({
          accept: ".png,.jpg,.jpeg,.gif,.svg,.webp,.avif,.ico",
          targetDir: dirname(this.relativePath),
        });
        if (!picked) return;
        const url = await this.options.workspace.toDisplayUrl(picked.path);
        post({ type: "IMAGE_UPLOADED", relativePath: picked.name, webviewUri: url });
        return;
      }

      default:
        vscode.window.showInformationMessage(
          `Rachana: "${msg.type}" is not wired up in this build yet.`
        );
        return;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}

/**
 * Remove the canvas-only transforms a full-document save may have echoed back.
 *
 * Patch saves never need this — they operate on the raw source — but a
 * snapshot restore or markdown save hands back the whole document, which may
 * still carry the markers the display pipeline injected.
 */
function stripDisplayTransforms(content: string): string {
  return content
    .replace(/\s*data-gl-original-src="([^"]+)"\s+src="data:[^"]+"/gi, ' src="$1"')
    .replace(/<!-- gl-original-link: (.+?) -->\s*<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>/g, "$1")
    .replace(/<style data-gl-inlined="[^"]*">[\s\S]*?<\/style>\s*/g, "")
    .replace(/\s*<!--\s*gl-fm-css-start\s*-->[\s\S]*?<!--\s*gl-fm-css-end\s*-->\s*/g, "")
    .replace(/\s*<base\b[^>]*data-gl-base="true"[^>]*>\s*/gi, "\n");
}

export { encodeUtf8 };
