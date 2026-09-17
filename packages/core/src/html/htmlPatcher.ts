/**
 * Lightweight HTML element finder and patcher.
 *
 * Parses HTML to build a path→position map using the same algorithm
 * as editor-inject.js assignPaths (skipping SCRIPT, STYLE, LINK, META, NOSCRIPT).
 * Then applies targeted patches (attribute changes, innerHTML, deletions,
 * insertions) to the raw HTML string without touching unmodified sections.
 */

const VOID_ELEMENTS = new Set([
  "br", "hr", "img", "input", "source", "area", "base",
  "col", "embed", "param", "track", "wbr",
]);
const SKIP_ELEMENTS = new Set(["script", "style", "link", "meta", "noscript"]);

export interface ElementPosition {
  path: string;
  tagName: string;
  /** Byte offset of the '<' that opens the tag */
  openStart: number;
  /** Byte offset right after the '>' that closes the opening tag */
  openEnd: number;
  /** Same as openEnd for elements with content; points to inner HTML start */
  innerStart: number;
  /** Byte offset of the '<' of the closing tag (or openEnd for void) */
  innerEnd: number;
  /** Byte offset right after the '>' of the closing tag (or openEnd for void) */
  closeEnd: number;
}

// ── Public types for the patch protocol ────────────────────────

export interface StyleBlockPatch {
  id: string;
  css: string;
}

export interface ScriptBlockPatch {
  id: string;
  content: string;
}

export interface ElementPatch {
  path: string;
  /** Set/update these attributes on the opening tag */
  setAttrs?: Record<string, string>;
  /** Remove these attributes from the opening tag */
  removeAttrs?: string[];
  /** Replace the tag name (opening + closing) */
  newTag?: string;
  /** Replace element innerHTML */
  innerHTML?: string;
}

export interface InsertionPatch {
  /** Path of the parent element ("" for body) */
  parentPath: string;
  /** Child index (among editable children) to insert before; -1 = append */
  position: number;
  /** Raw HTML to insert */
  html: string;
}

export interface MovePatch {
  /** Path of the element being moved */
  sourcePath: string;
  /** Path of destination parent element ("" for body) */
  parentPath: string;
  /** Child index in destination parent (among editable children) */
  position: number;
}

export interface SavePatches {
  /** Editor-created <style> blocks to inject/replace */
  styleBlocks: StyleBlockPatch[];
  /** Editor-created <style> block ids to remove */
  removedStyleBlockIds?: string[];
  /** Editor-created <script> blocks to inject/replace (e.g. observer script) */
  scriptBlocks?: ScriptBlockPatch[];
  /** Per-element attribute / innerHTML changes */
  elements: ElementPatch[];
  /** Paths of elements to delete */
  deletions: string[];
  /** New elements to insert */
  insertions: InsertionPatch[];
  /** Move existing elements without reserializing HTML */
  moves?: MovePatch[];
  /** Global class renames { oldName, newName } */
  classRenames: { oldName: string; newName: string }[];
  /** Edits to user's original <style> blocks (matched by original content) */
  userStyleEdits?: { originalText: string; newCss: string }[];
  /** Design-system font <link> tags to inject/replace in <head> */
  linkBlocks?: { id: string; outerHTML: string }[];
  /** Edits to existing (non-managed) <link> tags matched by href; empty newOuterHTML removes the tag */
  linkEdits?: { href: string; newOuterHTML: string }[];
}

export interface ApplyPatchesOptions {
  allowDocumentScaffold?: boolean;
}

// ── Element mapping ────────────────────────────────────────────

/**
 * Build a map of path → ElementPosition by walking the body HTML.
 * Mirrors the logic of editor-inject.js `assignPaths`.
 */
export function buildElementMap(html: string): Map<string, ElementPosition> {
  const map = new Map<string, ElementPosition>();

  // Find <body …>
  const bodyMatch = html.match(/<body\b[^>]*>/i);
  if (bodyMatch && bodyMatch.index !== undefined) {
    const bodyOpenEnd = bodyMatch.index + bodyMatch[0].length;
    const bodyCloseIdx = html.indexOf("</body", bodyOpenEnd);
    map.set("", {
      path: "",
      tagName: "body",
      openStart: bodyMatch.index,
      openEnd: bodyOpenEnd,
      innerStart: bodyOpenEnd,
      innerEnd: bodyCloseIdx === -1 ? html.length : bodyCloseIdx,
      closeEnd: bodyCloseIdx === -1 ? html.length : html.indexOf(">", bodyCloseIdx) + 1,
    });
    walkChildren(html, bodyOpenEnd, bodyCloseIdx === -1 ? html.length : bodyCloseIdx, "", map);
  } else {
    // Partial HTML (e.g. Astro components) — treat entire content as body.
    // The browser's DOMParser wraps everything in <body>, so paths will match.
    map.set("", {
      path: "",
      tagName: "body",
      openStart: 0,
      openEnd: 0,
      innerStart: 0,
      innerEnd: html.length,
      closeEnd: html.length,
    });
    walkChildren(html, 0, html.length, "", map);
  }

  return map;
}

