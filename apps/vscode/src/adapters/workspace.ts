/**
 * VS Code `Workspace` adapter.
 *
 * Implements the core's `Workspace` interface on top of `vscode.workspace.fs`.
 * Every path the core uses is POSIX-style and relative to a single root URI, so
 * this adapter is the only place that knows about `vscode.Uri` — the core stays
 * free of VS Code types entirely.
 *
 * Two behaviours differ from the browser adapter and are worth knowing:
 *
 *  - **Saving goes through the open text document when there is one.** If the
 *    user has the file open in a VS Code editor, writing straight to disk would
 *    make VS Code show a stale buffer and prompt about an external change.
 *    `writeText` therefore applies a `WorkspaceEdit` to the open document and
 *    saves it, which keeps the editor, the undo stack and the file in sync.
 *  - **Display URLs are `webview.asWebviewUri`**, so the canvas iframe can load
 *    sibling assets that live on disk.
 */

import * as vscode from "vscode";
import type {
  Workspace,
  WorkspaceFileEntry,
  WorkspaceKind,
  WorkspaceStat,
} from "@rachana/core/workspace";
import {
  basename,
  decodeUtf8,
  dirname,
  encodeUtf8,
  extname,
  joinPath,
  mimeForPath,
} from "@rachana/core/workspace";

/** Map `vscode.FileType` to the core's entry kind. */
const FILE_TYPE_DIRECTORY = 2;

export interface VsCodeWorkspaceOptions {
  /** Root directory all relative paths resolve against. */
  root: vscode.Uri;
  /**
   * The webview that will display assets. Required only so `toDisplayUrl` can
   * produce a URL the canvas iframe is allowed to load.
   */
  webview?: vscode.Webview;
}

export class VsCodeWorkspace implements Workspace {
  readonly kind: WorkspaceKind = "directory";
  readonly label: string;

  private readonly root: vscode.Uri;
  private webview: vscode.Webview | undefined;

  constructor(options: VsCodeWorkspaceOptions) {
    this.root = options.root;
    this.webview = options.webview;
    this.label = basename(options.root.path.replace(/\/+$/, "")) || "workspace";
  }

  /**
   * The webview is created after the workspace in some flows (the panel needs
   * the workspace to build its HTML), so it can be attached later.
   */
  attachWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  /* ------------------------------ paths ------------------------------ */

  private uri(path: string): vscode.Uri {
    const clean = joinPath(path);
    if (clean.startsWith("..")) {
      throw new Error(`Path escapes the workspace: ${path}`);
    }
    if (!clean) return this.root;
    return vscode.Uri.joinPath(this.root, ...clean.split("/"));
  }

  /* ------------------------------- read ------------------------------ */

  async readText(path: string): Promise<string> {
    return decodeUtf8(await this.readBinary(path));
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const bytes = await vscode.workspace.fs.readFile(this.uri(path));
    return new Uint8Array(bytes);
  }

  /* ------------------------------- write ----------------------------- */

  async writeText(path: string, content: string): Promise<void> {
    const uri = this.uri(path);

    // Keep an open editor buffer in sync rather than writing underneath it.
    const open = vscode.workspace.textDocuments.find(
      (doc) => doc.uri.toString() === uri.toString()
    );
    if (open) {
      if (open.getText() !== content) {
        const edit = new vscode.WorkspaceEdit();
        edit.replace(uri, new vscode.Range(open.positionAt(0), open.positionAt(open.getText().length)), content);
        await vscode.workspace.applyEdit(edit);
      }
      await open.save();
      return;
    }

    await vscode.workspace.fs.writeFile(uri, encodeUtf8(content));
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    await vscode.workspace.fs.writeFile(this.uri(path), data);
  }

  /* ------------------------------ metadata --------------------------- */

