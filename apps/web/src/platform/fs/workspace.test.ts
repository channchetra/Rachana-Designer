/**
 * Workspace tests.
 *
 * The in-memory workspace is the fallback every browser gets, so its semantics
 * must match the directory workspace exactly — the editor must not be able to
 * tell which one it is talking to.
 */

import { describe, expect, it } from "vitest";
import { MemoryWorkspace } from "@/platform/fs/memoryWorkspace";
import {
  basename,
  dirname,
  extname,
  isAstroPath,
  isEditablePath,
  isHtmlPath,
  isMarkdownPath,
  joinPath,
  sanitizeFilename,
  bytesToBase64,
  base64ToBytes,
} from "@/platform/fs/types";

describe("path helpers", () => {
  it("joins and normalises POSIX-ish paths", () => {
    expect(joinPath("src", "pages", "index.astro")).toBe("src/pages/index.astro");
    expect(joinPath("src", "..", "styles", "a.css")).toBe("styles/a.css");
    expect(joinPath("", "index.html")).toBe("index.html");
    expect(joinPath("a/", "/b/")).toBe("a/b");
  });

  it("computes basename, dirname and extname", () => {
    expect(basename("src/pages/index.astro")).toBe("index.astro");
    expect(dirname("src/pages/index.astro")).toBe("src/pages");
    expect(dirname("index.html")).toBe("");
    expect(extname("index.astro")).toBe(".astro");
    expect(extname("noext")).toBe("");
  });

  it("classifies paths the same way the editor does", () => {
    expect(isMarkdownPath("a.md")).toBe(true);
    expect(isMarkdownPath("a.mdx")).toBe(true);
    expect(isAstroPath("a.astro")).toBe(true);
    expect(isHtmlPath("a.html")).toBe(true);
    expect(isHtmlPath("a.htm")).toBe(true);
    expect(isEditablePath("a.css")).toBe(false);
    expect(isEditablePath("a.HTML")).toBe(true);
  });

  it("sanitizes user-supplied filenames", () => {
    expect(sanitizeFilename("my page.html")).toBe("my-page.html");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    // Runs of illegal characters collapse into a single dash.
    expect(sanitizeFilename("bad:name*?.html")).toBe("bad-name.html");
    expect(sanitizeFilename(".hidden")).toBe("hidden");
  });

  it("round-trips base64 for binary data", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255, 128]);
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
  });
});

describe("MemoryWorkspace", () => {
  it("writes and reads text", async () => {
    const ws = new MemoryWorkspace("test");
    await ws.writeText("index.html", "<p>hi</p>");
    expect(await ws.readText("index.html")).toBe("<p>hi</p>");
    expect(await ws.exists("index.html")).toBe(true);
  });

  it("throws when reading a missing file", async () => {
    const ws = new MemoryWorkspace("test");
    await expect(ws.readText("nope.html")).rejects.toThrow(/File not found/);
  });

  it("seeds from a record", async () => {
    const ws = new MemoryWorkspace("test", { "a.html": "A", "b/c.html": "C" });
    expect(await ws.readText("a.html")).toBe("A");
    expect(await ws.readText("b/c.html")).toBe("C");
  });

  it("lists files in a directory only", async () => {
    const ws = new MemoryWorkspace("test", {
      "a.html": "A",
      "b.html": "B",
      "sub/c.html": "C",
    });
    const root = await ws.list("");
    const rootFiles = root.filter((f) => f.kind === "file").map((f) => f.name);
    expect(rootFiles.sort()).toEqual(["a.html", "b.html"]);
    // The nested directory is reported too, so the file browser can descend.
    expect(root.filter((f) => f.kind === "directory").map((f) => f.name)).toEqual(["sub"]);
    const sub = await ws.list("sub");
    expect(sub.map((f) => f.name)).toEqual(["c.html"]);
  });

  it("lists recursively with extensions", async () => {
    const ws = new MemoryWorkspace("test", { "a.html": "A", "sub/c.css": "C" });
    const all = await ws.listRecursive("");
    expect(all.map((f) => f.path).sort()).toEqual(["a.html", "sub/c.css"]);
    expect(all.find((f) => f.path === "sub/c.css")?.ext).toBe(".css");
  });

  it("infers directories from file prefixes", async () => {
    const ws = new MemoryWorkspace("test", { "src/styles/a.css": "x" });
    const stat = await ws.stat("src");
    expect(stat.exists).toBe(true);
    expect(stat.isDirectory).toBe(true);
    const file = await ws.stat("src/styles/a.css");
    expect(file.isDirectory).toBe(false);
    expect(file.size).toBe(1);
  });

  it("removes a file", async () => {
    const ws = new MemoryWorkspace("test", { "a.html": "A" });
    await ws.remove("a.html");
    expect(await ws.exists("a.html")).toBe(false);
  });

  it("removes a directory and everything beneath it", async () => {
    const ws = new MemoryWorkspace("test", { "sub/a.html": "A", "sub/deep/b.html": "B", "keep.html": "K" });
    await ws.remove("sub");
    expect(await ws.exists("sub/a.html")).toBe(false);
    expect(await ws.exists("sub/deep/b.html")).toBe(false);
    expect(await ws.exists("keep.html")).toBe(true);
  });

  it("refuses paths that escape the workspace", async () => {
    const ws = new MemoryWorkspace("test");
    await expect(ws.writeText("../evil.html", "x")).rejects.toThrow(/escapes the workspace/);
  });

  it("produces a data URL for display", async () => {
    const ws = new MemoryWorkspace("test", { "a.svg": "<svg/>" });
    const url = await ws.toDisplayUrl("a.svg");
    expect(url).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("notifies subscribers on writes", async () => {
    const ws = new MemoryWorkspace("test");
    let calls = 0;
    const unsubscribe = ws.subscribe(() => {
      calls++;
    });
    await ws.writeText("a.html", "A");
    await ws.writeText("b.html", "B");
    unsubscribe();
    await ws.writeText("c.html", "C");
    expect(calls).toBe(2);
  });

  it("snapshots only text files", async () => {
    const ws = new MemoryWorkspace("test", { "a.html": "A" });
    await ws.writeBinary("logo.png", new Uint8Array([1, 2, 3]));
    const snapshot = ws.snapshot();
    expect(snapshot["a.html"]).toBe("A");
    expect(snapshot["logo.png"]).toBeUndefined();
  });
});