function walkChildren(
  html: string,
  start: number,
  end: number,
  parentPath: string,
  map: Map<string, ElementPosition>
) {
  let pos = start;
  let childIndex = 0;

  while (pos < end) {
    // Skip non-tag characters
    if (html[pos] !== "<") { pos++; continue; }

    // HTML comment
    if (html.startsWith("<!--", pos)) {
      const commentEnd = html.indexOf("-->", pos + 4);
      pos = commentEnd === -1 ? end : commentEnd + 3;
      continue;
    }

    // Closing tag — means we're done with this level
    if (html[pos + 1] === "/") break;

    // Opening tag
    const tagMatch = matchOpeningTag(html, pos);
    if (!tagMatch) { pos++; continue; }

    const { tagName, fullLength, selfClosing } = tagMatch;
    const openStart = pos;
    const openEnd = pos + fullLength;

    if (SKIP_ELEMENTS.has(tagName)) {
      // Skip its content entirely
      if (VOID_ELEMENTS.has(tagName) || selfClosing) {
        pos = openEnd;
      } else {
        pos = skipToClosingTag(html, tagName, openEnd, end);
      }
      continue;
    }

    if (VOID_ELEMENTS.has(tagName) || selfClosing) {
      const path = parentPath ? parentPath + "." + childIndex : "" + childIndex;
      childIndex++;
      map.set(path, {
        path,
        tagName,
        openStart,
        openEnd,
        innerStart: openEnd,
        innerEnd: openEnd,
        closeEnd: openEnd,
      });
      pos = openEnd;
      continue;
    }

    // Non-void element — find its closing tag by tracking nesting
    const closeInfo = findClosingTag(html, tagName, openEnd, end);
    const path = parentPath ? parentPath + "." + childIndex : "" + childIndex;
    childIndex++;

    map.set(path, {
      path,
      tagName,
      openStart,
      openEnd,
      innerStart: openEnd,
      innerEnd: closeInfo.closeStart,
      closeEnd: closeInfo.closeEnd,
    });

    // Recurse into children
    walkChildren(html, openEnd, closeInfo.closeStart, path, map);
    pos = closeInfo.closeEnd;
  }
}

/** Match an opening HTML tag at position `pos`. Returns null if not a tag. */
function matchOpeningTag(html: string, pos: number): { tagName: string; fullLength: number; selfClosing: boolean } | null {
  // Quick sanity check
  if (html[pos] !== "<") return null;
  const sub = html.substring(pos, pos + 2000); // reasonably long tags
  const m = sub.match(/^<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]*?)(\/?)>/);
  if (!m) return null;
  return {
    tagName: m[1].toLowerCase(),
    fullLength: m[0].length,
    selfClosing: m[3] === "/",
  };
}

function skipToClosingTag(html: string, tagName: string, start: number, limit: number): number {
  const closeTag = "</" + tagName;
  let idx = start;
  while (idx < limit) {
    const found = html.indexOf(closeTag, idx);
    if (found === -1 || found >= limit) return limit;
    const gt = html.indexOf(">", found);
    return gt === -1 ? limit : gt + 1;
  }
  return limit;
}