  async exists(path: string): Promise<boolean> {
    try {
      await vscode.workspace.fs.stat(this.uri(path));
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<WorkspaceStat> {
    const clean = joinPath(path);
    try {
      const s = await vscode.workspace.fs.stat(this.uri(clean));
      const isDirectory = (s.type & FILE_TYPE_DIRECTORY) !== 0;
      return {
        path: clean,
        exists: true,
        isDirectory,
        size: s.size,
        lastModified: s.mtime,
      };
    } catch {
      return { path: clean, exists: false, isDirectory: false, size: 0, lastModified: 0 };
    }
  }

  async remove(path: string): Promise<void> {
    await vscode.workspace.fs.delete(this.uri(path), { recursive: true });
  }

  async mkdir(path: string): Promise<void> {
    await vscode.workspace.fs.createDirectory(this.uri(path));
  }

  /* ------------------------------- list ------------------------------ */

  async list(dir: string): Promise<WorkspaceFileEntry[]> {
    let raw: [string, vscode.FileType][];
    try {
      raw = await vscode.workspace.fs.readDirectory(this.uri(dir));
    } catch {
      return [];
    }

    const out: WorkspaceFileEntry[] = [];
    for (const [name, type] of raw) {
      const child = joinPath(dir, name);
      if ((type & FILE_TYPE_DIRECTORY) !== 0) {
        out.push({ path: child, name, ext: "", kind: "directory" });
        continue;
      }
      let size: number | undefined;
      let lastModified: number | undefined;
      try {
        const s = await vscode.workspace.fs.stat(this.uri(child));
        size = s.size;
        lastModified = s.mtime;
      } catch {
        /* metadata is best-effort */
      }
      out.push({ path: child, name, ext: extname(name), kind: "file", size, lastModified });
    }

    return out.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  /** Directories that are never worth walking; mirrors the browser adapter. */
  private static readonly SKIP_DIRS = new Set([
    "node_modules",
    ".git",
    "dist",
    ".astro",
    ".next",
    "build",
    "out",
  ]);

  async listRecursive(dir: string, limit = 5000): Promise<WorkspaceFileEntry[]> {
    const out: WorkspaceFileEntry[] = [];

    const walk = async (path: string, depth: number): Promise<void> => {
      if (out.length >= limit || depth > 8) return;
      const entries = await this.list(path);
      for (const entry of entries) {
        if (out.length >= limit) return;
        if (entry.kind === "directory") {
          if (VsCodeWorkspace.SKIP_DIRS.has(entry.name)) continue;
          await walk(entry.path, depth + 1);
        } else {
          out.push(entry);
        }
      }
    };

    await walk(dir, 0);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /* ---------------------------- display URLs -------------------------- */

  /**
   * A URL the canvas iframe may load. Without a webview attached there is no
   * loadable URL, so this falls back to a data URI of the file's contents.
   */
  async toDisplayUrl(path: string): Promise<string> {
    if (this.webview) return this.webview.asWebviewUri(this.uri(path)).toString();

    const bytes = await this.readBinary(path);
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return `data:${mimeForPath(path)};base64,${btoa(binary)}`;
  }

  revokeUrl(): void {
    /* VS Code URIs and data URIs need no release */
  }

  /* ---------------------------- file picking -------------------------- */

  async pickAndImportFile(opts: {
    accept: string;
    targetDir?: string;
    suggestedName?: string;
  }): Promise<{ path: string; name: string; data: Uint8Array } | null> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: false,
      filters: filtersFromAccept(opts.accept),
      title: "Select a file",
    });
    if (!picked?.[0]) return null;

    const data = new Uint8Array(await vscode.workspace.fs.readFile(picked[0]));
    const name = opts.suggestedName || basename(picked[0].path);
    const target = joinPath(opts.targetDir ?? "", name);
    await this.writeBinary(target, data);
    return { path: target, name, data };
  }

  /* ------------------------------- export ---------------------------- */

  /**
   * Writing "out" of a workspace folder means writing into it — the user is
   * already looking at real files, so there is nothing to download.
   */
  async exportFile(path: string, data: Uint8Array | string): Promise<void> {
    await this.writeBinary(path, typeof data === "string" ? encodeUtf8(data) : data);
  }

  async exportFolder(
    folderPath: string,
    files: { name: string; data: Uint8Array | string }[]
  ): Promise<void> {
    await this.mkdir(folderPath);
    for (const file of files) {
      await this.writeBinary(
        joinPath(folderPath, file.name),
        typeof file.data === "string" ? encodeUtf8(file.data) : file.data
      );
    }
  }

  /* -------------------------------- extra ---------------------------- */

  /** The directory holding a path, as an absolute URI. Needed by the host. */
  absoluteDirOf(path: string): vscode.Uri {
    return vscode.Uri.joinPath(this.root, ...dirname(path).split("/").filter(Boolean));
  }

  get rootUri(): vscode.Uri {
    return this.root;
  }
}

/**
 * Translate a browser-style `accept` string (`.png,.jpg,image/*`) into VS Code's
 * filter shape. Unrecognised MIME wildcards are dropped: VS Code filters are
 * extension-based, and a wrong filter hides the file the user needs.
 */
function filtersFromAccept(accept: string): Record<string, string[]> {
  const exts = accept
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("."))
    .map((s) => s.slice(1));
  if (exts.length === 0) return {};
  return { Supported: exts };
}
