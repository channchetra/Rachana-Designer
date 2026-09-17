/**
 * Local font library.
 *
 * The original host kept uploaded fonts in VS Code's global storage so they
 * were shared across projects. The browser equivalent used here stores font
 * bytes inside the workspace under `fonts/` (which is also where the document
 * references them from, so saved CSS keeps working) and keeps a searchable
 * `family -> file` index in `localStorage`.
 *
 * All previews are rendered through blob URLs, because the canvas iframe has a
 * null origin and cannot fetch sibling files.
 */

import type { Workspace } from "@/platform/fs/types";
import { basename, extname, joinPath, mimeForPath } from "@/platform/fs/types";
import type { UserFontInfo } from "@/types/hostMessages";
import { readJson, writeJson } from "@/platform/host/config";

export const FONT_LIBRARY_DIR = "fonts";
const FONT_INDEX_KEY = "rachana:font-index";
const FONT_EXTENSIONS = [".woff2", ".woff", ".ttf", ".otf"] as const;

export type FontIndex = Record<string, string>; // family -> filename

export function readFontIndex(): FontIndex {
  return readJson<FontIndex>(FONT_INDEX_KEY, {});
}

export function writeFontIndex(index: FontIndex): void {
  writeJson(FONT_INDEX_KEY, index);
}

/** Sanitize an uploaded filename; throws for unsupported extensions. */
export function sanitizeFontFilename(filename: string): string {
  const base = basename(filename);
  const ext = extname(base);
  if (!(FONT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new Error(`Unsupported font file type "${ext || "(none)"}". Use .woff2, .woff, .ttf or .otf.`);
  }
  const stem = base
    .slice(0, base.length - ext.length)
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return `${stem || "font"}${ext}`;
}

export interface FontLibrary {
  /** Store bytes in the workspace and index the family. */
  put(data: Uint8Array, filename: string, family: string): Promise<{ path: string; name: string }>;
  /** Every font that still exists on disk, with a preview URL. */
  list(): Promise<UserFontInfo[]>;
  /** Read a previously listed font back out for copying. */
  get(id: string): Promise<{ data: Uint8Array; filename: string } | null>;
  /** Remove a family from the index and delete its file. */
  remove(family: string): Promise<void>;
}

export class WorkspaceFontLibrary implements FontLibrary {
  constructor(private workspace: Workspace) {}

  private pathFor(filename: string): string {
    return joinPath(FONT_LIBRARY_DIR, filename);
  }

  async put(data: Uint8Array, filename: string, family: string): Promise<{ path: string; name: string }> {
    if (data.length === 0) throw new Error("Empty font file");
    const safeName = sanitizeFontFilename(filename);
    const familyKey = family.trim() || "Custom Font";

    const index = readFontIndex();
    const previous = index[familyKey];
    if (previous && previous !== safeName) {
      try {
        await this.workspace.remove(this.pathFor(previous));
      } catch {
        /* the old file was already gone */
      }
    }

    await this.workspace.mkdir(FONT_LIBRARY_DIR);
    await this.workspace.writeBinary(this.pathFor(safeName), data);
    index[familyKey] = safeName;
    writeFontIndex(index);

    return { path: this.pathFor(safeName), name: safeName };
  }

  async list(): Promise<UserFontInfo[]> {
    const index = readFontIndex();
    const fonts: UserFontInfo[] = [];
    for (const [family, filename] of Object.entries(index)) {
      if (typeof filename !== "string" || !filename) continue;
      const path = this.pathFor(basename(filename));
      if (!(await this.workspace.exists(path))) continue; // stale index entry
      let url = "";
      try {
        url = await this.workspace.toDisplayUrl(path);
      } catch {
        continue;
      }
      fonts.push({ id: path, family, url });
    }
    return fonts.sort((a, b) => a.family.localeCompare(b.family));
  }

  async get(id: string): Promise<{ data: Uint8Array; filename: string } | null> {
    // `id` is a workspace path handed out by `list()`; keep it inside fonts/.
    const normalized = id.replace(/\\/g, "/").replace(/^\.\//, "");
    const prefix = FONT_LIBRARY_DIR + "/";
    if (!normalized.startsWith(prefix) || normalized.includes("..")) return null;
    if (!(await this.workspace.exists(normalized))) return null;
    const data = await this.workspace.readBinary(normalized);
    return { data, filename: basename(normalized) };
  }

  async remove(family: string): Promise<void> {
    const index = readFontIndex();
    const filename = index[family];
    if (filename) {
      try {
        await this.workspace.remove(this.pathFor(filename));
      } catch {
        /* already gone */
      }
    }
    delete index[family];
    writeFontIndex(index);
  }
}

/** Mime type for a font path, tolerant of unknown extensions. */
export function fontMime(path: string): string {
  const mime = mimeForPath(path);
  return mime === "application/octet-stream" ? "font/woff2" : mime;
}
