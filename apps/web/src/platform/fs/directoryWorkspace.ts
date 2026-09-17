/**
 * Directory workspace — a real folder on disk via the File System Access API.
 *
 * This is the closest equivalent to "Open Folder" in VS Code: saves write
 * straight back to the user's files, sibling files can be read (so external
 * CSS can be inlined for display, and design-system CSS can be propagated),
 * and binary assets are read from disk.
 *
 * Chromium-only. Everywhere else the app uses `MemoryWorkspace` instead; the
 * feature set is identical, only the persistence target changes.
 */

import {
  Workspace,
  WorkspaceFileEntry,
  WorkspaceKind,
  WorkspaceStat,
  basename,
  decodeUtf8,
  dirname,
  encodeUtf8,
  escapesWorkspace,
  extname,
  joinPath,
  mimeForPath,
  normalizePath,
} from "./types";
import { downloadBlob, pickFileAsBytes } from "./browserIo";

/** Minimal structural types for the File System Access API surface we use. */
type FsWritable = { write(data: Uint8Array | string | Blob): Promise<void>; close(): Promise<void> };
type FsFileHandle = {
  kind: "file";
  name: string;
  getFile(): Promise<File>;
  createWritable(opts?: { keepExistingData?: boolean }): Promise<FsWritable>;
};
type FsDirHandle = {
  kind: "directory";
  name: string;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<FsFileHandle>;
  getDirectoryHandle(name: string, opts?: { create?: boolean }): Promise<FsDirHandle>;
  removeEntry(name: string, opts?: { recursive?: boolean }): Promise<void>;
  entries(): AsyncIterableIterator<[string, FsFileHandle | FsDirHandle]>;
  queryPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
  requestPermission?(opts: { mode: "read" | "readwrite" }): Promise<PermissionState>;
};

export class DirectoryWorkspace implements Workspace {
  readonly kind: WorkspaceKind = "directory";
  readonly label: string;

  private urls = new Map<string, string>();
  private revision = 0;
  private listeners = new Set<() => void>();

  constructor(private root: FsDirHandle) {
    this.label = root.name || "project";
  }

  /** Prompt for a directory. Returns null when the user cancels. */
  static async pick(): Promise<DirectoryWorkspace | null> {
    const w = window as unknown as {
      showDirectoryPicker?: (opts?: unknown) => Promise<FsDirHandle>;
    };
    if (typeof w.showDirectoryPicker !== "function") return null;
    try {
      const handle = await w.showDirectoryPicker({ mode: "readwrite", id: "rachana-project" });
      return new DirectoryWorkspace(handle);
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
      throw err;
    }
  }

  /**
   * Prompt for a directory and also return the raw handle, so callers can
   * persist it — the handle is what survives a reload, not the workspace.
   */
  static async pickWithHandle(): Promise<{ workspace: DirectoryWorkspace; handle: FsDirHandle } | null> {
    const w = window as unknown as {
      showDirectoryPicker?: (opts?: unknown) => Promise<FsDirHandle>;
    };
    if (typeof w.showDirectoryPicker !== "function") return null;
    try {
      const handle = await w.showDirectoryPicker({ mode: "readwrite", id: "rachana-project" });
      return { workspace: new DirectoryWorkspace(handle), handle };
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return null;
      throw err;
    }
  }

  /** Wrap a previously persisted handle, re-prompting for permission. */
  static async fromHandle(handle: FsDirHandle): Promise<DirectoryWorkspace | null> {
    if (!handle?.name) return null;
    if (handle.requestPermission) {
      const state = (await handle.queryPermission?.({ mode: "readwrite" })) ?? "prompt";
      if (state !== "granted") {
        const next = await handle.requestPermission({ mode: "readwrite" });
        if (next !== "granted") return null;
      }
    }
    return new DirectoryWorkspace(handle);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.revision++;
    for (const l of this.listeners) l();
  }

  get revisionNumber(): number {
    return this.revision;
  }

  /** Re-verify write access, re-prompting if the browser dropped the grant. */
  private async ensurePermission(): Promise<void> {
    if (!this.root.requestPermission) return;
    const state = (await this.root.queryPermission?.({ mode: "readwrite" })) ?? "granted";
    if (state === "granted") return;
    const next = await this.root.requestPermission({ mode: "readwrite" });
    if (next !== "granted") {
      throw new Error("Write access to the project folder was denied.");
    }
  }

  private split(path: string): string[] {
    const clean = normalizePath(path);
    if (!clean) return [];
    if (escapesWorkspace(clean)) throw new Error(`Path escapes the workspace: ${path}`);
    return clean.split("/");
  }

  private async dirHandle(path: string, create = false): Promise<FsDirHandle> {
    let dir = this.root;
    for (const seg of this.split(path)) {
      dir = await dir.getDirectoryHandle(seg, { create });
    }
    return dir;
  }

  private async fileHandle(path: string, create = false): Promise<FsFileHandle> {
    const parts = this.split(path);
    const name = parts.pop();
    if (!name) throw new Error("A file path is required");
    const dir = await this.dirHandle(parts.join("/"), create);
    return dir.getFileHandle(name, { create });
  }

  async readText(path: string): Promise<string> {
    return decodeUtf8(await this.readBinary(path));
  }

  async readBinary(path: string): Promise<Uint8Array> {
    const handle = await this.fileHandle(path);
    const file = await handle.getFile();
    return new Uint8Array(await file.arrayBuffer());
  }

  async writeText(path: string, content: string): Promise<void> {
    await this.writeBinary(path, encodeUtf8(content));
  }