/** Find matching closing tag for `tagName` starting from `start`, handling nesting. */
function findClosingTag(
  html: string,
  tagName: string,
  start: number,
  limit: number
): { closeStart: number; closeEnd: number } {
  let depth = 1;
  let pos = start;
  const openPat = "<" + tagName;
  const closePat = "</" + tagName;

  while (pos < limit && depth > 0) {
    // Skip comments
    if (html.startsWith("<!--", pos)) {
      const ce = html.indexOf("-->", pos + 4);
      pos = ce === -1 ? limit : ce + 3;
      continue;
    }

    if (html[pos] !== "<") { pos++; continue; }

    // Check closing tag first (case-insensitive)
    const subLower = html.substring(pos, pos + closePat.length + 1).toLowerCase();
    if (subLower.startsWith(closePat.toLowerCase()) &&
        (html[pos + closePat.length] === ">" || /\s/.test(html[pos + closePat.length]))) {
      depth--;
      if (depth === 0) {
        const gt = html.indexOf(">", pos);
        return {
          closeStart: pos,
          closeEnd: gt === -1 ? limit : gt + 1,
        };
      }
      pos += closePat.length;
      continue;
    }

    // Check opening tag (same tag name, for nesting)
    const subOpen = html.substring(pos, pos + openPat.length + 1).toLowerCase();
    if (subOpen.startsWith(openPat.toLowerCase()) &&
        (html[pos + openPat.length] === ">" || /[\s\/]/.test(html[pos + openPat.length]))) {
      // Check it's not self-closing
      const tagEnd = html.indexOf(">", pos);
      if (tagEnd !== -1 && html[tagEnd - 1] !== "/") {
        depth++;
      }
      pos = tagEnd === -1 ? pos + 1 : tagEnd + 1;
      continue;
    }

    pos++;
  }

  // Fallback: couldn't find close, return end of limit
  return { closeStart: limit, closeEnd: limit };
}

// ── Attribute manipulation in raw tag strings ──────────────────

