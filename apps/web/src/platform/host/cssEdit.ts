/**
 * CSS declaration editing.
 *
 * Ported from the original host's `cssEdit.ts`. File I/O is replaced by an
 * explicit `source` argument plus a writer callback, so this module stays a
 * pure text transformer (which also makes it directly unit-testable).
 */

export interface CssDeclarationEditRequest {
  filePath: string;
  line: number;
  column: number;
  property: string;
  value: string;
}

export interface CssDeclarationEditResult {
  filePath: string;
  written: boolean;
  oldValue?: string;
  newValue?: string;
}

function lineColToOffset(source: string, line: number, column: number): number {
  let curLine = 1;
  let lineStart = 0;
  for (let i = 0; i < source.length && curLine < line; i++) {
    if (source[i] === "\n") { curLine++; lineStart = i + 1; }
  }
  return Math.max(0, Math.min(source.length, lineStart + column - 1));
}

function isIdentChar(ch: string | undefined): boolean {
  return !!ch && /[-_a-zA-Z0-9]/.test(ch);
}

function findDeclarationEnd(source: string, start: number): number {
  let quote: '"' | "'" | null = null;
  let parenDepth = 0;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === "\\") { i++; continue; }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === "(") { parenDepth++; continue; }
    if (ch === ")" && parenDepth > 0) { parenDepth--; continue; }
    if (parenDepth === 0 && (ch === ";" || ch === "}" || ch === '"' || ch === "'")) return i;
  }
  return source.length;
}

function findPropertyStart(source: string, offset: number, property: string): number {
  const searchStart = Math.max(0, offset - 2000);
  const searchEnd = Math.min(source.length, offset + 2000);
  let best = -1;
  let bestDistance = Number.POSITIVE_INFINITY;
  let index = source.indexOf(property, searchStart);
  while (index >= 0 && index <= searchEnd) {
    const before = source[index - 1];
    const after = source[index + property.length];
    if (!isIdentChar(before) && !isIdentChar(after)) {
      let colon = index + property.length;
      while (colon < source.length && /\s/.test(source[colon])) colon++;
      if (source[colon] === ":") {
        const distance = Math.abs(index - offset);
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      }
    }
    index = source.indexOf(property, index + property.length);
  }
  return best;
}

/**
 * Rewrite one declaration's value inside a stylesheet.
 *
 * @param source  The current text of the stylesheet.
 * @param req     The declaration to edit (1-based line/column).
 * @param writer  Persists the result. Omit to only compute the new text.
 */
export async function editCssDeclarationValue(
  source: string,
  req: CssDeclarationEditRequest,
  writer?: (filePath: string, content: string) => Promise<void>
): Promise<CssDeclarationEditResult> {
  const before = source;
  const offset = lineColToOffset(before, req.line, req.column);
  const propertyStart = findPropertyStart(before, offset, req.property);
  if (propertyStart < 0) {
    throw new Error(`No CSS declaration found for ${req.property} at ${req.filePath}:${req.line}:${req.column}`);
  }

  let colon = propertyStart + req.property.length;
  while (colon < before.length && /\s/.test(before[colon])) colon++;
  if (before[colon] !== ":") {
    throw new Error(`No CSS value found for ${req.property} at ${req.filePath}:${req.line}:${req.column}`);
  }

  let valueStart = colon + 1;
  while (valueStart < before.length && /\s/.test(before[valueStart])) valueStart++;

  const declarationEnd = findDeclarationEnd(before, valueStart);
  let valueEnd = declarationEnd;
  while (valueEnd > valueStart && /\s/.test(before[valueEnd - 1])) valueEnd--;

  const importantMatch = before.slice(valueStart, valueEnd).match(/\s*!important\s*$/i);
  if (importantMatch) valueEnd -= importantMatch[0].length;
  while (valueEnd > valueStart && /\s/.test(before[valueEnd - 1])) valueEnd--;

  const oldValue = before.slice(valueStart, valueEnd);
  const next = before.slice(0, valueStart) + req.value + before.slice(valueEnd);
  if (next === before) return { filePath: req.filePath, written: false, oldValue, newValue: req.value };
  if (writer) await writer(req.filePath, next);
  return { filePath: req.filePath, written: true, oldValue, newValue: req.value };
}

/** Convenience wrapper that also returns the rewritten stylesheet text. */
export function editCssDeclarationInText(
  source: string,
  req: Omit<CssDeclarationEditRequest, "filePath"> & { filePath?: string }
): { text: string; result: CssDeclarationEditResult } {
  const before = source;
  const fullReq: CssDeclarationEditRequest = { filePath: req.filePath ?? "", ...req };
  const offset = lineColToOffset(before, fullReq.line, fullReq.column);
  const propertyStart = findPropertyStart(before, offset, fullReq.property);
  if (propertyStart < 0) throw new Error(`No CSS declaration found for ${fullReq.property}`);

  let colon = propertyStart + fullReq.property.length;
  while (colon < before.length && /\s/.test(before[colon])) colon++;
  if (before[colon] !== ":") throw new Error(`No CSS value found for ${fullReq.property}`);

  let valueStart = colon + 1;
  while (valueStart < before.length && /\s/.test(before[valueStart])) valueStart++;

  let valueEnd = findDeclarationEnd(before, valueStart);
  while (valueEnd > valueStart && /\s/.test(before[valueEnd - 1])) valueEnd--;
  const importantMatch = before.slice(valueStart, valueEnd).match(/\s*!important\s*$/i);
  if (importantMatch) valueEnd -= importantMatch[0].length;
  while (valueEnd > valueStart && /\s/.test(before[valueEnd - 1])) valueEnd--;

  const oldValue = before.slice(valueStart, valueEnd);
  const text = before.slice(0, valueStart) + fullReq.value + before.slice(valueEnd);
  return {
    text,
    result: {
      filePath: fullReq.filePath,
      written: text !== before,
      oldValue,
      newValue: fullReq.value,
    },
  };
}

export { lineColToOffset, findPropertyStart, findDeclarationEnd };