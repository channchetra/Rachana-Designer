/**
 * Workspace abstraction.
 *
 * Every file operation in Rachana Designer goes through this interface so the
 * app can run against three very different back-ends without any feature
 * knowing the difference:
 *
 *  1. `MemoryWorkspace` — always available. A virtual in-page project used for
 *     brand-new documents and for browsers without the File System Access API.
 *  2. `DirectoryWorkspace` — a real folder on disk via the File System Access
 *     API (`showDirectoryPicker`). This is the equivalent of opening a project
 *     folder in VS Code and gives true byte-preserving saves.
 *  3. `HttpWorkspace` — reserved for a future dev-server backed workspace.
 *
 * Paths inside a workspace are always POSIX-style and relative to the
 * workspace root, e.g. `src/pages/index.astro`, `images/hero.png`.
 */

export interface WorkspaceFileEntry {
  /** POSIX relative path from the workspace root. */
  path: string;
  name: string;
  /** Lowercase extension including the dot, e.g. `.astro`. Empty for directories. */
  ext: string;
  /** Whether this entry is a regular file or a directory. */
  kind: "file" | "directory";
  size?: number;
  lastModified?: number;
}

export interface WorkspaceStat {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  size: number;
  lastModified: number;
}

/** Backing store identity, surfaced in the UI so users know where saves land. */
export type WorkspaceKind = "memory" | "directory" | "http";

export interface Workspace {
  readonly kind: WorkspaceKind;
  /** Human readable label, e.g. the picked folder name. */
  readonly label: string;

  readText(path: string): Promise<string>;
  writeText(path: string, content: string): Promise<void>;
  readBinary(path: string): Promise<Uint8Array>;
  writeBinary(path: string, data: Uint8Array): Promise<void>;

  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<WorkspaceStat>;
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;

  /** List regular files directly inside `dir` (non-recursive). */
  list(dir: string): Promise<WorkspaceFileEntry[]>;

  /** Recursively list files under `dir`, bounded by `limit` for safety. */
  listRecursive(dir: string, limit?: number): Promise<WorkspaceFileEntry[]>;

  /**
   * Create an object URL (or data URL) that a browser context — including the
   * editor iframe — can load. Callers must release it with `revokeUrl`.
   */
  toDisplayUrl(path: string): Promise<string>;
  revokeUrl(url: string): void;

  /** Ask the user for a single file and import it into the workspace. */
  pickAndImportFile(opts: {
    accept: string;
    /** Directory to place the file in, relative to the workspace root. */
    targetDir?: string;
    /** Preferred filename; falls back to the picked file's own name. */
    suggestedName?: string;
  }): Promise<{ path: string; name: string; data: Uint8Array } | null>;

  /**
   * Export a single file out of the app: writes into the directory if the
   * workspace has one, otherwise triggers a browser download.
   */
  exportFile(path: string, data: Uint8Array | string, mime?: string): Promise<void>;

  /** Export every file in `folderPath` as a ZIP-free batch of downloads. */
  exportFolder(folderPath: string, files: { name: string; data: Uint8Array | string }[]): Promise<void>;
}

/* ------------------------------------------------------------------ *
 * Path helpers — shared by every workspace implementation.
 * ------------------------------------------------------------------ */

export function extname(path: string): string {
  const base = basename(path);
  const dot = base.lastIndexOf(".");
  return dot <= 0 ? "" : base.slice(dot).toLowerCase();
}

export function basename(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? clean : clean.slice(idx + 1);
}

export function dirname(path: string): string {
  const clean = path.replace(/\\/g, "/").replace(/\/+$/, "");
  const idx = clean.lastIndexOf("/");
  return idx === -1 ? "" : clean.slice(0, idx);
}

/**
 * Join POSIX-ish path segments, collapsing `.` and resolving `..`.
 *
 * A `..` that would climb above the root is **preserved** rather than dropped,
 * so `../../evil` becomes `../evil` instead of silently becoming `evil`.
 * Sandboxed callers (the workspaces) then reject a leading `..`, which makes a
 * path-escape attempt fail loudly instead of aliasing a different file.
 */
export function joinPath(...parts: string[]): string {
  const joined = parts
    .filter((p) => p !== undefined && p !== null && p !== "")
    .join("/")
    .replace(/\\/g, "/");
  const out: string[] = [];
  for (const seg of joined.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      else out.push("..");
      continue;
    }
    out.push(seg);
  }
  return out.join("/");
}

/** True when `path` is inside `dir` (or equals it). Prevents path escape. */
export function isInside(dir: string, path: string): boolean {
  const d = dir.replace(/\\/g, "/").replace(/\/+$/, "");
  const p = path.replace(/\\/g, "/");
  if (!d) return true;
  return p === d || p.startsWith(d + "/");
}

export function normalizePath(path: string): string {
  return joinPath(path);
}

/** True when a normalised path tries to climb above the workspace root. */
export function escapesWorkspace(path: string): boolean {
  const normalized = joinPath(path);
  return normalized === ".." || normalized.startsWith("../");
}

export function isMarkdownPath(path: string): boolean {
  const ext = extname(path);
  return ext === ".md" || ext === ".mdx";
}

export function isAstroPath(path: string): boolean {
  return extname(path) === ".astro";
}

export function isHtmlPath(path: string): boolean {
  const ext = extname(path);
  return ext === ".html" || ext === ".htm";
}

/** Extensions the editor can open. Mirrors the original SUPPORTED_EXTS list. */
export const SUPPORTED_EDITOR_EXTS = [".html", ".htm", ".md", ".mdx", ".astro"] as const;

export function isEditablePath(path: string): boolean {
  return (SUPPORTED_EDITOR_EXTS as readonly string[]).includes(extname(path));
}

/* ------------------------------------------------------------------ *
 * Byte helpers
 * ------------------------------------------------------------------ */

export function encodeUtf8(text: string): Uint8Array {
  return new TextEncoder().encode(text);
}

export function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function bytesToDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".ico": "image/x-icon",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".ogg": "audio/ogg",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".css": "text/css",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".json": "application/json",
  ".html": "text/html",
  ".htm": "text/html",
  ".md": "text/markdown",
  ".astro": "text/plain",
  ".txt": "text/plain",
};

export const EXT_FROM_MIME: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/gif": ".gif",
  "image/svg+xml": ".svg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/x-icon": ".ico",
};

export function mimeForPath(path: string): string {
  return MIME_TYPES[extname(path)] ?? "application/octet-stream";
}

/** Sanitize a user-supplied filename into something safe for a filesystem. */
export function sanitizeFilename(filename: string): string {
  const base = basename(filename).replace(/[\\:*?"<>|\u0000-\u001f]/g, "-");
  const ext = extname(base);
  const stem = (ext ? base.slice(0, -ext.length) : base)
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${stem || "file"}${ext}`;
}