function setAttrInTag(tag: string, attr: string, value: string): string {
  // Attribute value must be HTML-escaped
  const escaped = value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  const attrPattern = new RegExp(`(\\s)${escapeRegex(attr)}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
  if (attrPattern.test(tag)) {
    // Function-form replacement: `escaped` may contain `$`-pattern sequences
    return tag.replace(attrPattern, (_m, ws) => `${ws}${attr}="${escaped}"`);
  }
  // Attribute doesn't exist — insert before closing >
  return tag.replace(/(\/?>)$/, (_m, close) => ` ${attr}="${escaped}"${close}`);
}

function removeAttrInTag(tag: string, attr: string): string {
  const attrPattern = new RegExp(`\\s+${escapeRegex(attr)}\\s*=\\s*(?:"[^"]*"|'[^']*')`, "i");
  return tag.replace(attrPattern, "");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Kept in a plain JS module so the byte-preserving cleanup can be exercised by
// Node's built-in test runner without adding a second TypeScript test toolchain.
export { stripBrowserExtensionArtifacts } from "./htmlArtifactCleanup.js";

// ── Patch application ──────────────────────────────────────────

/**
 * Apply SavePatches to the original raw HTML and return the modified HTML.
 * Only the parts targeted by patches are changed; everything else is byte-identical.
 */
function shouldWrapForTemplateImport(html: string, patches: SavePatches, options?: ApplyPatchesOptions): boolean {
  if (!options?.allowDocumentScaffold) return false;

  const hasHtmlTag = /<html[\s>]/i.test(html);
  const hasHeadTag = /<head[\s>]/i.test(html) || /<\/head>/i.test(html);
  const hasBodyTag = /<body[\s>]/i.test(html);
  if (hasHtmlTag || hasHeadTag || hasBodyTag) return false;

  const hasTemplateStyles = patches.styleBlocks?.some((block) => /^gl-tpl-/.test(block.id)) ?? false;
  const hasTemplateScripts = patches.scriptBlocks?.some((block) => /^(gl-tpl-|glmw-script-)/.test(block.id)) ?? false;
  const hasTemplateLinks = patches.linkBlocks?.some((block) => /^gl-design-system-font/.test(block.id)) ?? false;

  return hasTemplateStyles || hasTemplateScripts || hasTemplateLinks;
}

export function applyPatches(html: string, patches: SavePatches, options?: ApplyPatchesOptions): string {
  let result = html;
  // Preserve fragment-shaped files by default, but allow wireframe/template import
  // to scaffold clean HTML fragments into a full document when explicitly enabled.
  if (shouldWrapForTemplateImport(result, patches, options)) {
    result = `<html><head>\n</head>\n<body>\n${result}\n</body></html>`;
  }

  // 1. Global class renames (simple text replacements in the whole file)
  for (const rename of patches.classRenames) {
    // Replace in class attributes: class="... oldName ..." → class="... newName ..."
    const oldCls = escapeRegex(rename.oldName);
    // In class attributes
    result = result.replace(
      new RegExp(`(class\\s*=\\s*")([^"]*\\b)${oldCls}(\\b[^"]*")`, "gi"),
      (m, pre, before, after) => pre + before + rename.newName + after
    );
    result = result.replace(
      new RegExp(`(class\\s*=\\s*')([^']*\\b)${oldCls}(\\b[^']*')`, "gi"),
      (m, pre, before, after) => pre + before + rename.newName + after
    );
    // In CSS selectors within <style> blocks
    result = result.replace(
      new RegExp(`\\.${oldCls}\\b`, "g"),
      "." + rename.newName
    );
  }

  // 1.6 Link edits — replace/remove <link> tags matched by href (e.g. stale
  // Google Fonts links after a font replacement). A plain string-level pass:
  // it must run before any element map is built (head edits shift body
  // offsets) and before linkBlocks so a link re-added in the same save isn't
  // deleted by its own removal edit.
  if (patches.linkEdits) {
    for (const edit of patches.linkEdits) {
      if (!edit.href) continue;
      // The DOM reports decoded hrefs while serialized HTML may contain &amp;
      const hrefPattern = escapeRegex(edit.href).replace(/&/g, "(?:&amp;|&)");
      const linkPattern = new RegExp(
        `<link\\b[^>]*href\\s*=\\s*["']?${hrefPattern}["']?[^>]*/?>\\n?`,
        "i"
      );
      result = result.replace(linkPattern, () => (edit.newOuterHTML ? edit.newOuterHTML + "\n" : ""));
    }
  }

  // Re-map after renames (positions may shift slightly)
  const mapAfterRenames = buildElementMap(result);

  // 1.5 Moves — apply sequentially by path (avoids embedding large data URLs in insertions)
  if (patches.moves && patches.moves.length > 0) {
    for (const mv of patches.moves) {
      const mapBeforeMove = buildElementMap(result);
      const source = mapBeforeMove.get(mv.sourcePath);
      if (!source) continue;

      const movedHtml = result.substring(source.openStart, source.closeEnd);
      const withoutSource = result.substring(0, source.openStart) + result.substring(source.closeEnd);

      const mapAfterSourceRemoval = buildElementMap(withoutSource);
      const parent = mapAfterSourceRemoval.get(mv.parentPath);
      if (!parent) {
        // Parent no longer exists; skip this move.
        result = withoutSource;
        continue;
      }

      const childMap = new Map<number, ElementPosition>();
      for (const [p, el] of mapAfterSourceRemoval) {
        if (p === mv.parentPath) continue;
        const parentPrefix = mv.parentPath ? mv.parentPath + "." : "";
        if (p.startsWith(parentPrefix) && !p.substring(parentPrefix.length).includes(".")) {
          const idx = parseInt(p.substring(parentPrefix.length), 10);
          childMap.set(idx, el);
        }
      }

      let insertPos: number;
      if (mv.position < 0 || mv.position >= childMap.size) {
        insertPos = parent.innerEnd;
      } else {
        const child = childMap.get(mv.position);
        insertPos = child ? child.openStart : parent.innerEnd;
      }

      result = withoutSource.substring(0, insertPos) + movedHtml + withoutSource.substring(insertPos);
    }
  }

  // 2. Deletions — collect positions, sort reverse, splice out
  const deletionOps: { start: number; end: number }[] = [];
  for (const path of patches.deletions) {
    const info = mapAfterRenames.get(path);
    if (!info) continue;
    deletionOps.push({ start: info.openStart, end: info.closeEnd });
  }
  deletionOps.sort((a, b) => b.start - a.start);
  for (const op of deletionOps) {
    result = result.substring(0, op.start) + result.substring(op.end);
  }

  // Re-map again after deletions
  const mapAfterDeletions = buildElementMap(result);

  // 3. Element patches — sort by position descending to avoid offset shifts
  const sortedEls = [...patches.elements].sort((a, b) => {
    const ai = mapAfterDeletions.get(a.path)?.openStart ?? 0;
    const bi = mapAfterDeletions.get(b.path)?.openStart ?? 0;
    return bi - ai;
  });

  for (const patch of sortedEls) {
    const info = mapAfterDeletions.get(patch.path);
    if (!info) continue;

    // Tag change — replace tag name in opening and closing tags
    if (patch.newTag) {
      // Closing tag
      if (info.innerEnd < info.closeEnd) {
        const closeTag = result.substring(info.innerEnd, info.closeEnd);
        const newClose = closeTag.replace(/<\/[a-zA-Z][a-zA-Z0-9-]*/i, "</" + patch.newTag);
        result = result.substring(0, info.innerEnd) + newClose + result.substring(info.closeEnd);
      }
      // Opening tag
      const openTag = result.substring(info.openStart, info.openEnd);
      const newOpen = openTag.replace(/<[a-zA-Z][a-zA-Z0-9-]*/i, "<" + patch.newTag);
      result = result.substring(0, info.openStart) + newOpen + result.substring(info.openEnd);
      // Recalculate info.openEnd in case tag name length changed
      const lenDiff = newOpen.length - openTag.length;
      info.openEnd += lenDiff;
      info.innerStart += lenDiff;
    }

    // Attribute changes on the opening tag
    let openTag = result.substring(info.openStart, info.openEnd);
    if (patch.setAttrs) {
      for (const [attr, value] of Object.entries(patch.setAttrs)) {
        if (value === "") {
          openTag = removeAttrInTag(openTag, attr);
        } else {
          openTag = setAttrInTag(openTag, attr, value);
        }
      }
    }
    if (patch.removeAttrs) {
      for (const attr of patch.removeAttrs) {
        openTag = removeAttrInTag(openTag, attr);
      }
    }
    result = result.substring(0, info.openStart) + openTag + result.substring(info.openEnd);
    const openLenDiff = openTag.length - (info.openEnd - info.openStart);

    // innerHTML change
    if (patch.innerHTML !== undefined) {
      const innerStart = info.innerStart + openLenDiff;
      const innerEnd = info.innerEnd + openLenDiff;
      result = result.substring(0, innerStart) + patch.innerHTML + result.substring(innerEnd);
    }
  }

  // Re-map after element patches for insertions
  const mapForInsertions = buildElementMap(result);

  // 4. Insertions — sort by position descending
  const sortedInsertions = [...patches.insertions].sort((a, b) => {
    const parentA = mapForInsertions.get(a.parentPath);
    const parentB = mapForInsertions.get(b.parentPath);
    return (parentB?.innerStart ?? 0) - (parentA?.innerStart ?? 0);
  });

  for (const ins of sortedInsertions) {
    const parent = mapForInsertions.get(ins.parentPath);
    if (!parent) continue;

    // Find the insertion point: before the Nth editable child, or at innerEnd
    const childMap = new Map<number, ElementPosition>();
    for (const [p, el] of mapForInsertions) {
      // Direct children of this parent
      if (p === ins.parentPath) continue;
      const parentPrefix = ins.parentPath ? ins.parentPath + "." : "";
      if (p.startsWith(parentPrefix) && !p.substring(parentPrefix.length).includes(".")) {
        const idx = parseInt(p.substring(parentPrefix.length), 10);
        childMap.set(idx, el);
      }
    }

    let insertPos: number;
    if (ins.position < 0 || ins.position >= childMap.size) {
      insertPos = parent.innerEnd;
    } else {
      const child = childMap.get(ins.position);
      insertPos = child ? child.openStart : parent.innerEnd;
    }

    result = result.substring(0, insertPos) + ins.html + result.substring(insertPos);
  }

  // 4b. Link blocks — inject or replace gl-design-system-font-* <link> tags in <head>
  if (patches.linkBlocks) {
    for (const link of patches.linkBlocks) {
      if (!link.outerHTML.trim()) continue;
      // Check if it already exists by ID
      const existingLinkPattern = new RegExp(
        `<link\\s[^>]*id\\s*=\\s*"${escapeRegex(link.id)}"[^>]*/?>\\n?`,
        "i"
      );
      if (existingLinkPattern.test(result)) {
        result = result.replace(existingLinkPattern, link.outerHTML + "\n");
      } else {
        // Insert before first <style> or before </head>
        const firstStyleMatch = result.match(/<style[\s>]/i);
        if (firstStyleMatch && firstStyleMatch.index !== undefined) {
          result = result.substring(0, firstStyleMatch.index) + link.outerHTML + "\n" + result.substring(firstStyleMatch.index);
        } else {
          const headClose = result.indexOf("</head>");
          if (headClose !== -1) {
            result = result.substring(0, headClose) + link.outerHTML + "\n" + result.substring(headClose);
          } else {
            result = link.outerHTML + "\n" + result;
          }
        }
      }
    }
  }

  // 5. Style blocks — remove, then inject or replace in <head>
  if (patches.removedStyleBlockIds) {
    for (const styleId of patches.removedStyleBlockIds) {
      const removePattern = new RegExp(
        `<style\\s+id\\s*=\\s*"${escapeRegex(styleId)}"[^>]*>[\\s\\S]*?<\\/style>\\n?`,
        "i"
      );
      result = result.replace(removePattern, "");
    }
  }

  for (const block of patches.styleBlocks) {
    if (!block.css.trim()) continue;
    const styleTag = `<style id="${block.id}">\n${block.css}</style>`;

    // Check if it already exists
    const existingPattern = new RegExp(
      `<style\\s+id\\s*=\\s*"${escapeRegex(block.id)}"[^>]*>[\\s\\S]*?<\\/style>`,
      "i"
    );
    if (existingPattern.test(result)) {
      result = result.replace(existingPattern, styleTag);
    } else if (block.id === "gl-design-system-variables") {
      // Design system variables go before the first <style> in <head> (after all <link>/<meta>)
      const firstStyleMatch = result.match(/<style[\s>]/i);
      if (firstStyleMatch && firstStyleMatch.index !== undefined) {
        result = result.substring(0, firstStyleMatch.index) + styleTag + "\n" + result.substring(firstStyleMatch.index);
      } else {
        // No <style> tags exist — inject before </head> or at start
        const headClose = result.indexOf("</head>");
        if (headClose !== -1) {
          result = result.substring(0, headClose) + styleTag + "\n" + result.substring(headClose);
        } else {
          result = styleTag + "\n" + result;
        }
      }
    } else {
      // Inject before </head>
      const headClose = result.indexOf("</head>");
      if (headClose !== -1) {
        result = result.substring(0, headClose) + styleTag + "\n" + result.substring(headClose);
      } else {
        // No </head> — inject before first <body> or at start
        const bodyMatch = result.match(/<body[\s>]/i);
        if (bodyMatch && bodyMatch.index !== undefined) {
          result = result.substring(0, bodyMatch.index) + styleTag + "\n" + result.substring(bodyMatch.index);
        } else {
          result = styleTag + "\n" + result;
        }
      }
    }
  }

  // 5b. User style edits — find original <style> content and replace
  // Uses plain string search to avoid regex errors on large CSS blocks
  // with special characters like ( ) * . { } from comments and values.
  if (patches.userStyleEdits) {
    for (const edit of patches.userStyleEdits) {
      if (!edit.originalText?.trim() || !edit.newCss?.trim()) continue;
      const originalTrimmed = edit.originalText.trim();

      // Fast path: exact substring match
      const idx = result.indexOf(originalTrimmed);
      if (idx !== -1) {
        result = result.slice(0, idx) + edit.newCss + result.slice(idx + originalTrimmed.length);
        continue;
      }

      // Fallback: find the <style> block whose whitespace-normalised content matches,
      // then replace just its inner content (handles minor whitespace diffs).
      const styleRe = /(<style(?:\s[^>]*)?>)([\s\S]*?)(<\/style>)/gi;
      const normalizedOriginal = originalTrimmed.replace(/\s+/g, " ");
      let m: RegExpExecArray | null;
      let replaced = false;
      while (!replaced && (m = styleRe.exec(result)) !== null) {
        if (m[2].trim().replace(/\s+/g, " ") === normalizedOriginal) {
          result =
            result.slice(0, m.index + m[1].length) +
            "\n" + edit.newCss + "\n" +
            result.slice(m.index + m[1].length + m[2].length);
          replaced = true;
        }
      }
    }
  }

  // 6. Script blocks — inject or replace before </body>
  if (patches.scriptBlocks) {
    for (const block of patches.scriptBlocks) {
      if (!block.content.trim()) {
        // Empty content means remove the script if it exists
        const removePattern = new RegExp(
          `<script\\s+id\\s*=\\s*"${escapeRegex(block.id)}"[^>]*>[\\s\\S]*?<\\/script>\\n?`,
          "i"
        );
        result = result.replace(removePattern, "");
        continue;
      }
      const scriptTag = `<script id="${block.id}">\n${block.content}</script>`;

      const existingScriptPattern = new RegExp(
        `<script\\s+id\\s*=\\s*"${escapeRegex(block.id)}"[^>]*>[\\s\\S]*?<\\/script>`,
        "i"
      );
      if (existingScriptPattern.test(result)) {
        result = result.replace(existingScriptPattern, scriptTag);
      } else {
        // Inject before </body>
        const bodyClose = result.indexOf("</body>");
        if (bodyClose !== -1) {
          result = result.substring(0, bodyClose) + scriptTag + "\n" + result.substring(bodyClose);
        } else {
          // No </body> — append at end
          result += "\n" + scriptTag;
        }
      }
    }
  }

  return result;
}