  async writeBinary(path: string, data: Uint8Array): Promise<void> {
    await this.ensurePermission();
    const handle = await this.fileHandle(path, true);
    const writable = await handle.createWritable();
    await writable.write(data);
    await writable.close();
    this.notify();
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.fileHandle(path);
      return true;
    } catch {
      return false;
    }
  }

  async stat(path: string): Promise<WorkspaceStat> {
    const clean = normalizePath(path);
    try {
      const handle = await this.fileHandle(clean);
      const file = await handle.getFile();
      return {
        path: clean,
        exists: true,
        isDirectory: false,
        size: file.size,
        lastModified: file.lastModified,
      };
    } catch {
      // Maybe it is a directory.
      try {
        await this.dirHandle(clean);
        return { path: clean, exists: true, isDirectory: true, size: 0, lastModified: 0 };
      } catch {
        return { path: clean, exists: false, isDirectory: false, size: 0, lastModified: 0 };
      }
    }
  }

  async remove(path: string): Promise<void> {
    await this.ensurePermission();
    const parts = this.split(path);
    const name = parts.pop();
    if (!name) throw new Error("Refusing to remove the workspace root");
    const dir = await this.dirHandle(parts.join("/"));
    await dir.removeEntry(name, { recursive: true });
    this.notify();
  }

  async mkdir(path: string): Promise<void> {
    await this.ensurePermission();
    await this.dirHandle(path, true);
  }

  async list(dir: string): Promise<WorkspaceFileEntry[]> {
    const handle = await this.dirHandle(dir);
    const out: WorkspaceFileEntry[] = [];
    for await (const [name, entry] of handle.entries()) {
      if (entry.kind === "directory") {
        out.push({
          path: joinPath(dir, name),
          name,
          ext: "",
          kind: "directory",
        });
        continue;
      }
      let size: number | undefined;
      let lastModified: number | undefined;
      try {
        const file = await (entry as FsFileHandle).getFile();
        size = file.size;
        lastModified = file.lastModified;
      } catch {
        /* metadata is best-effort */
      }
      out.push({
        path: joinPath(dir, name),
        name,
        ext: extname(name),
        kind: "file",
        size,
        lastModified,
      });
    }
    return out.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  async listRecursive(dir: string, limit = 5000): Promise<WorkspaceFileEntry[]> {
    const out: WorkspaceFileEntry[] = [];
    const skip = new Set(["node_modules", ".git", "dist", ".astro", ".next", "build"]);

    const walk = async (path: string, depth: number): Promise<void> => {
      if (out.length >= limit || depth > 8) return;
      let handle: FsDirHandle;
      try {
        handle = await this.dirHandle(path);
      } catch {
        return;
      }
      for await (const [name, entry] of handle.entries()) {
        if (out.length >= limit) return;
        if (name.startsWith(".") && name !== ".well-known") {
          if (skip.has(name)) continue;
        }
        const childPath = joinPath(path, name);
        if (entry.kind === "directory") {
          if (skip.has(name)) continue;
          await walk(childPath, depth + 1);
        } else {
          out.push({ path: childPath, name, ext: extname(name), kind: "file" });
        }
      }
    };

    await walk(dir, 0);
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Resolve a relative URL (as written in the user's HTML/CSS) to a workspace
   * path, mirroring the original host's `resolveStaticAssetPath` rules:
   * leading `/` means project root (preferring `public/`), otherwise relative
   * to the owning document.
   */
  async resolveAsset(assetUrl: string, ownerPath: string): Promise<string | null> {
    const trimmed = assetUrl.trim();
    if (!trimmed) return null;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|data:|blob:|#)/i.test(trimmed)) return null;
    const pathname = trimmed.split(/[?#]/)[0];
    if (!pathname) return null;

    const candidate = pathname.startsWith("/")
      ? [joinPath("public", pathname.replace(/^\/+/, "")), pathname.replace(/^\/+/, "")]
      : [joinPath(dirname(ownerPath), pathname)];

    for (const c of candidate) {
      if (await this.exists(c)) return c;
    }
    return null;
  }

  async toDisplayUrl(path: string): Promise<string> {
    const cached = this.urls.get(path);
    if (cached) return cached;
    const data = await this.readBinary(path);
    const blob = new Blob([data.slice().buffer as ArrayBuffer], { type: mimeForPath(path) });
    const url = URL.createObjectURL(blob);
    this.urls.set(path, url);
    return url;
  }

  revokeUrl(url: string): void {
    if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    for (const [key, value] of this.urls) {
      if (value === url) this.urls.delete(key);
    }
  }

  async pickAndImportFile(opts: {
    accept: string;
    targetDir?: string;
    suggestedName?: string;
  }): Promise<{ path: string; name: string; data: Uint8Array } | null> {
    const picked = await pickFileAsBytes(opts.accept, opts.suggestedName);
    if (!picked) return null;
    const name = opts.suggestedName || picked.name;
    const target = joinPath(opts.targetDir ?? "", name);
    await this.writeBinary(target, picked.data);
    return { path: target, name, data: picked.data };
  }

  async exportFile(path: string, data: Uint8Array | string): Promise<void> {
    const bytes = typeof data === "string" ? encodeUtf8(data) : data;
    await this.writeBinary(path, bytes);
  }

  async exportFolder(
    folderPath: string,
    files: { name: string; data: Uint8Array | string }[]
  ): Promise<void> {
    await this.ensurePermission();
    const dir = await this.dirHandle(folderPath, true);
    for (const file of files) {
      const handle = await dir.getFileHandle(file.name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(typeof file.data === "string" ? file.data : file.data);
      await writable.close();
    }
    this.notify();
  }

  /** Export to the user's Downloads folder instead of the project. */
  download(path: string, data: Uint8Array | string): void {
    const bytes = typeof data === "string" ? encodeUtf8(data) : data;
    downloadBlob(bytes, basename(path), mimeForPath(path));
  }

  get rootName(): string {
    return this.root.name;
  }
}
