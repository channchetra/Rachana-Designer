/**
 * In-memory workspace.
 *
 * Always available (no browser permissions required). It backs
 *  - brand-new documents created from a blank template,
 *  - the demo/sample document shown on first run,
 *  - browsers without the File System Access API.
 *
 * `exportFile` falls back to a normal browser download, so users can always
 * get their work out even in the pure-memory mode.
 */

import {
  Workspace,
  WorkspaceFileEntry,
  WorkspaceKind,
  WorkspaceStat,
  basename,
  bytesToDataUri,
  decodeUtf8,
  dirname,
  encodeUtf8,
  escapesWorkspace,
  extname,
  isInside,
  joinPath,
  mimeForPath,
  normalizePath,
} from "./types";
import { downloadBlob, pickFileAsBytes } from "./browserIo";

export class MemoryWorkspace implements Workspace {
  readonly kind: WorkspaceKind = "memory";
  readonly label: string;

  /** path -> bytes */
  private files = new Map<string, Uint8Array>();
  private urls = new Set<string>();
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor(label = "Untitled project", seed?: Record<string, string>) {
    this.label = label;
    if (seed) {
      for (const [path, content] of Object.entries(seed)) {
        this.files.set(normalizePath(path), encodeUtf8(content));
      }
    }
  }

  /** Subscribe to mutations — the file browser uses this to stay fresh. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.revision++;
    for (const l of this.listeners) l();
  }

  private resolve(path: string): string {
    const clean = normalizePath(path);
    if (escapesWorkspace(path) || clean === "..") {
      throw new Error(`Path escapes the workspace: ${path}`);
    }
    return clean;
  }

  async readText(path: string): Promise<string> {
    return decodeUtf8(await this.readBinary(path));
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const key = this.resolve(path);
    const data = this.files.get(key);
    if (!data) throw new Error(`File not found: ${key}`);
    return data;
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.writeBinary(path, encodeUtf8(content));
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    this.files.set(this.resolve(path), data);
    this.notify();
  }

  /**
   * True for a stored file *or* an implied directory.
   *
   * Directories are not stored explicitly, but a path that is a prefix of a
   * stored file is a real directory as far as callers are concerned — the asset
   * resolver and the folder browser both rely on this.
   */
  async exists(path: string): Promise<boolean> {
    const key = this.resolve(path);
    return this.files.has(key) || this.isDirectory(key);
  }

  async stat(path: string): Promise<WorkspaceStat> {
    const key = this.resolve(path);
    const data = this.files.get(key);
    const isDir = !data && this.isDirectory(key);
    return {
      path: key,
      exists: !!data || isDir,
      isDirectory: isDir,
      size: data?.length ?? 0,
      lastModified: 0,
    };
  }

  private isDirectory(path: string): boolean {
    if (!path) return true;
    for (const key of this.files.keys()) {
      if (key.startsWith(path + "/")) return true;
    }
    return false;
  }

  async remove(path: string): Promise<void> {
    const key = this.resolve(path);
    if (this.files.delete(key)) {
      this.notify();
      return;
    }
    // Directory removal: drop everything beneath it.
    const prefix = key + "/";
    let removed = false;
    for (const existing of [...this.files.keys()]) {
      if (existing.startsWith(prefix)) {
        this.files.delete(existing);
        removed = true;
      }
    }
    if (removed) this.notify();
  }

  /** Memory workspaces need no physical directories — this is a no-op. */
  async mkdir(_path: string): Promise<void> {
    void _path;
  }

  async list(dir: string): Promise<WorkspaceFileEntry[]> {
    const key = this.resolve(dir);
    const prefix = key ? key + "/" : "";
    const files: WorkspaceFileEntry[] = [];
    const seenDirs = new Set<string>();

    for (const [filePath, data] of this.files) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      if (!rest) continue;

      const slash = rest.indexOf("/");
      if (slash === -1) {
        files.push({
          path: filePath,
          name: rest,
          ext: extname(rest),
          kind: "file",
          size: data.length,
        });
        continue;
      }

      // Implied directory: emit it once, at this level only.
      const dirName = rest.slice(0, slash);
      if (!seenDirs.has(dirName)) {
        seenDirs.add(dirName);
        files.push({
          path: prefix + dirName,
          name: dirName,
          ext: "",
          kind: "directory",
        });
      }
    }

    return files.sort((a, b) => {
      // Directories first, then alphabetical — the same convention every file
      // browser in the app uses.
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async listRecursive(dir: string, limit = 5000): Promise<WorkspaceFileEntry[]> {
    const key = this.resolve(dir);
    const prefix = key ? key + "/" : "";
    const out: WorkspaceFileEntry[] = [];
    for (const [filePath, data] of this.files) {
      if (!filePath.startsWith(prefix)) continue;
      out.push({
        path: filePath,
        name: basename(filePath),
        ext: extname(filePath),
        kind: "file",
        size: data.length,
      });
      if (out.length >= limit) break;
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  async toDisplayUrl(path: string): Promise<string> {
    const data = await this.readBinary(path);
    const url = bytesToDataUri(data, mimeForPath(path));
    if (url.startsWith("blob:")) this.urls.add(url);
    return url;
  }

  revokeUrl(url: string): void {
    if (this.urls.has(url)) {
      URL.revokeObjectURL(url);
      this.urls.delete(url);
    }
  }

  async pickAndImportFile(opts: {
    accept: string;
    targetDir?: string;
    suggestedName?: string;
  }): Promise<{ path: string; name: string; data: Uint8Array } | null> {
    const picked = await pickFileAsBytes(opts.accept, opts.suggestedName);
    if (!picked) return null;
    const target = joinPath(opts.targetDir ?? "", picked.name);
    await this.writeBinary(target, picked.data);
    return { path: target, name: picked.name, data: picked.data };
  }

  async exportFile(path: string, data: Uint8Array | string, mime?: string): Promise<void> {
    const bytes = typeof data === "string" ? encodeUtf8(data) : data;
    downloadBlob(bytes, basename(path), mime ?? mimeForPath(path));
  }

  async exportFolder(
    folderPath: string,
    files: { name: string; data: Uint8Array | string }[]
  ): Promise<void> {
    // Browsers cannot create a folder from the page; emit one download per file
    // and prefix the name so the set stays identifiable.
    const prefix = basename(folderPath);
    for (const file of files) {
      const bytes = typeof file.data === "string" ? encodeUtf8(file.data) : file.data;
      downloadBlob(bytes, `${prefix}__${file.name}`, mimeForPath(file.name));
    }
  }

  /** Snapshot every file — used by "Duplicate project" and persistence. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [path, data] of this.files) {
      if (/\.(png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|mp4|webm)$/i.test(path)) continue;
      out[path] = decodeUtf8(data);
    }
    return out;
  }

  get fileCount(): number {
    return this.files.size;
  }

  get revisionNumber(): number {
    return this.revision;
  }
}

/** Guard used by the directory workspace to keep writes inside the project. */
export function assertInside(root: string, path: string): void {
  if (!isInside(root, path)) {
    throw new Error(`Refusing to touch a path outside the workspace: ${path}`);
  }
}

export { dirname };
