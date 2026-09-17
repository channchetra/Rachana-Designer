/**
 * Astro AST editing.
 *
 * Ported from the original host's `astroEdit.ts`. The only change is that file
 * I/O goes through the workspace instead of `node:fs`.
 *
 * `@astrojs/compiler.parse` compiles to WASM and ships a browser build, so the
 * AST path is fully portable. It is imported lazily because the WASM payload is
 * several megabytes and Live mode is optional.
 *
 * Astro's dev server emits `data-astro-source-loc` (1-based `line:column` of the
 * character right after the opening tag's `>`) on every rendered node. We map
 * that back to the source AST and splice the original string, which preserves
 * formatting, comments, frontmatter expressions and slot composition exactly.
 */

import type { Workspace } from "@/platform/fs/types";

export type AstroEditRequest =
  | { filePath: string; line: number; column: number; op: "setClassList"; classList: string }
  | { filePath: string; line: number; column: number; op: "replaceElementSource"; replacement: string };

export interface AstroEditResult {
  filePath: string;
  written: boolean;
}

interface ParsedPosition {
  line: number;
  column: number;
  offset: number;
}
interface ParsedNode {
  type: string;
  name?: string;
  attributes?: ParsedAttribute[];
  children?: ParsedNode[];
  value?: string;
  position?: { start: ParsedPosition; end?: ParsedPosition };
}
interface ParsedAttribute {
  type: "attribute";
  kind: string;
  name: string;
  value: string;
  raw: string;
  position?: { start: ParsedPosition };
}

export interface SourceLoc {
  line: number;
  column: number;
}

/** Lazily-initialised Astro parser (WASM). */
type AstroParser = (source: string, options: { position: boolean }) => Promise<{ ast: unknown }>;
let astroParserPromise: Promise<AstroParser> | null = null;

async function getAstroParser(): Promise<AstroParser> {
  if (!astroParserPromise) {
    astroParserPromise = import("@astrojs/compiler").then(
      (mod) => (mod as unknown as { parse: AstroParser }).parse
    );
  }
  return astroParserPromise;
}

function offsetToLineCol(source: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < offset; i++) {
    if (source[i] === "\n") {
      line++;
      lastNl = i;
    }
  }
  return { line, column: offset - lastNl };
}

function lineColToOffset(source: string, line: number, column: number): number {
  let curLine = 1;
  let lineStart = 0;
  for (let i = 0; i < source.length && curLine < line; i++) {
    if (source[i] === "\n") {
      curLine++;
      lineStart = i + 1;
    }
  }
  return lineStart + column - 1;
}

function nodeOpenStart(source: string, node: ParsedNode): number {
  return lineColToOffset(source, node.position!.start.line, node.position!.start.column);
}

function nodeEndOffset(source: string, node: ParsedNode): number {
  if (!node.position?.end) return source.length;
  return lineColToOffset(source, node.position.end.line, node.position.end.column);
}

/** Locate the byte offset of the `>` that closes the element's opening tag. */
function findOpeningTagEnd(source: string, openStart: number): number {
  let i = openStart;
  let inQuote: '"' | "'" | null = null;
  let inExpr = 0; // depth of `{ … }` (Astro JSX-like expressions)
  while (i < source.length) {
    const ch = source[i];
    if (inQuote) {
      if (ch === inQuote) inQuote = null;
      i++;
      continue;
    }
    if (inExpr > 0) {
      if (ch === "{") inExpr++;
      else if (ch === "}") inExpr--;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch;
      i++;
      continue;
    }
    if (ch === "{") {
      inExpr++;
      i++;
      continue;
    }
    if (ch === ">") return i;
    i++;
  }
  return -1;
}

function findElementAt(root: ParsedNode, source: string, loc: SourceLoc): ParsedNode | null {
  if (root.type === "element" && root.position?.start) {
    const openStart = nodeOpenStart(source, root);
    const closeAngle = findOpeningTagEnd(source, openStart);
    if (closeAngle >= 0) {
      const after = offsetToLineCol(source, closeAngle + 1);
      if (after.line === loc.line && after.column === loc.column) return root;
    }
  }
  for (const child of root.children ?? []) {
    const found = findElementAt(child, source, loc);
    if (found) return found;
  }
  return null;
}

function attributeEndOffset(attr: ParsedAttribute, source: string): number {
  if (!attr.position) return -1;
  const start = lineColToOffset(source, attr.position.start.line, attr.position.start.column);
  if (attr.kind === "empty") return start + attr.name.length;
  let i = start + attr.name.length;
  while (i < source.length && /\s/.test(source[i])) i++;
  if (source[i] === "=") {
    i++;
    while (i < source.length && /\s/.test(source[i])) i++;
  }
  return i + (attr.raw?.length ?? 0);
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

async function parseSource(source: string): Promise<ParsedNode> {
  const parse = await getAstroParser();
  const result = await parse(source, { position: true });
  return result.ast as unknown as ParsedNode;
}

export async function setClassList(
  source: string,
  loc: SourceLoc,
  classList: string
): Promise<{ source: string; before: string }> {
  const ast = await parseSource(source);
  const node = findElementAt(ast, source, loc);
  if (!node) throw new Error(`No element found at ${loc.line}:${loc.column}`);

  const classAttr = (node.attributes ?? []).find((a) => a.name === "class");
  let next: string;
  if (classAttr && classAttr.position) {
    const start = lineColToOffset(source, classAttr.position.start.line, classAttr.position.start.column);
    const end = attributeEndOffset(classAttr, source);
    next = source.slice(0, start) + `class="${escapeAttr(classList)}"` + source.slice(end);
  } else {
    const openStart = nodeOpenStart(source, node);
    const insertAt = openStart + 1 + (node.name ?? "").length;
    next = source.slice(0, insertAt) + ` class="${escapeAttr(classList)}"` + source.slice(insertAt);
  }
  return { source: next, before: source };
}

export async function getElementSource(
  source: string,
  loc: SourceLoc
): Promise<{ source: string; start: number; end: number }> {
  const ast = await parseSource(source);
  const node = findElementAt(ast, source, loc);
  if (!node) throw new Error(`No element found at ${loc.line}:${loc.column}`);
  const start = nodeOpenStart(source, node);
  const end = nodeEndOffset(source, node);
  return { source: source.slice(start, end), start, end };
}

export async function replaceElementSource(
  source: string,
  loc: SourceLoc,
  replacement: string
): Promise<{ source: string; before: string }> {
  const ast = await parseSource(source);
  const node = findElementAt(ast, source, loc);
  if (!node) throw new Error(`No element found at ${loc.line}:${loc.column}`);
  const start = nodeOpenStart(source, node);
  const end = nodeEndOffset(source, node);
  return { source: source.slice(0, start) + replacement + source.slice(end), before: source };
}

/** Apply an Astro edit and write it back through the workspace. */
export async function applyAstroEdit(
  workspace: Workspace,
  req: AstroEditRequest
): Promise<AstroEditResult> {
  const before = await workspace.readText(req.filePath);
  const loc: SourceLoc = { line: req.line, column: req.column };

  let next: string;
  if (req.op === "setClassList") {
    next = (await setClassList(before, loc, req.classList)).source;
  } else if (req.op === "replaceElementSource") {
    next = (await replaceElementSource(before, loc, req.replacement)).source;
  } else {
    throw new Error(`Unsupported op: ${(req as { op: string }).op}`);
  }

  if (next === before) return { filePath: req.filePath, written: false };
  await workspace.writeText(req.filePath, next);
  return { filePath: req.filePath, written: true };
}

export { lineColToOffset, offsetToLineCol };
